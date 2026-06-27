// Form extractor scoped to the LinkedIn Easy Apply modal.
//
// Uses .jobs-easy-apply-modal__content as the root for all queries so that
// fields from the rest of the page (nav, sidebar, job description) are
// never included in the extraction result.

import type { Page, Locator } from "playwright";
import type {
  ExtractedApplicationField,
  A11yField,
  DomCandidate,
} from "../application_extraction/types.js";
import { mergeExtractedFields } from "../application_extraction/mergeExtractedFields.js";

export const MODAL_SELECTOR = ".jobs-easy-apply-modal__content";

// ─── Accessibility extraction ─────────────────────────────────────────────────

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

const LINE_RE =
  /^(\s*)-\s+(\w+)(?:\s+"([^"]*)")?([^:]*)?(?::\s*"([^"]*)")?/;

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

function buildSemanticLocators(role: string, label: string): string[] {
  if (!label) return [];
  return [
    `getByRole('${role}', { name: ${JSON.stringify(label)} })`,
    `getByLabel(${JSON.stringify(label)})`,
  ];
}

async function extractModalA11yFields(page: Page): Promise<A11yField[]> {
  const snapshot = await page
    .locator(MODAL_SELECTOR)
    .first()
    .ariaSnapshot()
    .catch(() => null);
  if (!snapshot) return [];
  return parseAriaSnapshot(snapshot);
}

// ─── DOM extraction (scoped to modal) ────────────────────────────────────────

const MODAL_DOM_SCRIPT = /* javascript */ `
(() => {
  const modal = document.querySelector('.jobs-easy-apply-modal__content');
  if (!modal) return [];

  function isUnstableId(id) {
    return (
      /^ember\\d+$/.test(id) ||
      /^react-select-\\d+/.test(id) ||
      /^__BVID__\\d+$/.test(id) ||
      /^[a-f0-9]{8}-[a-f0-9]{4}/.test(id) ||
      /^\\d+$/.test(id) ||
      /^[a-z]{1,5}\\d{4,}$/.test(id)
    );
  }

  function buildSelectors(el) {
    const tag = el.tagName.toLowerCase();
    const candidates = [];

    const testId =
      el.getAttribute("data-testid") ||
      el.getAttribute("data-test-id") ||
      el.getAttribute("data-qa");
    if (testId) candidates.push('[data-testid="' + testId + '"]');

    const elId = el.id;
    if (elId && !isUnstableId(elId)) candidates.push("#" + CSS.escape(elId));

    const name = el.getAttribute("name");
    if (name) candidates.push(tag + '[name="' + name + '"]');

    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) candidates.push('[aria-label="' + ariaLabel + '"]');

    const placeholder = el.getAttribute("placeholder");
    if (placeholder) candidates.push(tag + '[placeholder="' + placeholder + '"]');

    const type = el.getAttribute("type");
    if (type && ["email", "tel", "file", "url", "date"].includes(type)) {
      candidates.push('input[type="' + type + '"]');
    }

    return candidates;
  }

  function findLabel(el) {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    const labelledById = el.getAttribute("aria-labelledby");
    if (labelledById) {
      const labelEl =
        modal.querySelector('[id="' + labelledById + '"]') ||
        document.getElementById(labelledById);
      const text = labelEl && labelEl.textContent && labelEl.textContent.trim();
      if (text) return text;
    }

    const elId = el.id;
    if (elId) {
      const label = modal.querySelector('label[for="' + CSS.escape(elId) + '"]');
      const text = label && label.textContent && label.textContent.trim();
      if (text) return text;
    }

    const wrappingLabel = el.closest("label");
    if (wrappingLabel) {
      const clone = wrappingLabel.cloneNode(true);
      clone.querySelectorAll("input, textarea, select, button").forEach(function(n) { n.remove(); });
      const text = clone.textContent && clone.textContent.trim();
      if (text) return text;
    }

    const placeholder = el.getAttribute("placeholder");
    if (placeholder && placeholder.trim()) return placeholder.trim();

    const ownText = el.textContent && el.textContent.trim();
    if (ownText && ownText.length < 80) return ownText;

    return findNearbyText(el);
  }

  function findNearbyText(el) {
    const prev = el.previousElementSibling;
    if (prev) {
      const text = prev.textContent && prev.textContent.trim();
      if (text && text.length < 100 && !text.includes("\\n")) return text;
    }

    const parent = el.parentElement;
    if (parent) {
      const parentText = Array.from(parent.childNodes)
        .filter(function(node) {
          return node.nodeType === Node.TEXT_NODE ||
            (node !== el && !(node.contains && node.contains(el)));
        })
        .map(function(n) { return n.textContent && n.textContent.trim(); })
        .filter(Boolean)
        .join(" ")
        .trim();
      if (parentText && parentText.length < 100) return parentText;
    }

    return "";
  }

  function findContext(el) {
    const parent = el.parentElement && el.parentElement.parentElement;
    if (!parent) return undefined;
    const text = parent.textContent && parent.textContent.trim().replace(/\\s+/g, " ");
    if (text && text.length > 0 && text.length < 300) return text;
    return undefined;
  }

  function resolveRole(el) {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;

    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute("type") && el.getAttribute("type").toLowerCase();

    if (tag === "input") {
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "range") return "slider";
      if (type === "number") return "spinbutton";
      if (type === "submit" || type === "button") return "button";
      return "textbox";
    }
    if (tag === "textarea") return "textbox";
    if (tag === "select") return "combobox";
    if (tag === "button") return "button";
    if (tag === "a") return "link";
    return tag;
  }

  function processElement(el, results, seen) {
    if (seen.has(el)) return;
    seen.add(el);

    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) return;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const tag = el.tagName.toLowerCase();
    const role = resolveRole(el);
    const labelText = findLabel(el) || undefined;
    const type = el.getAttribute("type") || undefined;
    const elId = el.id || undefined;
    const name = el.getAttribute("name") || undefined;
    const ariaLabel = el.getAttribute("aria-label") || undefined;
    const placeholder = el.getAttribute("placeholder") || undefined;
    const visibleText = (el.textContent && el.textContent.trim()) || undefined;
    const context = findContext(el);

    const candidate = {
      tagName: tag,
      role,
      required:
        el.hasAttribute("required") ||
        el.getAttribute("aria-required") === "true",
      selectorCandidates: buildSelectors(el),
    };
    if (type !== undefined) candidate.type = type;
    if (elId !== undefined) candidate.id = elId;
    if (name !== undefined) candidate.name = name;
    if (ariaLabel !== undefined) candidate.ariaLabel = ariaLabel;
    if (placeholder !== undefined) candidate.placeholder = placeholder;
    if (visibleText !== undefined) candidate.visibleText = visibleText;
    if (labelText !== undefined) candidate.labelText = labelText;
    if (context !== undefined) candidate.context = context;

    results.push(candidate);
  }

  const results = [];
  const seen = new Set();

  const formSelectors = [
    'input:not([type="hidden"])',
    "textarea",
    "select",
    "button",
  ].join(",");

  modal.querySelectorAll(formSelectors).forEach(function(el) {
    const type = el.getAttribute("type");
    if (type === "submit" || type === "reset") {
      const text = el.getAttribute("value") || el.textContent || "";
      if (!/apply|continue|next|submit|save|proceed/i.test(text)) return;
    }
    processElement(el, results, seen);
  });

  const ariaRoles = [
    "textbox", "combobox", "listbox", "checkbox", "radio",
    "button", "switch", "spinbutton", "slider",
  ];
  modal
    .querySelectorAll(ariaRoles.map(function(r) { return '[role="' + r + '"]'; }).join(","))
    .forEach(function(el) { processElement(el, results, seen); });

  modal
    .querySelectorAll("[onclick], [tabindex]:not([tabindex='-1'])")
    .forEach(function(el) {
      const tag = el.tagName.toLowerCase();
      if (["div", "span", "li", "ul", "nav", "header", "footer"].includes(tag)) {
        if (window.getComputedStyle(el).cursor !== "pointer") return;
      }
      processElement(el, results, seen);
    });

  const INTERACTIVE_CLASS =
    /\\b(btn|button|submit|apply|continue|next|upload|input|select|dropdown|combobox|checkbox|radio|toggle|switch)\\b/i;

  modal.querySelectorAll("div[class], span[class]").forEach(function(el) {
    const className = el.className;
    if (!INTERACTIVE_CLASS.test(className)) return;
    if (window.getComputedStyle(el).cursor !== "pointer") return;
    processElement(el, results, seen);
  });

  return results;
})()
`;

async function extractModalDomCandidates(page: Page): Promise<DomCandidate[]> {
  const result = await page.evaluate(MODAL_DOM_SCRIPT);
  return result as DomCandidate[];
}

// ─── Combobox enrichment (locators resolved within the modal) ─────────────────

const SEARCH_SELECT_RE =
  /\b(school|university|college|company|employer|organization|city|location|address|country|state|province|region|industry|major|discipline|field\s+of\s+study)\b/i;

const MAX_FINITE_OPTIONS = 300;

async function resolveModalLocator(
  page: Page,
  candidates: string[],
): Promise<Locator | null> {
  const modal = page.locator(MODAL_SELECTOR).first();
  for (const candidate of candidates) {
    try {
      let locator: Locator;
      if (candidate.startsWith("getByRole(")) {
        const m = /getByRole\('(\w+)',\s*\{\s*name:\s*"([^"]+)"/.exec(candidate);
        if (!m?.[1] || !m[2]) continue;
        locator = modal.getByRole(m[1] as Parameters<Page["getByRole"]>[0], {
          name: m[2],
        });
      } else if (candidate.startsWith("getByLabel(")) {
        const m = /getByLabel\("([^"]+)"\)/.exec(candidate);
        if (!m?.[1]) continue;
        locator = modal.getByLabel(m[1]);
      } else {
        locator = modal.locator(candidate);
      }
      if ((await locator.count()) > 0) return locator.first();
    } catch {
      continue;
    }
  }
  return null;
}

