import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { readFileSync } from "fs";
import type { Page } from "playwright";
import TurndownService from "turndown";
import type {
  AutofillConfig,
  AutofillAdapter,
} from "./types.js";
import { extractApplicationForm } from "../application_extraction/extractApplicationForm.js";
import { executeAutofill } from "./filler.js";

const DEBUG_DIR = join(process.cwd(), "debug_fields");

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

async function extractPageMarkdown(page: Page): Promise<string> {
  const html = await page.locator("body").innerHTML();
  return turndown.turndown(html);
}

const LOGIN_WALL_RE =
  /\b(sign in to apply|log in to apply|create an account to apply|register to apply|login required|please sign in|please log in|you must be (signed|logged) in)\b/i;

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

async function detectValidationErrors(page: Page): Promise<boolean> {
  try {
    const invalid = await page.locator('[aria-invalid="true"]').count();
    if (invalid > 0) return true;
    const alerts = await page
      .locator('[role="alert"]:visible, .error:visible, .field-error:visible')
      .count();
    return alerts > 0;
  } catch {
    return false;
  }
}

export async function runAutofillSession(
  page: Page,
  jdId: string,
  config: AutofillConfig,
  adapter: AutofillAdapter,
): Promise<"success" | "stuck" | "failed"> {
  await mkdir(DEBUG_DIR, { recursive: true });

  let stuckCount = 0;

  for (let pageNum = 1; pageNum <= config.maxPages; pageNum++) {
    console.log(`\n[autofill] ── Page ${pageNum} ──`);

    // Wait for the page to settle before extracting
    await page
      .waitForLoadState("domcontentloaded", { timeout: 10000 })
      .catch(() => {});
    await page.waitForTimeout(500);

    if (await detectSuccess(page)) {
      console.log("[autofill] Application submitted successfully!");
      return "success";
    }

    const pageMarkdown = await extractPageMarkdown(page);

    if (LOGIN_WALL_RE.test(pageMarkdown)) {
      console.log("[autofill] Login/register wall detected — skipping application");
      return "failed";
    }

    await writeFile(
      join(DEBUG_DIR, `page${pageNum}_${jdId}_page.md`),
      pageMarkdown,
      "utf-8",
    );

    const fields = await extractApplicationForm(page);

    console.log(`[autofill] Planning ${fields.length} fields...`);
    let instructions = await adapter.plan(fields, pageMarkdown, config);
    console.log(`[autofill] Got ${instructions.length} instructions`);

    await writeFile(
      join(DEBUG_DIR, `page${pageNum}_${jdId}_instructions.json`),
      JSON.stringify(instructions, null, 2),
      "utf-8",
    );

    // Execute instructions
    let failed = await executeAutofill(page, fields, instructions);

    // Error recovery: if fields failed and the page shows validation errors, ask AI to revise
    if (failed.length > 0 && (await detectValidationErrors(page))) {
      stuckCount++;
      console.log(
        `[autofill] ${failed.length} failed + validation errors — asking AI to revise (stuck=${stuckCount})`,
      );

      if (stuckCount >= 2) {
        console.warn("[autofill] Stuck 2 times — abandoning application");
        return "stuck";
      }

      const errorMarkdown = await extractPageMarkdown(page);
      const revised = await adapter.revise(
        failed,
        fields,
        errorMarkdown,
        config,
      );

      if (revised.length > 0) {
        await writeFile(
          join(DEBUG_DIR, `page${pageNum}_${jdId}_revised.json`),
          JSON.stringify(revised, null, 2),
          "utf-8",
        );
        failed = await executeAutofill(page, fields, revised);
      }
    } else {
      stuckCount = 0;
    }

    if (failed.length > 0) {
      console.warn(
        `[autofill] ${failed.length} instruction(s) still failing after retry:`,
      );
      failed.forEach((f) =>
        console.warn(`  • ${f.instruction.key}: ${f.reason}`),
      );
    }

    // Wait for any navigation triggered by the "click" action
    await page
      .waitForLoadState("domcontentloaded", { timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(800);

    // Check success after the click
    if (await detectSuccess(page)) {
      console.log("[autofill] Application submitted successfully!");
      return "success";
    }
  }

  console.warn(
    `[autofill] Reached max pages (${config.maxPages}) without submitting`,
  );
  return "failed";
}
