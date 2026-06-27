import type { Page } from "playwright";
import type { JudgeResult } from "../ai_judge/index.js";
import {
  saveJDToDB,
  saveAIResultToDB,
  recordAppliedJob,
} from "../db/linkedin.js";
import { autofillApplication } from "../ai_autofill/index.js";
import { extractEasyApplyForm, MODAL_SELECTOR } from "./extractEasyApplyForm.js";

async function resolveApplicationPage(
  page: Page,
): Promise<{ appPage: Page; isNewTab: boolean; isEasyApply: boolean } | null> {
  const easyApplyBtn = page.locator(
    '[aria-label^="Easy Apply"], [aria-label="Easy Apply to this job"]',
  );
  const companyApplyBtn = page.locator('[aria-label*="on company website"]');

  const easyCount = await easyApplyBtn.count();
  for (let i = 0; i < easyCount; i++) {
    console.log(
      `[debug] easyApplyBtn[${i}]:`,
      await easyApplyBtn.nth(i).evaluate((el) => el.outerHTML),
    );
  }

  if (easyCount > 0) {
    console.log("[apply] Easy Apply");
    await easyApplyBtn.first().click();
    await page.waitForTimeout(5000);
    const modalAppeared = await page
      .locator(
        '.jobs-easy-apply-modal__content, [data-test-modal-id="easy-apply-modal"]',
      )
      .first()
      .waitFor({ state: "attached", timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (!modalAppeared) {
      console.log("[apply] Easy Apply modal did not open, skipping");
      return null;
    }
    return { appPage: page, isNewTab: false, isEasyApply: true };
  }

  if ((await companyApplyBtn.count()) === 0) {
    console.log("No Apply button found, skipping");
    return null;
  }

  console.log("[apply] Company website apply");
  const preClickUrl = page.url();
  const newTabPromise = page
    .context()
    .waitForEvent("page", { timeout: 5000 })
    .catch(() => null);

  await companyApplyBtn.first().click();

  const newTab = await newTabPromise;
  if (newTab) {
    await newTab.waitForLoadState("domcontentloaded");
    console.log(`[apply] Application page (new tab): ${newTab.url()}`);
    return { appPage: newTab, isNewTab: true, isEasyApply: false };
  }

  await page
    .waitForURL((url) => url.toString() !== preClickUrl, { timeout: 10000 })
    .catch(() => console.log("[apply] URL did not change"));
  console.log(`[apply] Application page: ${page.url()}`);
  return { appPage: page, isNewTab: false, isEasyApply: false };
}

export async function applyToJob(
  page: Page,
  jdId: string,
  jdMarkdown: string,
  result: JudgeResult,
): Promise<void> {
  const resolved = await resolveApplicationPage(page);
  if (!resolved) return;

  const { appPage, isNewTab, isEasyApply } = resolved;

  await saveJDToDB(jdId, jdMarkdown);
  await saveAIResultToDB(result);

  const outcome = await autofillApplication(
    appPage,
    jdId,
    isEasyApply ? extractEasyApplyForm : undefined,
    isEasyApply ? MODAL_SELECTOR : "body",
  );
  console.log(`[apply] JD ${jdId} — autofill outcome: ${outcome}`);

  if (outcome === "success") {
    await recordAppliedJob(jdId);
    console.log(`[apply] JD ${jdId} recorded as applied`);
  }

  if (isNewTab) {
    await appPage.close().catch(() => {});
  } else if (!isEasyApply && outcome !== "success") {
    await page.goBack().catch(() => {});
  }
  // Easy Apply: modal closes on its own
}
