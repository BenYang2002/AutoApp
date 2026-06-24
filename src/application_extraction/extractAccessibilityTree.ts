// Walks Playwright's aria snapshot and extracts interactive form nodes.
// Uses page.locator('body').ariaSnapshot() (Playwright ≥1.47) which returns
// a YAML string. We parse it ourselves to avoid adding a YAML dependency.

import type { Page } from "playwright";
import type { A11yField } from "./types.js";

const FIELD_ROLES = new Set([
  "textbox",
  "combobox",
  "listbox",
  "checkbox",
  "radio",
  "spinbutton",
  "slider",
  "switch",
  "searchbox",
]);

const ACTION_ROLES = new Set(["button", "link"]);

const ACTION_LABEL =
  /\b(apply|continue|next|submit|upload|attach|save|proceed|browse|choose file|add|confirm|agree)\b/i;

// ─── Public entry point ───────────────────────────────────────────────────────

export async function extractAccessibilityFields(page: Page): Promise<A11yField[]> {
  const snapshot = await page.locator("body").ariaSnapshot();
  if (!snapshot) return [];
  return parseAriaSnapshot(snapshot);
}

// ─── YAML parser ─────────────────────────────────────────────────────────────

// Each line looks like:  - role "label" [required] [level=N]: "value"
// Indentation (2 spaces per level) determines parent-child relationships.
const LINE_RE = /^(\s*)-\s+(\w+)(?:\s+"([^"]*)")?([^:]*)?(?::\s*"([^"]*)")?/;

interface ParsedLine {
  depth: number;
  role: string;
  label: string;
  attrs: string;
  value: string | undefined;
}

function parseLine(line: string): ParsedLine | null {
  const m = LINE_RE.exec(line);
  if (!m) return null;
  return {
    depth: (m[1] ?? "").length,
    role: m[2] ?? "",
    label: (m[3] ?? "").trim(),
    attrs: m[4] ?? "",
    value: m[5],
  };
}

function parseAriaSnapshot(yaml: string): A11yField[] {
  const lines = yaml.split("\n");
  const fields: A11yField[] = [];

  for (let i = 0; i < lines.length; i++) {
    const parsed = parseLine(lines[i] ?? "");
    if (!parsed) continue;

    const { depth, role, label, attrs, value } = parsed;
    const required = /\[required\]/.test(attrs);

    if (FIELD_ROLES.has(role)) {
      const options: string[] = [];

      // Collect option children (deeper indentation)
      let j = i + 1;
      while (j < lines.length) {
        const child = parseLine(lines[j] ?? "");
        j++;
        if (!child) continue;
        if (child.depth <= depth) break;
        if (child.role === "option" && child.label) options.push(child.label);
      }

      fields.push({
        role,
        label,
        required,
        ...(options.length > 0 ? { options } : {}),
        ...(value ? { value } : {}),
        selectorCandidates: buildSemanticLocators(role, label),
      });
    } else if (ACTION_ROLES.has(role) && label && ACTION_LABEL.test(label)) {
      fields.push({
        role,
        label,
        required: false,
        selectorCandidates: buildSemanticLocators(role, label),
      });
    }
  }

  return fields;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildSemanticLocators(role: string, label: string): string[] {
  if (!label) return [];
  return [
    `getByRole('${role}', { name: ${JSON.stringify(label)} })`,
    `getByLabel(${JSON.stringify(label)})`,
  ];
}
