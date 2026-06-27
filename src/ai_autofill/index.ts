import { join } from "path";
import { readFileSync } from "fs";
import type { Page } from "playwright";
import type { AutofillConfig, AutofillAdapter, CheckStatusConfig } from "./types.js";
import type { ExtractedApplicationField } from "../application_extraction/extractApplicationForm.js";
import { runAutofillSession } from "./runner.js";

export type { FillInstruction, FailedInstruction } from "./types.js";

function loadConfig(): AutofillConfig {
  return JSON.parse(
    readFileSync(join(process.cwd(), "src/ai_autofill/autofill.config.json"), "utf-8"),
  ) as AutofillConfig;
}

function loadCheckStatusConfig(): CheckStatusConfig {
  return JSON.parse(
    readFileSync(join(process.cwd(), "src/ai_autofill/check_status.config.json"), "utf-8"),
  ) as CheckStatusConfig;
}

async function loadAdapter(provider: string): Promise<AutofillAdapter> {
  switch (provider) {
    case "anthropic": {
      const { anthropicAdapter } = await import("./models/anthropic.js");
      return anthropicAdapter;
    }
    default:
      throw new Error(`Unsupported provider: "${provider}"`);
  }
}

export async function autofillApplication(
  page: Page,
  jdId: string,
  extractForm?: (page: Page) => Promise<ExtractedApplicationField[]>,
  scopeSelector = "body",
): Promise<"success" | "stuck" | "failed"> {
  const config = loadConfig();
  const checkStatusConfig = loadCheckStatusConfig();
  const adapter = await loadAdapter(config.provider);
  return runAutofillSession(page, jdId, config, checkStatusConfig, adapter, extractForm, scopeSelector);
}
