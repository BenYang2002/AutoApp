import type { Page } from "playwright";
import type { JudgeResult } from "../ai_judge/index.js";
import { saveJDToDB, saveAIResultToDB, recordAppliedJob } from "../db/linkedin.js";
import { autofillApplication } from "../ai_autofill/index.js";

async function resolveApplicationPage(
  page: Page,
): Promise<{ appPage: Page; isNewTab: boolean } | null> {
  const preClickUrl = page.url();

  const applyButton = page.locator(
    '#jobs-apply-button-id, a[aria-label="Apply on company website"]',
  );
  if ((await applyButton.count()) === 0) {
    console.log("No 'Apply' button, skipping");
    return null;
  }

  const newTabPromise = page
    .context()
    .waitForEvent("page", { timeout: 5000 })
    .catch(() => null);

  await applyButton.first().click();

  const newTab = await newTabPromise;

  if (newTab) {
    await newTab.waitForLoadState("domcontentloaded");
    console.log(`Application page (new tab): ${newTab.url()}`);
    return { appPage: newTab, isNewTab: true };
  }

  await page
    .waitForURL((url) => url.toString() !== preClickUrl, { timeout: 10000 })
    .catch(() => console.log("URL did not change — may be an in-page modal"));
  console.log(`Application page: ${page.url()}`);
  return { appPage: page, isNewTab: false };
}

export async function applyToJob(
  page: Page,
  jdId: string,
  jdMarkdown: string,
  result: JudgeResult,
): Promise<void> {
  const resolved = await resolveApplicationPage(page);
  if (!resolved) return;

  const { appPage, isNewTab } = resolved;

  await saveJDToDB(jdId, jdMarkdown);
  await saveAIResultToDB(result);

  const outcome = await autofillApplication(appPage, jdId);
  console.log(`[apply] JD ${jdId} — autofill outcome: ${outcome}`);

  if (outcome === "success") {
    await recordAppliedJob(jdId);
    console.log(`[apply] JD ${jdId} recorded as applied`);
  }

  // Return to the LinkedIn jobs page so the navigator can continue
  if (isNewTab) {
    await appPage.close().catch(() => {});
  } else if (outcome !== "success") {
    await page.goBack().catch(() => {});
  }
}
