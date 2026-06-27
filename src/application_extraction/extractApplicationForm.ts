// Main entry point for hybrid form extraction.
//
// Given a Playwright Page that is already on a job application page, this
// function returns a clean array of ExtractedApplicationField — one entry per
// interactive element — ready to be handed to an LLM for value decisions.
//
// It does NOT fill in any values, click any buttons, or submit anything.

import type { Page } from "playwright";
import type { ExtractedApplicationField } from "./types.js";
import { extractAccessibilityFields } from "./extractAccessibilityTree.js";
import { extractDomCandidates } from "./extractDomCandidates.js";
import { mergeExtractedFields } from "./mergeExtractedFields.js";
import { enrichComboboxOptions } from "./enrichComboboxOptions.js";

export type { ExtractedApplicationField } from "./types.js";

export async function extractApplicationForm(
  page: Page,
): Promise<ExtractedApplicationField[]> {
  // Run both extractors in parallel — they are independent of each other
  const [a11yFields, domCandidates] = await Promise.all([
    extractAccessibilityFields(page),
    extractDomCandidates(page),
  ]);

  const fields = mergeExtractedFields(a11yFields, domCandidates);

  // Open each combobox to collect its live options and classify it as
  // finite_select or search_select before handing off to the AI planner.
  await enrichComboboxOptions(page, fields);

  return fields;
}
