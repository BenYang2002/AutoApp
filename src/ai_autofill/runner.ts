import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import type { Page } from "playwright";
import TurndownService from "turndown";
import type {
  AutofillConfig,
  AutofillAdapter,
  CheckStatusConfig,
} from "./types.js";
import { extractApplicationForm } from "../application_extraction/extractApplicationForm.js";
import type { ExtractedApplicationField } from "../application_extraction/extractApplicationForm.js";
import { executeAutofill } from "./filler.js";
import { getVerificationCode } from "../email_verification/index.js";

const DEBUG_DIR = join(process.cwd(), "debug_fields");

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

async function extractPageMarkdown(page: Page, scopeSelector = "body"): Promise<string> {
  const html = await page.locator(scopeSelector).first().innerHTML();
  return turndown.turndown(html);
}

async function waitForContentChange(
  page: Page,
  prevHtml: string,
  scopeSelector = "body",
  timeout = 8000,
): Promise<void> {
  await Promise.race([
    page.waitForLoadState("domcontentloaded", { timeout }),
    page.waitForFunction(
      ({ prev, sel }: { prev: string; sel: string }) => {
        const el = document.querySelector(sel);
        return el ? el.innerHTML !== prev : document.body.innerHTML !== prev;
      },
      { prev: prevHtml, sel: scopeSelector },
      { timeout },
    ),
  ]).catch(() => {});
  await page.waitForTimeout(300);
}

async function detectSuccess(page: Page): Promise<boolean> {
  try {
    const text = (
      await page.locator("body").innerText({ timeout: 3000 })
    ).toLowerCase();
    return /application submitted|thank you for applying|we('ve| have) received|successfully submitted|your application (has been|was) (submitted|received)/i.test(
      text,
    );
  } catch {
    return false;
  }
}

export async function runAutofillSession(
  page: Page,
  jdId: string,
  config: AutofillConfig,
  checkStatusConfig: CheckStatusConfig,
  adapter: AutofillAdapter,
  extractForm: (
    page: Page,
  ) => Promise<ExtractedApplicationField[]> = extractApplicationForm,
  scopeSelector = "body",
): Promise<"success" | "stuck" | "failed"> {
  await mkdir(DEBUG_DIR, { recursive: true });

  let stuckCount = 0;

  for (let pageNum = 1; pageNum <= config.maxPages; pageNum++) {
    console.log(`\n[autofill] ── Page ${pageNum} ──`);

    await page
      .waitForLoadState("domcontentloaded", { timeout: 10000 })
      .catch(() => {});
    await page.waitForTimeout(300);

    if (await detectSuccess(page)) {
      console.log("[autofill] Application submitted successfully!");
      return "success";
    }

    const pageMarkdown = await extractPageMarkdown(page, scopeSelector);
    let fields = await extractForm(page);

    console.log(`[autofill] Planning ${fields.length} fields...`);
    let instructions: Awaited<ReturnType<typeof adapter.plan>>;
    try {
      instructions = await adapter.plan(fields, pageMarkdown, config);
    } catch {
      console.warn(
        "[autofill] Failed to get valid instructions after retries, skipping application",
      );
      return "failed";
    }
    console.log(`[autofill] Got ${instructions.length} instructions`);

    const executeStartTime = new Date();
    const preExecHtml = await page.locator(scopeSelector).first().innerHTML();
    let failed = await executeAutofill(page, fields, instructions);

    await waitForContentChange(page, preExecHtml, scopeSelector);

    const postFillMarkdown = await extractPageMarkdown(page, scopeSelector);
    const pageStatus = await adapter.checkPageStatus(
      pageMarkdown,
      postFillMarkdown,
      checkStatusConfig,
    );
    console.log(`[autofill] Page status: ${pageStatus}`);

    if (pageStatus === "success") {
      console.log("[autofill] Application submitted successfully!");
      return "success";
    } else if (pageStatus === "continue") {
      stuckCount = 0;
    } else if (pageStatus === "verification") {
      console.log(
        "[autofill] Verification code required — fetching from Gmail...",
      );
      const { status, code } = await getVerificationCode(executeStartTime);
      if (!status) {
        console.warn(
          "[autofill] Could not retrieve verification code — failing application",
        );
        return "failed";
      }
      fields = await extractForm(page);
      const verifyInstructions = await adapter.planVerification(
        fields,
        code,
        postFillMarkdown,
        config,
      );
      if (verifyInstructions.length > 0) {
        await writeFile(
          join(DEBUG_DIR, `page${pageNum}_${jdId}_verification.json`),
          JSON.stringify(verifyInstructions, null, 2),
          "utf-8",
        );
        failed = await executeAutofill(page, fields, verifyInstructions);
      }
      stuckCount = 0;
    } else {
      // error — still on same page, try to revise
      stuckCount++;
      console.log(
        `[autofill] Still on same page with errors (stuck=${stuckCount})`,
      );

      if (stuckCount >= 2) {
        console.warn("[autofill] Stuck 2 times — abandoning application");
        return "stuck";
      }

      fields = await extractForm(page);
      const revised = await adapter.revise(
        failed,
        fields,
        postFillMarkdown,
        config,
      );

      if (revised.length > 0) {
        await writeFile(
          join(DEBUG_DIR, `page${pageNum}_${jdId}_revised.json`),
          JSON.stringify(revised, null, 2),
          "utf-8",
        );
        const preReviseHtml = await page.locator(scopeSelector).first().innerHTML();
        failed = await executeAutofill(page, fields, revised);
        await waitForContentChange(page, preReviseHtml, scopeSelector);
      }

      const postReviseMarkdown = await extractPageMarkdown(page, scopeSelector);
      const reviseStatus = await adapter.checkPageStatus(
        postFillMarkdown,
        postReviseMarkdown,
        checkStatusConfig,
      );
      console.log(`[autofill] Post-revise status: ${reviseStatus}`);

      if (reviseStatus === "success") {
        console.log("[autofill] Application submitted after revise!");
        return "success";
      } else if (reviseStatus === "continue") {
        stuckCount = 0;
      }
      // if still error, fall through — stuckCount stays incremented for next iteration
    }

    if (failed.length > 0) {
      console.warn(`[autofill] ${failed.length} instruction(s) still failing:`);
      failed.forEach((f) =>
        console.warn(`  • ${f.instruction.key}: ${f.reason}`),
      );
    }
  }

  console.warn(
    `[autofill] Reached max pages (${config.maxPages}) without submitting`,
  );
  return "failed";
}
