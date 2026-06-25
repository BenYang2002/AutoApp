import type { ExtractedApplicationField } from "../application_extraction/types.js";

export type FillAction =
  | "fill"
  | "type"
  | "combobox"
  | "typeAndSelect"
  | "select"
  | "upload"
  | "check"
  | "click";

export interface FillInstruction {
  key: string;
  action: FillAction;
  value: string | null;
}

export interface FailedInstruction {
  instruction: FillInstruction;
  reason: string;
}

export interface AutofillConfig {
  provider: string;
  model: string;
  maxTokens: number;
  maxPages: number;
  systemPromptFile: string;
  revisePromptFile: string;
  candidateFile: string;
}

export interface AutofillAdapter {
  plan(
    fields: ExtractedApplicationField[],
    pageMarkdown: string,
    config: AutofillConfig,
  ): Promise<FillInstruction[]>;

  revise(
    failed: FailedInstruction[],
    fields: ExtractedApplicationField[],
    errorMarkdown: string,
    config: AutofillConfig,
  ): Promise<FillInstruction[]>;
}
