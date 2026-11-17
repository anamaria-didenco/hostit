// Smooth scrolling unless the person has asked their device for reduced motion:
// an explicit `behavior: "smooth"` in a scroll call ignores the CSS rule for it.
export const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
