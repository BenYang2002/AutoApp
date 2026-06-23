import { chromium } from "playwright";
import "dotenv/config";
import { login } from "./Linkedin/Linkedin-auth.js";
import { navigateToJobs } from "./Linkedin/Linkedin-jobs.js";
import { navigateThroughJobs } from "./Linkedin/Linkedin-navigate.js";

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();

  await login(page);
  await navigateToJobs(page);
  await navigateThroughJobs(page);
}

main();