async function enrichModalComboboxOptions(
  page: Page,
  fields: ExtractedApplicationField[],
): Promise<void> {
  for (const field of fields) {
    if (field.role !== "combobox") continue;

    if (field.options && field.options.length > 0) {
      field.selectKind = "finite_select";
      continue;
    }

    if (SEARCH_SELECT_RE.test(field.label)) {
      field.selectKind = "search_select";
      continue;
    }

    const locator = await resolveModalLocator(page, field.selectorCandidates);
    if (!locator) continue;

    try {
      await locator.click({ timeout: 3000 });
      await page.waitForTimeout(500);

      // Options may render outside the modal as a floating list — query page-wide
      const optionEls = page.getByRole("option");
      const count = await optionEls.count();

      if (count >= 1 && count <= MAX_FINITE_OPTIONS) {
        const texts = await optionEls.allTextContents();
        field.options = texts.map((t) => t.trim()).filter(Boolean);
        field.selectKind = "finite_select";
      } else {
        field.selectKind = "search_select";
      }
    } catch {
      // leave selectKind unset
    } finally {
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(200);
    }
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function extractEasyApplyForm(
  page: Page,
): Promise<ExtractedApplicationField[]> {
  const [a11yFields, domCandidates] = await Promise.all([
    extractModalA11yFields(page),
    extractModalDomCandidates(page),
  ]);

  const fields = mergeExtractedFields(a11yFields, domCandidates);
  await enrichModalComboboxOptions(page, fields);
  return fields;
}
