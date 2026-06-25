import type { Page, Locator } from "playwright";
import type { ExtractedApplicationField } from "../application_extraction/types.js";
import type { FillAction, FillInstruction, FailedInstruction } from "./types.js";

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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// For finite_select: open the dropdown and click the option matching value exactly.
// Throws if the option is not found (surfaced to the failed[] list for revise).
async function openAndClickOption(page: Page, locator: Locator, value: string): Promise<void> {
  await locator.click();
  await page
    .getByRole("listbox")
    .waitFor({ state: "visible", timeout: 5000 })
    .catch(() => {});

  const option = page
    .getByRole("option", { name: new RegExp(escapeRegex(value), "i") })
    .first();

  try {
    await option.waitFor({ state: "visible", timeout: 3000 });
    await option.click();
  } catch {
    await page.keyboard.press("Escape").catch(() => {});
    throw new Error(`Option "${value}" not found in finite dropdown`);
  }
}

// For search_select: type to filter, then click the closest visible match.
async function fillCombobox(page: Page, locator: Locator, value: string): Promise<void> {
  await locator.click();
  await page.keyboard.press("Control+A").catch(() => {});
  await locator.type(value, { delay: 30 });

  await page
    .getByRole("listbox")
    .waitFor({ state: "visible", timeout: 5000 })
    .catch(() => {});

  const option = page
    .getByRole("option", { name: new RegExp(escapeRegex(value), "i") })
    .first();

  try {
    await option.waitFor({ state: "visible", timeout: 3000 });
    await option.click();
  } catch {
    // Listbox appeared but no regex match — accept the highlighted item
    await page.keyboard.press("Enter");
  }
}

async function selectOption(page: Page, locator: Locator, value: string) {
  try {
    await locator.selectOption({ label: value });
  } catch {
    await locator.click();
    await page.getByRole("option", { name: value, exact: false }).first().click();
  }
}

export async function executeAutofill(
  page: Page,
  fields: ExtractedApplicationField[],
  instructions: FillInstruction[],
): Promise<FailedInstruction[]> {
  const fieldMap = new Map(fields.map((f) => [f.key, f]));
  const failed: FailedInstruction[] = [];

  for (const instruction of instructions) {
    const field = fieldMap.get(instruction.key);
    if (!field) {
      failed.push({ instruction, reason: `Key "${instruction.key}" not found in extracted fields` });
      continue;
    }

    const locator = await resolveLocator(page, field.selectorCandidates);
    if (!locator) {
      failed.push({ instruction, reason: `No visible element matched any selector for "${instruction.key}"` });
      continue;
    }

    const value = instruction.value ?? "";

    // Auto-upgrade fill/type to combobox handling for role="combobox" elements
    // (catches cases where the AI planner chose "fill" for a React Select field)
    let action: FillAction = instruction.action;
    if ((action === "fill" || action === "type") && value) {
      const role = await locator.getAttribute("role").catch(() => null);
      if (role === "combobox") {
        action = field.selectKind === "finite_select" ? "select" : "combobox";
      }
    }

    console.log(`[autofill] ${action}(${field.selectKind ?? "n/a"}) "${instruction.key}" → ${value || "(click)"}`);

    try {
      switch (action) {
        case "fill":
          await locator.fill(value);
          break;

        case "type":
          await locator.clear();
          await locator.type(value, { delay: 60 });
          break;

        case "combobox":
        case "typeAndSelect":
          // search_select: type to filter, click closest match
          await fillCombobox(page, locator, value);
          break;

        case "select": {
          const elRole = await locator.getAttribute("role").catch(() => null);
          if (elRole === "combobox") {
            // React Select — use DOM click path, not native selectOption
            if (field.selectKind === "finite_select") {
              await openAndClickOption(page, locator, value);
            } else {
              await fillCombobox(page, locator, value);
            }
          } else {
            await selectOption(page, locator, value);
          }
          break;
        }

        case "upload":
          await locator.setInputFiles(value);
          break;

        case "check":
          await locator.check();
          break;

        case "click":
          await locator.click();
          break;
      }
    } catch (err) {
      // On finite_select failure, reopen the dropdown and collect live options
      // so the revise AI has the exact list it can choose from.
      if (field.selectKind === "finite_select") {
        try {
          await locator.click({ timeout: 2000 });
          await page.waitForTimeout(300);
          const liveOpts = await page.getByRole("option").allTextContents();
          if (liveOpts.length > 0) {
            field.options = liveOpts.map((t) => t.trim()).filter(Boolean);
          }
        } catch { /* best-effort */ } finally {
          await page.keyboard.press("Escape").catch(() => {});
        }
      }

      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[autofill] Failed "${instruction.key}": ${reason}`);
      failed.push({ instruction, reason });
      continue;
    }

    await page.waitForTimeout(300);
  }

  return failed;
}
