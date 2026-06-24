import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import type { Page } from "playwright";
import { judgeJD } from "../ai_judge/index.js";
import { scrapeJobDetail } from "./Linkedin-jd.js";
import { saveJDToDB, saveAIResultToDB } from "../db/linkedin.js";
import { extractApplicationForm } from "../application_extraction/extractApplicationForm.js";

export async function navigateThroughJobs(page: Page) {
  while (true) {
    const lazyColumn = page.locator(
      '[data-testid="lazy-column"][componentkey="SearchResultsMainContent"]',
    );
    const jobButtons = lazyColumn.locator(
      'div[role="button"][componentkey^="job-card-component-ref-"]',
    );
    await jobButtons.first().waitFor({ state: "visible" });
    const jobCount = await jobButtons.count();
    console.log(`Found ${jobCount} jobs on this page`);

    for (let i = 0; i < jobCount; i++) {
      console.log(`Clicking job ${i + 1} of ${jobCount}`);
      const detail = await scrapeJobDetail(page, jobButtons.nth(i));
      if (!detail) {
        console.log("No 'About the job' section, skipping");
        continue;
      }

      const { jdId, jdMarkdown } = detail;
      const result = await judgeJD(jdId, jdMarkdown);
      if (!result) {
        console.log("No AI result, skipping");
        continue;
      }
      if (result.decision === "skip") {
        console.log("Skipping job");
        continue;
      }
      const preClickUrl = page.url();
      const applyButton = page.locator(
        '#jobs-apply-button-id, a[aria-label="Apply on company website"]',
      );
      if ((await applyButton.count()) === 0) {
        console.log("No 'Apply' button, skipping");
        continue;
      }

      // Listen for a new tab BEFORE clicking — if the button opens a new window
      // the event fires immediately on click and would be missed otherwise.
      const newTabPromise = page
        .context()
        .waitForEvent("page", { timeout: 5000 })
        .catch(() => null);

      await applyButton.first().click();

      const newTab = await newTabPromise;
      let targetPage: Page;

      if (newTab) {
        // Button opened a new tab — wait for it to finish loading
        await newTab.waitForLoadState("domcontentloaded");
        console.log(`Application page URL (new tab): ${newTab.url()}`);
        targetPage = newTab;
      } else {
        // Same-page navigation or modal (LinkedIn Easy Apply)
        await page
          .waitForURL((url) => url.toString() !== preClickUrl, {
            timeout: 10000,
          })
          .catch(() =>
            console.log("URL did not change — may be an in-page modal"),
          );
        console.log(`Application page URL: ${page.url()}`);
        targetPage = page;
      }

      // Extract form fields and save to JSON for inspection
      const fields = await extractApplicationForm(targetPage);
      console.log(`\n=== Extracted ${fields.length} fields ===`);
      const outDir = join(process.cwd(), "debug_fields");
      await mkdir(outDir, { recursive: true });
      const outPath = join(outDir, `fields_${jdId}.json`);
      await writeFile(outPath, JSON.stringify(fields, null, 2), "utf-8");
      const screenshotBuffer = await page.screenshot({
        fullPage: true,
        type: "jpeg",
        quality: 80,
      });
      const dataUrl = `data:image/jpeg;base64,${screenshotBuffer.toString("base64")}`;

      await saveJDToDB(jdId, jdMarkdown);
      await saveAIResultToDB(result);

      console.log(`Saved JD ${jdId}`);

      await page.waitForTimeout(1000);
    }

    const nextButton = page.locator(
      '[data-testid="pagination-controls-next-button-visible"]',
    );
    console.log(`Next button count: ${await nextButton.count()}`);
    if ((await nextButton.count()) === 0) break;
    await nextButton.click();
    console.log("Navigated to the next page of jobs");
  }
}
