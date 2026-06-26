import Anthropic from "@anthropic-ai/sdk";
import { getRecentEmails } from "./gmail.js";

const client = new Anthropic();
const MAX_TRIALS = 3;
const RETRY_DELAY_MS = 15_000;

async function extractCode(emailContents: string[]): Promise<string | null> {
  if (emailContents.length === 0) return null;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 20,
    system: `You are extracting a verification or confirmation code from email content.
Look for a short numeric or alphanumeric code (typically 4–8 characters) used to verify an account or confirm an action.
If you find one, respond with ONLY the code itself — no spaces, no explanation.
If no verification code is present, respond with exactly: NONE`,
    messages: [
      {
        role: "user",
        content: emailContents
          .map((content, i) => `Email ${i + 1}:\n${content}`)
          .join("\n\n---\n\n"),
      },
    ],
  });

  const text =
    response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text.trim() ??
    "NONE";

  return text === "NONE" ? null : text;
}

export async function getVerificationCode(
  after: Date,
): Promise<{ status: boolean; code: string }> {
  for (let trial = 1; trial <= MAX_TRIALS; trial++) {
    console.log(`[email_verification] Trial ${trial}/${MAX_TRIALS} — fetching emails after ${after.toISOString()}...`);

    const emails = await getRecentEmails(3, after);
    const code = await extractCode(emails);

    if (code) {
      console.log(`[email_verification] Found verification code: ${code}`);
      return { status: true, code };
    }

    console.log(`[email_verification] No code found in trial ${trial}.`);
    if (trial < MAX_TRIALS) {
      console.log(`[email_verification] Waiting 15s before retry...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  console.warn("[email_verification] No verification code found after 3 trials.");
  return { status: false, code: "" };
}