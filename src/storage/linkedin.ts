import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { JudgeResult } from "../ai_judge/index.js";

const base = join(process.cwd(), "storage", "linkedin");
const jdDir = join(base, "jd");
const aiApplyDir = join(base, "aiApply");

export function saveJD(jdId: string, markdown: string): void {
  mkdirSync(jdDir, { recursive: true });
  writeFileSync(join(jdDir, `${jdId}.md`), markdown, "utf-8");
}

export function saveAIResult(jdId: string, result: JudgeResult): void {
  mkdirSync(aiApplyDir, { recursive: true });
  writeFileSync(
    join(aiApplyDir, `${jdId}.json`),
    JSON.stringify(result, null, 2),
    "utf-8",
  );
}
