import type { Page } from "playwright";

export async function navigateThroughJobs(page: Page) {
  while (true) {
    const lazyColumn = page.locator(
      '[data-testid="lazy-column"][componentkey="SearchResultsMainContent"]',
    );
    const jobButtons = lazyColumn.locator(
      'div[role="button"][componentkey^="job-card-component-ref-"]',
    );
    // Wait until at least one card is in the DOM before proceeding
    await jobButtons.first().waitFor({ state: "visible" });
    const jobCount = await jobButtons.count();
    console.log(`Found ${jobCount} jobs on this page`);
    for (let i = 0; i < jobCount; i++) {
      console.log(`Clicking job ${i + 1} of ${jobCount}`);
      const job = jobButtons.nth(i);
      const text = await job.innerText();
      const oldUrl = page.url();
      await job.click();
      await page
        .waitForURL((url) => url.toString() !== oldUrl, { timeout: 5000 })
        .catch(() => {});

      const aboutTitle = page.getByText("About the job", { exact: true });

      const appeared = await aboutTitle
        .waitFor({ state: "attached", timeout: 10000 })
        .then(() => true)
        .catch(() => false);

      if (!appeared) {
        console.log("No 'About the job' section, skipping");
        continue;
      }

      const jd = aboutTitle.locator("xpath=../following-sibling::*[1]");
      console.log(await jd.innerText());
      await page.waitForTimeout(1000); // Wait for 1 second before proceeding to the next job
    }
    let nextButton = page.locator(
      '[data-testid="pagination-controls-next-button-visible"]',
    );
    console.log(`Next button count: ${await nextButton.count()}`);
    if ((await nextButton.count()) === 0) {
      break;
    }
    await nextButton.click();
    console.log("Navigated to the next page of jobs");
  }
}
