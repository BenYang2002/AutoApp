// Scans the live DOM via page.evaluate() to find interactive elements that
// may be missing from or poorly described in the accessibility tree.
//
// The evaluate payload is passed as a string so that tsx/esbuild never
// transforms the browser-side code (which would inject __name helpers that
// are undefined inside the browser context).

import type { Page } from "playwright";
import type { DomCandidate } from "./types.js";

// ─── Browser-side code (plain JS string — not transformed by esbuild) ─────────

const BROWSER_SCRIPT = /* javascript */ `
(() => {
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
      const labelEl = document.getElementById(labelledById);
      const text = labelEl && labelEl.textContent && labelEl.textContent.trim();
      if (text) return text;
    }

    const elId = el.id;
    if (elId) {
      const label = document.querySelector('label[for="' + CSS.escape(elId) + '"]');
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

  document.querySelectorAll(formSelectors).forEach(function(el) {
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
  document
    .querySelectorAll(ariaRoles.map(function(r) { return '[role="' + r + '"]'; }).join(","))
    .forEach(function(el) { processElement(el, results, seen); });

  document
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

  document.querySelectorAll("div[class], span[class]").forEach(function(el) {
    const className = el.className;
    if (!INTERACTIVE_CLASS.test(className)) return;
    if (window.getComputedStyle(el).cursor !== "pointer") return;
    processElement(el, results, seen);
  });

  return results;
})()
`;

// ─── Public entry point ───────────────────────────────────────────────────────

export async function extractDomCandidates(page: Page): Promise<DomCandidate[]> {
  const result = await page.evaluate(BROWSER_SCRIPT);
  return result as DomCandidate[];
}
