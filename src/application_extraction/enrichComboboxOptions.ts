// Second-pass enrichment for combobox fields.
//
// The static aria snapshot only captures options that are already rendered in
// the DOM — closed Greenhouse / React Select dropdowns render options lazily,
// so their options[] is empty after the first pass.
//
// This step:
//   1. Skips fields that already have options or that are known-large search selects.
//   2. Opens each remaining combobox, counts visible options, and classifies it:
//        finite_select  — ≤ MAX_FINITE_OPTIONS options, collect them all
//        search_select  — 0 or too many options, leave options empty
//   3. Closes the dropdown (Escape) before moving to the next field.
//
// Must be called AFTER mergeExtractedFields and BEFORE the AI planning step.

import type { Page, Locator } from "playwright";
import type { ExtractedApplicationField } from "./types.js";

// Labels that reliably indicate a large search-backed select.
// We skip opening these to avoid slow/disruptive DOM churn.
const SEARCH_SELECT_RE =
  /\b(school|university|college|company|employer|organization|city|location|address|country|state|province|region|industry|major|discipline|field\s+of\s+study)\b/i;

const MAX_FINITE_OPTIONS = 300;

async function resolveLocator(
  page: Page,
  candidates: string[],
): Promise<Locator | null> {
  for (const candidate of candidates) {
    try {
      let locator: Locator;
      if (candidate.startsWith("getByRole(")) {
        const m = /getByRole\('(\w+)',\s*\{\s*name:\s*"([^"]+)"/.exec(candidate);
        if (!m?.[1] || !m[2]) continue;
        locator = page.getByRole(m[1] as Parameters<Page["getByRole"]>[0], { name: m[2] });
      } else if (candidate.startsWith("getByLabel(")) {
        const m = /getByLabel\("([^"]+)"\)/.exec(candidate);
        if (!m?.[1]) continue;
        locator = page.getByLabel(m[1]);
      } else {
        locator = page.locator(candidate);
      }
      if ((await locator.count()) > 0) return locator.first();
    } catch {
      continue;
    }
  }
  return null;
}

export async function enrichComboboxOptions(
  page: Page,
  fields: ExtractedApplicationField[],
): Promise<void> {
  for (const field of fields) {
    if (field.role !== "combobox") continue;

    // Already populated by the aria snapshot — just classify and move on
    if (field.options && field.options.length > 0) {
      field.selectKind = "finite_select";
      continue;
    }

    // Known large search selects — skip enumeration
    if (SEARCH_SELECT_RE.test(field.label)) {
      field.selectKind = "search_select";
      continue;
    }

    const locator = await resolveLocator(page, field.selectorCandidates);
    if (!locator) continue;

    try {
      await locator.click({ timeout: 3000 });
      await page.waitForTimeout(500);

      const optionEls = page.getByRole("option");
      const count = await optionEls.count();

      if (count >= 1 && count <= MAX_FINITE_OPTIONS) {
        const texts = await optionEls.allTextContents();
        field.options = texts.map((t) => t.trim()).filter(Boolean);
        field.selectKind = "finite_select";
        console.log(
          `[extract] finite_select "${field.label}": [${field.options.join(", ")}]`,
        );
      } else {
        // 0 options = search_select; > MAX = effectively search_select
        field.selectKind = "search_select";
      }
    } catch {
      // Could not open — leave selectKind unset, AI will treat it as a text field
    } finally {
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(200);
    }
  }
}
