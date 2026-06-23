import { readFileSync } from "fs";
import { join } from "path";
import Anthropic from "@anthropic-ai/sdk";
import type { ModelAdapter, JudgeConfig, JudgeResult } from "../types.js";

const client = new Anthropic();

export const anthropicAdapter: ModelAdapter = {
  async judge(
    jd: string,
    config: JudgeConfig,
  ): Promise<Omit<JudgeResult, "jobId" | "evaluatedAt">> {
    const systemPrompt = readFileSync(
      join(process.cwd(), config.systemPromptFile),
      "utf-8",
    );
    const requirements = JSON.parse(
      readFileSync(join(process.cwd(), config.requirementsFile), "utf-8"),
    );

    const response = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      ...(config.thinking && { thinking: { type: "adaptive" } }),
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Candidate requirements:\n${JSON.stringify(requirements, null, 2)}\n\nJob description:\n${jd}`,
        },
      ],
    });

    const text =
      response.content.find((b): b is Anthropic.TextBlock => b.type === "text")
        ?.text ?? "";

    return JSON.parse(text) as Omit<JudgeResult, "jobId" | "evaluatedAt">;
  },
};
