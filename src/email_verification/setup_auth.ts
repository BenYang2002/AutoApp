/**
 * One-time script to authorize Gmail access and save token.json.
 * Run once: tsx src/email_verification/setup_auth.ts
 */
import { writeFileSync } from "fs";
import { join } from "path";
import * as readline from "readline";
import { createOAuth2Client, GMAIL_SCOPES } from "./gmail.js";

const TOKEN_PATH = join(process.cwd(), "token.json");

const auth = createOAuth2Client();

const authUrl = auth.generateAuthUrl({
  access_type: "offline",
  scope: GMAIL_SCOPES,
});
console.log("\nOpen this URL in your browser and authorize the app:\n");
console.log(authUrl);
console.log();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
rl.question("Paste the authorization code here: ", async (code) => {
  rl.close();
  const { tokens } = await auth.getToken(code.trim());
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`\ntoken.json saved to: ${TOKEN_PATH}`);
  console.log("Gmail authorization complete.");
});
