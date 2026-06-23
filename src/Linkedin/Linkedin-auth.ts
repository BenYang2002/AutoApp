import type { Page } from "playwright";

export async function login(page: Page) {
  const email = process.env.LINKEDIN_EMAIL;
  const password = process.env.LINKEDIN_PASSWORD;
  if (!email || !password)
    throw new Error("LINKEDIN_EMAIL and LINKEDIN_PASSWORD must be set");

  await page.goto("https://www.linkedin.com/?locale=en_US");
  await page.locator('[data-test-id="home-hero-sign-in-cta"]').click();
  await page.locator('input[autocomplete="username webauthn"]').fill(email);
  await page
    .locator('input[autocomplete="current-password"]')
    .nth(1)
    .fill(password);
  await page
    .getByRole("button", { name: /登录|Sign in/i, exact: true })
    .last()
    .click();
  await page.waitForURL(/feed/);
}
