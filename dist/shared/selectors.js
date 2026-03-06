function cssEscape(value) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(value);
    }
    return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~\s])/g, "\\$1");
}
export function buildDomPath(element) {
    const segments = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && segments.length < 8) {
        const tag = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (!parent) {
            segments.unshift(tag);
            break;
        }
        const siblings = Array.from(parent.children).filter((child) => child.tagName === current?.tagName);
        const idx = siblings.indexOf(current) + 1;
        segments.unshift(`${tag}:nth-of-type(${Math.max(1, idx)})`);
        current = parent;
    }
    return segments.join(" > ");
}
export function getBestSelector(element) {
    const id = element.getAttribute("id");
    if (id && !/^\d+$/.test(id)) {
        return `#${cssEscape(id)}`;
    }
    const name = element.getAttribute("name");
    if (name) {
        return `${element.tagName.toLowerCase()}[name="${cssEscape(name)}"]`;
    }
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) {
        return `${element.tagName.toLowerCase()}[aria-label="${cssEscape(ariaLabel)}"]`;
    }
    const placeholder = element.getAttribute("placeholder");
    if (placeholder) {
        return `${element.tagName.toLowerCase()}[placeholder="${cssEscape(placeholder)}"]`;
    }
    return buildDomPath(element);
}
export function isRelevantElement(element) {
    if (element instanceof HTMLInputElement) {
        return element.type !== "file" && element.type !== "password";
    }
    return (element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLElement);
}
