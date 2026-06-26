import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import type { Page } from "playwright";
import TurndownService from "turndown";
import type { AutofillConfig, AutofillAdapter, CheckStatusConfig } from "./types.js";
import { extractApplicationForm } from "../application_extraction/extractApplicationForm.js";
import { executeAutofill } from "./filler.js";
import { getVerificationCode } from "../email_verification/index.js";

const DEBUG_DIR = join(process.cwd(), "debug_fields");

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

async function extractPageMarkdown(page: Page): Promise<string> {
  const html = await page.locator("body").innerHTML();
  return turndown.turndown(html);
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
): Promise<"success" | "stuck" | "failed"> {
  await mkdir(DEBUG_DIR, { recursive: true });

  let stuckCount = 0;

  for (let pageNum = 1; pageNum <= config.maxPages; pageNum++) {
    console.log(`\n[autofill] ── Page ${pageNum} ──`);

    await page
      .waitForLoadState("domcontentloaded", { timeout: 10000 })
      .catch(() => {});
    await page.waitForTimeout(500);

    if (await detectSuccess(page)) {
      console.log("[autofill] Application submitted successfully!");
      return "success";
    }

    const pageMarkdown = await extractPageMarkdown(page);
    let fields = await extractApplicationForm(page);

    console.log(`[autofill] Planning ${fields.length} fields...`);
    const instructions = await adapter.plan(fields, pageMarkdown, config);
    console.log(`[autofill] Got ${instructions.length} instructions`);

    const executeStartTime = new Date();
    let failed = await executeAutofill(page, fields, instructions);

    // Wait for any navigation triggered by actions before checking status
    await page
      .waitForLoadState("domcontentloaded", { timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(800);

    const postFillMarkdown = await extractPageMarkdown(page);
    const pageStatus = await adapter.checkPageStatus(pageMarkdown, postFillMarkdown, checkStatusConfig);
    console.log(`[autofill] Page status: ${pageStatus}`);

    if (pageStatus === "success") {
      console.log("[autofill] Application submitted successfully!");
      return "success";
    } else if (pageStatus === "continue") {
      stuckCount = 0;
    } else if (pageStatus === "verification") {
      console.log("[autofill] Verification code required — fetching from Gmail...");
      const { status, code } = await getVerificationCode(executeStartTime);
      if (!status) {
        console.warn("[autofill] Could not retrieve verification code — failing application");
        return "failed";
      }
      fields = await extractApplicationForm(page);
      const verifyInstructions = await adapter.planVerification(fields, code, postFillMarkdown, config);
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

      fields = await extractApplicationForm(page);
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
        failed = await executeAutofill(page, fields, revised);

        await page
          .waitForLoadState("domcontentloaded", { timeout: 8000 })
          .catch(() => {});
        await page.waitForTimeout(800);
      }

      const postReviseMarkdown = await extractPageMarkdown(page);
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
      console.warn(
        `[autofill] ${failed.length} instruction(s) still failing:`,
      );
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