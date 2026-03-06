function dispatchFieldEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
}
function findByLabelText(field) {
    if (!field.labelText)
        return null;
    const labels = Array.from(document.querySelectorAll("label"));
    const matching = labels.find((label) => label.textContent?.trim() === field.labelText);
    if (!matching)
        return null;
    const forId = matching.getAttribute("for");
    if (forId) {
        return document.getElementById(forId);
    }
    return matching.querySelector("input, textarea, select, [contenteditable='true']");
}
function firstFound(...elements) {
    for (const element of elements) {
        if (element instanceof HTMLElement)
            return element;
    }
    return null;
}
function findTarget(field) {
    const selectorHit = field.selector ? document.querySelector(field.selector) : null;
    const idHit = field.id ? document.getElementById(field.id) : null;
    const nameHit = field.name
        ? document.querySelector(`${field.tag}[name="${CSS.escape(field.name)}"]`)
        : null;
    const ariaHit = field.ariaLabel
        ? document.querySelector(`${field.tag}[aria-label="${CSS.escape(field.ariaLabel)}"]`)
        : null;
    const placeholderHit = field.placeholder
        ? document.querySelector(`${field.tag}[placeholder="${CSS.escape(field.placeholder)}"]`)
        : null;
    const labelHit = findByLabelText(field);
    const domPathHit = field.domPath ? document.querySelector(field.domPath) : null;
    return firstFound(selectorHit, idHit, nameHit, ariaHit, placeholderHit, labelHit, domPathHit);
}
function applyFieldValue(target, field) {
    if (target instanceof HTMLInputElement) {
        if (["checkbox", "radio"].includes(target.type)) {
            if (typeof field.checked === "boolean") {
                target.checked = field.checked;
                dispatchFieldEvents(target);
                return true;
            }
            return false;
        }
        if (typeof field.value === "string") {
            target.value = field.value;
            dispatchFieldEvents(target);
            return true;
        }
        return false;
    }
    if (target instanceof HTMLTextAreaElement) {
        target.value = field.value ?? "";
        dispatchFieldEvents(target);
        return true;
    }
    if (target instanceof HTMLSelectElement) {
        const incoming = field.selectedValues || [];
        for (const option of Array.from(target.options)) {
            option.selected = incoming.includes(option.value);
        }
        dispatchFieldEvents(target);
        return true;
    }
    if (target.isContentEditable) {
        target.textContent = field.textContent ?? "";
        dispatchFieldEvents(target);
        return true;
    }
    return false;
}
async function waitForDomStability(timeoutMs = 3000) {
    const settleWindow = 250;
    const startedAt = Date.now();
    await new Promise((resolve) => {
        let settleTimer = window.setTimeout(done, settleWindow);
        const observer = new MutationObserver(() => {
            window.clearTimeout(settleTimer);
            settleTimer = window.setTimeout(done, settleWindow);
        });
        function done() {
            observer.disconnect();
            resolve();
        }
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: false
        });
        const interval = window.setInterval(() => {
            if (Date.now() - startedAt >= timeoutMs) {
                window.clearInterval(interval);
                window.clearTimeout(settleTimer);
                done();
            }
        }, 100);
    });
}
export async function restorePageSnapshot(snapshot) {
    await waitForDomStability(3000);
    const warnings = [];
    let restoredCount = 0;
    let missingCount = 0;
    let skippedCount = 0;
    for (const field of snapshot.fields) {
        const target = findTarget(field);
        if (!target) {
            missingCount += 1;
            continue;
        }
        const restored = applyFieldValue(target, field);
        if (restored) {
            restoredCount += 1;
        }
        else {
            skippedCount += 1;
            warnings.push(`Could not apply value for ${field.key}`);
        }
    }
    window.scrollTo({ left: snapshot.scrollX, top: snapshot.scrollY, behavior: "auto" });
    return {
        totalFields: snapshot.fields.length,
        restoredCount,
        skippedCount,
        missingCount,
        warnings
    };
}
