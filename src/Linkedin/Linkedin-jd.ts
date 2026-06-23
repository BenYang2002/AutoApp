import type { Page, Locator } from "playwright";
import TurndownService from "turndown";

const turndown = new TurndownService();

export interface JobDetail {
  jdId: string;
  jdMarkdown: string;
}

export async function scrapeJobDetail(
  page: Page,
  jobCard: Locator,
): Promise<JobDetail | null> {
  const oldUrl = page.url();
  await jobCard.click();
  await page
    .waitForURL((url) => url.toString() !== oldUrl, { timeout: 5000 })
    .catch(() => {});

  const aboutTitle = page.getByText("About the job", { exact: true });
  const appeared = await aboutTitle
    .waitFor({ state: "attached", timeout: 10000 })
    .then(() => true)
    .catch(() => false);

  if (!appeared) return null;

  const jd = aboutTitle.locator("xpath=../..");

  const moreButton = jd.locator('[data-testid="expandable-text-button"]');
  if ((await moreButton.count()) > 0) {
    await moreButton.first().dispatchEvent("click");
    await page.waitForTimeout(500);
  }

  const jdId = new URL(page.url()).searchParams.get("currentJobId") ?? "";
  const jdHtml = await jd.innerHTML();
  const jdMarkdown = turndown.turndown(jdHtml);

  return { jdId, jdMarkdown };
}