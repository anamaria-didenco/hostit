import { useEffect, type RefObject } from "react";

/**
 * Tell screen readers which fields have an error: aria-invalid on the field and
 * the error text's id ("<key>-error") added to its aria-describedby, alongside
 * any hint already there. `key` is the field's id, or its name inside `formRef`.
 *
 * It is set on the elements rather than in each field's JSX so long settings
 * forms only gain the error lines; the effect re-applies after every render.
 */
export function useFieldErrorAria(errors: Record<string, string>, keys: readonly string[], formRef?: RefObject<HTMLFormElement | null>) {
  useEffect(() => {
    for (const key of keys) markInvalid(fieldElement(key, formRef), `${key}-error`, !!errors[key]);
  });
}

/** Set or clear aria-invalid on one field, adding or removing `errorId` in its aria-describedby. */
export function markInvalid(el: Element | null | undefined, errorId: string, invalid: boolean) {
  if (!el) return;
  const ids = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(t => t && t !== errorId);
  if (invalid) {
    el.setAttribute("aria-invalid", "true");
    ids.push(errorId);
  } else {
    el.removeAttribute("aria-invalid");
  }
  if (ids.length) el.setAttribute("aria-describedby", ids.join(" "));
  else el.removeAttribute("aria-describedby");
}

/** Put focus on the first field (in `keys` order) that has an error. */
export function focusFirstError(errors: Record<string, string>, keys: readonly string[], formRef?: RefObject<HTMLFormElement | null>) {
  const first = keys.find(k => errors[k]);
  if (first) fieldElement(first, formRef)?.focus();
}

function fieldElement(key: string, formRef?: RefObject<HTMLFormElement | null>): HTMLElement | null {
  const named = formRef?.current?.elements.namedItem(key);
  if (named instanceof HTMLElement) return named;
  return document.getElementById(key);
}
