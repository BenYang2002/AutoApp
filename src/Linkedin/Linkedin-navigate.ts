import type { Page } from "playwright";
import { judgeJD } from "../ai_judge/index.js";
import { scrapeJobDetail } from "./Linkedin-jd.js";
import { saveJD, saveAIResult } from "../storage/linkedin.js";

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
      console.log(JSON.stringify(result, null, 2));

      saveJD(jdId, jdMarkdown);
      saveAIResult(jdId, result);
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