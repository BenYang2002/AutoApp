import { readFileSync } from "fs";
import { join } from "path";
import Anthropic from "@anthropic-ai/sdk";
import type { AutofillAdapter, AutofillConfig, CheckStatusConfig, FillInstruction, FailedInstruction } from "../types.js";
import type { ExtractedApplicationField } from "../../application_extraction/types.js";

const client = new Anthropic();
const MAX_ATTEMPTS = 3;

function stripFences(text: string): string {
  return text.replace(/^```[\w]*\n?/m, "").replace(/```\s*$/m, "").trim();
}

function loadDocs(config: AutofillConfig) {
  const candidate = JSON.parse(readFileSync(join(process.cwd(), config.candidateFile), "utf-8"));
  const resumeMd = readFileSync(join(process.cwd(), "resume.md"), "utf-8");
  const chatter = readFileSync(join(process.cwd(), "project_description_chatter.md"), "utf-8");
  const hatchbot = readFileSync(join(process.cwd(), "project_description_hatchbot.md"), "utf-8");
  return { candidate, resumeMd, chatter, hatchbot };
}

async function callWithJsonRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      console.warn(`[anthropic] Attempt ${attempt}/${MAX_ATTEMPTS} returned non-JSON, retrying...`);
    }
  }
  throw lastError;
}

export const anthropicAdapter: AutofillAdapter = {
  async plan(
    fields: ExtractedApplicationField[],
    pageMarkdown: string,
    config: AutofillConfig,
  ): Promise<FillInstruction[]> {
    const systemPrompt = readFileSync(join(process.cwd(), config.systemPromptFile), "utf-8");
    const { candidate, resumeMd, chatter, hatchbot } = loadDocs(config);

    const textPayload = [
      `Page content:\n${pageMarkdown}`,
      `Extracted fields:\n${JSON.stringify(fields, null, 2)}`,
      `Candidate profile:\n${JSON.stringify(candidate, null, 2)}`,
      `Resume:\n${resumeMd}`,
      `Project — Chatter:\n${chatter}`,
      `Project — Hatchbot:\n${hatchbot}`,
    ].join("\n\n---\n\n");

    return callWithJsonRetry(async () => {
      const response = await client.messages.create({
        model: config.model,
        max_tokens: config.maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: textPayload }],
      });

      const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "[]";
      return JSON.parse(stripFences(text)) as FillInstruction[];
    });
  },

  async revise(
    failed: FailedInstruction[],
    fields: ExtractedApplicationField[],
    errorMarkdown: string,
    config: AutofillConfig,
  ): Promise<FillInstruction[]> {
    const systemPrompt = readFileSync(join(process.cwd(), config.revisePromptFile), "utf-8");

    const textPayload = [
      `Page content:\n${errorMarkdown}`,
      `Failed instructions:\n${JSON.stringify(failed, null, 2)}`,
      `All available fields:\n${JSON.stringify(fields, null, 2)}`,
    ].join("\n\n---\n\n");

    return callWithJsonRetry(async () => {
      const response = await client.messages.create({
        model: config.model,
        max_tokens: config.maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: textPayload }],
      });

      const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "[]";
      return JSON.parse(stripFences(text)) as FillInstruction[];
    });
  },

  async checkPageStatus(
    prevMarkdown: string,
    currentMarkdown: string,
    config: CheckStatusConfig,
  ): Promise<"success" | "continue" | "error"> {
    const systemPrompt = readFileSync(
      join(process.cwd(), config.promptFile),
      "utf-8",
    );

    const textPayload = [
      `PREVIOUS PAGE (before filling):\n${prevMarkdown}`,
      `CURRENT PAGE (after filling):\n${currentMarkdown}`,
    ].join("\n\n---\n\n");

    const response = await client.messages.create({
      model: config.model,
      max_tokens: 10,
      system: systemPrompt,
      messages: [{ role: "user", content: textPayload }],
    });

    const text =
      response.content
        .find((b): b is Anthropic.TextBlock => b.type === "text")
        ?.text.trim()
        .toLowerCase() ?? "error";

    if (text === "success" || text === "continue" || text === "error") {
      return text;
    }
    console.warn(`[anthropic] Unexpected checkPageStatus response: "${text}", defaulting to error`);
    return "error";
  },
};
