import { prisma } from "./client.js";
import type { JudgeResult } from "../ai_judge/index.js";

export async function hasAppliedToJob(jobId: string): Promise<boolean> {
  const record = await prisma.appliedJob.findUnique({ where: { jobId } });
  return record !== null;
}

export async function recordAppliedJob(jobId: string): Promise<void> {
  await prisma.appliedJob.upsert({
    where: { jobId },
    create: { jobId },
    update: {},
  });
}

export async function saveJDToDB(jdId: string, markdown: string): Promise<void> {
  await prisma.jobListing.upsert({
    where: { jobId: jdId },
    create: { jobId: jdId, markdown },
    update: { markdown },
  });
}

export async function saveAIResultToDB(result: JudgeResult): Promise<void> {
  const {
    jobId,
    decision,
    score,
    reason,
    flags: {
      citizenshipRequired,
      greenCardAccepted,
      seniorRole,
      yearsTooHigh,
      currentStudentRequired,
      unrelatedRole,
      softNegativeRole,
    },
    matchedSkills,
    missingSkills,
    evaluatedAt,
  } = result;

  const data = {
    decision,
    score,
    reason,
    citizenshipRequired,
    greenCardAccepted,
    seniorRole,
    yearsTooHigh,
    currentStudentRequired,
    unrelatedRole,
    softNegativeRole,
    matchedSkills,
    missingSkills,
    evaluatedAt: new Date(evaluatedAt),
  };

  await prisma.aiEvaluation.upsert({
    where: { jobId },
    create: { jobId, ...data },
    update: data,
  });
}
