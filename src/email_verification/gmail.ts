import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";

const CREDENTIALS_PATH = join(process.cwd(), "credentials.json");
const TOKEN_PATH = join(process.cwd(), "token.json");

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

export function createOAuth2Client() {
  const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
  const { client_id, client_secret, redirect_uris } = credentials.installed;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

export function loadAuthorizedClient() {
  if (!existsSync(TOKEN_PATH)) {
    throw new Error(
      "Gmail token not found. Run 'tsx src/email_verification/setup_auth.ts' once to authorize.",
    );
  }
  const auth = createOAuth2Client();
  auth.setCredentials(JSON.parse(readFileSync(TOKEN_PATH, "utf-8")));
  auth.on("tokens", (tokens) => {
    const existing = JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
    writeFileSync(TOKEN_PATH, JSON.stringify({ ...existing, ...tokens }, null, 2));
  });
  return auth;
}

function extractText(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";

  // Prefer text/plain, fall back to text/html
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url")
      .toString("utf-8")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Recurse into multipart
  if (payload.parts) {
    const plain = payload.parts.find((p) => p.mimeType === "text/plain");
    if (plain) return extractText(plain);
    const html = payload.parts.find((p) => p.mimeType === "text/html");
    if (html) return extractText(html);
    for (const part of payload.parts) {
      const text = extractText(part);
      if (text) return text;
    }
  }

  return "";
}

export async function getRecentEmails(count: number, after: Date): Promise<string[]> {
  const auth = loadAuthorizedClient();
  const gmail = google.gmail({ version: "v1", auth });

  const afterSec = Math.floor(after.getTime() / 1000);
  const listRes = await gmail.users.messages.list({
    userId: "me",
    maxResults: count,
    q: `after:${afterSec}`,
  });
  const messages = listRes.data.messages ?? [];

  const results: string[] = [];
  for (const msg of messages) {
    if (!msg.id) continue;
    const detail = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "full" });
    const headers = detail.data.payload?.headers ?? [];
    const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
    const from = headers.find((h) => h.name === "From")?.value ?? "";
    const body = extractText(detail.data.payload ?? undefined);
    results.push(`From: ${from}\nSubject: ${subject}\n\n${body}`);
  }

  return results;
}