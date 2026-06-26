import type { Page } from "playwright";
import { expect } from "@playwright/test";

export async function navigateToJobs(page: Page) {
  const searchBox = page
    .locator('input[data-testid="typeahead-input"]')
    .first();
  await searchBox.click();
  await searchBox.pressSequentially("Fullstack Engineer, Entry Level", {
    delay: 50,
  });
  await searchBox.press("Enter");
  await page.waitForURL(/results/);
  await page.locator('[aria-label="Filter by Jobs"]').nth(1).click();
}
