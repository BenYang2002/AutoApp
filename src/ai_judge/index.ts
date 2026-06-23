import { join } from "path";
import type { JudgeResult, JudgeConfig, ModelAdapter } from "./types.js";
import { readFileSync } from "fs";
export type { JudgeResult } from "./types.js";

function loadConfig(): JudgeConfig {
  return JSON.parse(
    readFileSync(
      join(process.cwd(), "src/ai_judge/judge.config.json"),
      "utf-8",
    ),
  ) as JudgeConfig;
}

async function loadAdapter(provider: string): Promise<ModelAdapter> {
  switch (provider) {
    case "anthropic": {
      const { anthropicAdapter } = await import("./models/anthropic.js");
      return anthropicAdapter;
    }
    default:
      throw new Error(`Unsupported provider: "${provider}"`);
  }
}

export async function judgeJD(jobId: string, jd: string): Promise<JudgeResult> {
  const config = loadConfig();

  const adapter = await loadAdapter(config.provider);
  const partial = await adapter.judge(jd, config);

  return {
    ...partial,
    jobId,
    evaluatedAt: new Date().toISOString(),
  };
}
