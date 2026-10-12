import { describe, expect, it } from "vitest";
import {
  duplicatePackageLines, isPackageLine, packageLineDescription, packageNameFromLine, withoutDuplicatePackageLines,
} from "../shared/proposalPackages";

const pkgLine = packageLineDescription({ type: "food", name: "Shared Franco" });
const line = (description: string, qty = 40, unitPrice = 92) => ({ description, qty, unitPrice, total: qty * unitPrice });

describe("proposal package lines", () => {
  it("names package lines the way saved proposals already do", () => {
    expect(pkgLine).toBe("🍽 Food Package: Shared Franco");
    expect(packageLineDescription({ type: "beverages", name: "Bubbles" })).toBe("🍷 Beverages Package: Bubbles");
    expect(packageLineDescription({ type: "food_and_beverages", name: "All in" })).toBe("🍽🍷 Food & Beverages Package: All in");
    expect(isPackageLine(pkgLine)).toBe(true);
    expect(isPackageLine("Venue Hire")).toBe(false);
    expect(packageNameFromLine(pkgLine)).toBe("Shared Franco");
  });

  it("finds a package saved twice and removes only the extra copy", () => {
    const lines = [line("Venue Hire", 1, 500), line(pkgLine), line(pkgLine)];
    expect(duplicatePackageLines(lines)).toEqual([{ description: pkgLine, extra: 1 }]);
    const fixed = withoutDuplicatePackageLines(lines);
    expect(fixed.map(l => l.description)).toEqual(["Venue Hire", pkgLine]);
    expect(fixed.reduce((s, l) => s + l.total, 0)).toBe(500 + 40 * 92);
  });

  it("leaves repeated non-package lines alone", () => {
    const lines = [line("Staff", 1, 50), line("Staff", 1, 50)];
    expect(duplicatePackageLines(lines)).toEqual([]);
    expect(withoutDuplicatePackageLines(lines)).toHaveLength(2);
  });
});

describe("doubled proposal report", async () => {
  const { doubledProposal } = await import("./proposalDoubleCheck");
  it("works out how much too high a doubled proposal is, including tax", () => {
    const lines = [line("Venue Hire", 1, 500), line(pkgLine), line(pkgLine)];
    const d = doubledProposal({ id: 7, ownerId: 1, title: "Engagement", status: "sent", lineItems: JSON.stringify(lines), taxPercent: "15" });
    expect(d?.packages).toEqual(["Shared Franco"]);
    expect(d?.excessInclTax).toBe(4232); // 40 × $92 = $3,680 + 15%
  });
  it("ignores clean proposals and unreadable lines", () => {
    expect(doubledProposal({ id: 1, ownerId: 1, title: "x", status: "draft", lineItems: JSON.stringify([line(pkgLine)]), taxPercent: 15 })).toBeNull();
    expect(doubledProposal({ id: 1, ownerId: 1, title: "x", status: "draft", lineItems: "not json", taxPercent: 15 })).toBeNull();
  });
});
