// Merges accessibility tree fields and DOM candidates into a deduplicated
// array of ExtractedApplicationField.
//
// Strategy:
//   1. Seed the result set from a11y fields (better semantic data).
//   2. For each DOM candidate, try to match it to an existing a11y field.
//      If matched → augment the a11y field with real CSS selectors (hybrid).
//      If no match → add it as a new "dom" field.
//   3. Remove empty / unusable nodes (no label and no selectors).

import type {
  A11yField,
  DomCandidate,
  ExtractedApplicationField,
} from "./types.js";

// ─── Public entry point ───────────────────────────────────────────────────────

export function mergeExtractedFields(
  a11yFields: A11yField[],
  domCandidates: DomCandidate[]
): ExtractedApplicationField[] {
  const usedKeys = new Set<string>();
  const results: ExtractedApplicationField[] = [];

  // ── Step 1: seed from accessibility fields ─────────────────────────────────
  for (const field of a11yFields) {
    const key = makeKey(field.label, usedKeys);
    usedKeys.add(key);

    // Conditional spread is required by exactOptionalPropertyTypes — we must
    // never assign `undefined` to an optional property, only omit it.
    results.push({
      key,
      role: field.role,
      label: field.label,
      required: field.required,
      selectorCandidates: [...field.selectorCandidates],
      source: "accessibility",
      ...(field.options ? { options: field.options } : {}),
      ...(field.value ? { value: field.value } : {}),
      ...(field.placeholder ? { placeholder: field.placeholder } : {}),
    });
  }

  // ── Step 2: match DOM candidates to existing a11y entries ──────────────────
  for (const candidate of domCandidates) {
    const matchIndex = findMatchIndex(results, candidate);

    if (matchIndex !== -1) {
      // noUncheckedIndexedAccess means results[matchIndex] could be undefined —
      // guard even though we know matchIndex is valid
      const existing = results[matchIndex];
      if (!existing) continue;

      // Append CSS selectors after the semantic locators (semantic ones first)
      const extraSelectors = candidate.selectorCandidates.filter(
        (s) => !existing.selectorCandidates.includes(s)
      );
      existing.selectorCandidates.push(...extraSelectors);

      // Fill any gaps not covered by the a11y tree
      if (!existing.type && candidate.type) existing.type = candidate.type;
      if (!existing.placeholder && candidate.placeholder)
        existing.placeholder = candidate.placeholder;
      if (!existing.context && candidate.context)
        existing.context = candidate.context;

      existing.source = "hybrid";
    } else {
      // No a11y match — promote the DOM candidate to a standalone field
      const label =
        candidate.labelText ?? candidate.ariaLabel ?? candidate.visibleText ?? "";

      // Skip if there is nothing useful to identify this field
      if (!label && candidate.selectorCandidates.length === 0) continue;

      const key = makeKey(label || candidate.role, usedKeys);
      usedKeys.add(key);

      results.push({
        key,
        role: candidate.role,
        label,
        required: candidate.required,
        selectorCandidates: [...candidate.selectorCandidates],
        source: "dom",
        ...(candidate.type ? { type: candidate.type } : {}),
        ...(candidate.placeholder ? { placeholder: candidate.placeholder } : {}),
        ...(candidate.context ? { context: candidate.context } : {}),
      });
    }
  }

  // ── Step 3: remove empty / unusable fields ─────────────────────────────────
  return results.filter(isUsable);
}

// ─── Matching ─────────────────────────────────────────────────────────────────

// Try to find an existing result that represents the same element as a DOM
// candidate. Returns the array index or -1 if no match.
function findMatchIndex(
  results: ExtractedApplicationField[],
  candidate: DomCandidate
): number {
  const candidateLabel = normalize(
    candidate.labelText ?? candidate.ariaLabel ?? candidate.visibleText ?? ""
  );

  for (let i = 0; i < results.length; i++) {
    const existing = results[i];
    if (!existing) continue;

    // Stable id appears in both selector lists
    if (
      candidate.id &&
      existing.selectorCandidates.some((s) => s.includes(candidate.id!))
    ) {
      return i;
    }

    // name attribute appears in both selector lists
    if (
      candidate.name &&
      existing.selectorCandidates.some((s) =>
        s.includes(`[name="${candidate.name}"]`)
      )
    ) {
      return i;
    }

    // Same role family + labels are close enough
    if (rolesCompatible(existing.role, candidate.role)) {
      const existingLabel = normalize(existing.label);
      if (
        existingLabel &&
        candidateLabel &&
        labelsMatch(existingLabel, candidateLabel)
      ) {
        return i;
      }
    }
  }

  return -1;
}

// Two roles are compatible when they represent the same kind of field
// (e.g. "combobox" and "select" are both dropdowns)
function rolesCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  const dropdowns = new Set(["combobox", "listbox", "select"]);
  const texts = new Set(["textbox", "searchbox"]);
  if (dropdowns.has(a) && dropdowns.has(b)) return true;
  if (texts.has(a) && texts.has(b)) return true;
  return false;
}

// Labels match if one contains the other (handles "First Name *" vs "First Name")
function labelsMatch(a: string, b: string): boolean {
  return a === b || a.includes(b) || b.includes(a);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

// Lowercase, collapse whitespace, strip punctuation
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Generate a slug key from a label, ensuring uniqueness within this extraction
function makeKey(label: string, existing: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "field";

  if (!existing.has(base)) return base;

  let n = 2;
  while (existing.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

// A field is usable if it has a non-empty label or at least one selector
function isUsable(field: ExtractedApplicationField): boolean {
  return (
    (field.label.trim().length > 0 || field.selectorCandidates.length > 0) &&
    field.role !== "none" &&
    field.role !== "presentation" &&
    field.role !== "generic"
  );
}
