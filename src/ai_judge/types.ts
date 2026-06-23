export interface JudgeResult {
  jobId: string;
  decision: "apply" | "skip";
  score: number;
  reason: string;
  flags: {
    citizenshipRequired: boolean;
    greenCardAccepted: boolean;
    seniorRole: boolean;
    yearsTooHigh: boolean;
    currentStudentRequired: boolean;
    unrelatedRole: boolean;
    softNegativeRole: boolean;
  };
  matchedSkills: string[];
  missingSkills: string[];
  evaluatedAt: string;
}

export interface JudgeConfig {
  provider: string;
  model: string;
  maxTokens: number;
  thinking: boolean;
  systemPromptFile: string;
  requirementsFile: string;
}

export interface ModelAdapter {
  judge(
    jd: string,
    config: JudgeConfig,
  ): Promise<Omit<JudgeResult, "jobId" | "evaluatedAt">>;
}
