/**
 * Menu packages on a proposal are ordinary pricing lines. A package is
 * "picked" when its line is on the proposal; picking adds the line and
 * unpicking removes it, so saving can never add a package a second time.
 *
 * Saves before this fix appended the picked packages to lines that already
 * held them, so one package could appear twice. These helpers find and remove
 * those copies.
 */
export type PricingLine = { description: string; qty: number; unitPrice: number; total: number };

const PACKAGE_PREFIX: Record<string, string> = {
  food: "🍽 Food Package",
  beverages: "🍷 Beverages Package",
  food_and_beverages: "🍽🍷 Food & Beverages Package",
};

/** The pricing-line text for a package, e.g. "🍽 Food Package: Shared Franco". */
export function packageLineDescription(pkg: { type?: string | null; name: string }): string {
  return `${PACKAGE_PREFIX[pkg.type ?? ""] ?? PACKAGE_PREFIX.food_and_beverages}: ${pkg.name}`;
}

const PACKAGE_LINE_RE = /^(🍽🍷 Food & Beverages Package|🍽 Food Package|🍷 Beverages Package): /u;
export function isPackageLine(description: string | null | undefined): boolean {
  return PACKAGE_LINE_RE.test(String(description ?? ""));
}

/** Package lines that appear more than once, by name, with how many extra copies. */
export function duplicatePackageLines(lines: PricingLine[]): Array<{ description: string; extra: number }> {
  const counts = new Map<string, number>();
  for (const l of lines) if (isPackageLine(l.description)) counts.set(l.description, (counts.get(l.description) ?? 0) + 1);
  return Array.from(counts.entries()).filter(([, n]) => n > 1).map(([description, n]) => ({ description, extra: n - 1 }));
}

/** The lines with every repeated package line after the first removed. Other lines are untouched. */
export function withoutDuplicatePackageLines<T extends PricingLine>(lines: T[]): T[] {
  const seen = new Set<string>();
  return lines.filter(l => {
    if (!isPackageLine(l.description)) return true;
    if (seen.has(l.description)) return false;
    seen.add(l.description);
    return true;
  });
}

/** The package name from its line ("🍽 Food Package: Shared Franco" → "Shared Franco"). */
export function packageNameFromLine(description: string): string {
  return description.replace(PACKAGE_LINE_RE, "");
}
