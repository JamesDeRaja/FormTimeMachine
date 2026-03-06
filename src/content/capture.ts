import type { CapturedField, DomFingerprint, PageSnapshot } from "../shared/types.js";

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~\s])/g, "\\$1");
}

function buildDomPath(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE && segments.length < 8) {
    const tag = current.tagName.toLowerCase();
    const parent = current.parentElement;

    if (!parent) {
      segments.unshift(tag);
      break;
    }

    const siblings = Array.from(parent.children as HTMLCollectionOf<Element>).filter((child: Element) => child.tagName === current?.tagName);
    const index = siblings.indexOf(current) + 1;
    segments.unshift(`${tag}:nth-of-type(${Math.max(1, index)})`);
    current = parent;
  }

  return segments.join(" > ");
}

function getBestSelector(element: Element): string | undefined {
  const tag = element.tagName.toLowerCase();
  const id = element.getAttribute("id");
  if (id && !/^\d+$/.test(id)) return `#${cssEscape(id)}`;

  const name = element.getAttribute("name");
  if (name) return `${tag}[name="${cssEscape(name)}"]`;

  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return `${tag}[aria-label="${cssEscape(ariaLabel)}"]`;

  const placeholder = element.getAttribute("placeholder");
  if (placeholder) return `${tag}[placeholder="${cssEscape(placeholder)}"]`;

  return buildDomPath(element);
}

function getLabelText(element: Element): string | undefined {
  const id = element.getAttribute("id");
  if (id) {
    const label = document.querySelector(`label[for="${cssEscape(id)}"]`);
    if (label?.textContent?.trim()) {
      return label.textContent.trim();
    }
  }

  const parentLabel = element.closest("label");
  if (parentLabel?.textContent?.trim()) {
    return parentLabel.textContent.trim();
  }

  return undefined;
}

function captureElement(element: Element, index: number): CapturedField | null {
  if (element instanceof HTMLInputElement) {
    if (element.type === "password" || element.type === "file") {
      return null;
    }

    return {
      key: `${element.tagName.toLowerCase()}-${index}-${element.name || element.id || "field"}`,
      tag: "input",
      type: element.type,
      selector: getBestSelector(element),
      name: element.name || undefined,
      id: element.id || undefined,
      ariaLabel: element.getAttribute("aria-label") || undefined,
      placeholder: element.placeholder || undefined,
      labelText: getLabelText(element),
      domPath: buildDomPath(element),
      value: ["checkbox", "radio"].includes(element.type) ? undefined : element.value,
      checked: ["checkbox", "radio"].includes(element.type) ? element.checked : undefined
    };
  }

  if (element instanceof HTMLTextAreaElement) {
    return {
      key: `${element.tagName.toLowerCase()}-${index}-${element.name || element.id || "field"}`,
      tag: "textarea",
      selector: getBestSelector(element),
      name: element.name || undefined,
      id: element.id || undefined,
      ariaLabel: element.getAttribute("aria-label") || undefined,
      placeholder: element.placeholder || undefined,
      labelText: getLabelText(element),
      domPath: buildDomPath(element),
      value: element.value
    };
  }

  if (element instanceof HTMLSelectElement) {
    return {
      key: `${element.tagName.toLowerCase()}-${index}-${element.name || element.id || "field"}`,
      tag: "select",
      selector: getBestSelector(element),
      name: element.name || undefined,
      id: element.id || undefined,
      ariaLabel: element.getAttribute("aria-label") || undefined,
      labelText: getLabelText(element),
      domPath: buildDomPath(element),
      selectedValues: Array.from(element.selectedOptions).map((option) => option.value)
    };
  }

  if (element instanceof HTMLElement && element.isContentEditable) {
    return {
      key: `contenteditable-${index}`,
      tag: element.tagName.toLowerCase(),
      selector: getBestSelector(element),
      id: element.id || undefined,
      ariaLabel: element.getAttribute("aria-label") || undefined,
      labelText: getLabelText(element),
      domPath: buildDomPath(element),
      textContent: element.innerText || element.textContent || ""
    };
  }

  return null;
}

export function capturePageSnapshot(title: string, tags: string[], id: string, createdAt: string): Omit<PageSnapshot, "origin" | "path" | "hostname"> & {
  origin: string;
  path: string;
  hostname: string;
} {
  const url = new URL(window.location.href);
  const candidates = Array.from(
    document.querySelectorAll("input, textarea, select, [contenteditable='true']")
  );

  const fields: CapturedField[] = candidates
    .map((element, index) => captureElement(element, index))
    .filter((field): field is CapturedField => !!field);

  const domFingerprint: DomFingerprint = {
    title: document.title,
    inputCount: document.querySelectorAll("input").length,
    textareaCount: document.querySelectorAll("textarea").length,
    selectCount: document.querySelectorAll("select").length,
    contentEditableCount: document.querySelectorAll("[contenteditable='true']").length
  };

  return {
    id,
    title,
    tags,
    createdAt,
    pageTitle: document.title,
    url: window.location.href,
    origin: url.origin,
    path: url.pathname,
    hostname: url.hostname,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    domFingerprint,
    fields
  };
}
