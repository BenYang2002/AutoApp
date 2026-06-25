// Final output type — one entry per interactive field found on the page.
// Designed to be fed directly to an LLM to decide what value to fill in.
export type ExtractedApplicationField = {
  // Slugified unique key, e.g. "first_name", "resume_upload"
  key: string;
  // ARIA role: textbox, combobox, checkbox, radio, button, etc.
  role: string;
  // HTML input type when available: text, email, file, tel, etc.
  type?: string;
  // Best human-readable label we could find for this field
  label: string;
  required?: boolean;
  // Populated for combobox / listbox / radio groups
  options?: string[];
  // "finite_select" = small fixed option list (GPA, gender, etc.) — value must come from options[].
  // "search_select" = large searchable dropdown (school, city, etc.) — type to filter, then pick closest match.
  // Absent for non-combobox fields.
  selectKind?: "finite_select" | "search_select";
  placeholder?: string;
  // Current value if the field is pre-filled
  value?: string;
  // Ordered from most stable to least stable; first try getByRole/getByLabel,
  // then fall back to CSS selectors from the DOM scan
  selectorCandidates: string[];
  // Where the field data came from
  source: "accessibility" | "dom" | "hybrid";
  // Nearby text that gives the LLM extra context about what is being asked
  context?: string;
};

// ─── Internal types (not exported from the module) ───────────────────────────

// Intermediate output from the accessibility tree walk
export type A11yField = {
  role: string;
  label: string;
  required: boolean;
  options?: string[];
  value?: string;
  placeholder?: string;
  // Playwright semantic locators, e.g. getByRole('textbox', { name: 'Email' })
  selectorCandidates: string[];
};

// Intermediate output from the DOM scan (must be fully serializable because it
// crosses the page.evaluate() boundary)
export type DomCandidate = {
  tagName: string;
  role: string;
  type?: string;
  id?: string;
  name?: string;
  ariaLabel?: string;
  placeholder?: string;
  required: boolean;
  visibleText?: string;
  // Text from an associated <label> element or aria-labelledby target
  labelText?: string;
  // Surrounding text from parent / sibling nodes
  context?: string;
  // CSS / attribute selectors, ordered from most to least stable
  selectorCandidates: string[];
};
