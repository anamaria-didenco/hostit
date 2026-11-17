import { describe, expect, it } from "vitest";
import { normaliseTaskPriority } from "../shared/taskFields";

describe("normaliseTaskPriority", () => {
  it("keeps low / normal / high and reads older words sensibly", () => {
    expect(normaliseTaskPriority("low")).toBe("low");
    expect(normaliseTaskPriority("normal")).toBe("normal");
    expect(normaliseTaskPriority("HIGH")).toBe("high");
    expect(normaliseTaskPriority("medium")).toBe("normal");
    expect(normaliseTaskPriority("urgent")).toBe("high");
    expect(normaliseTaskPriority("")).toBe("normal");
    expect(normaliseTaskPriority(null)).toBe("normal");
    expect(normaliseTaskPriority(undefined)).toBe("normal");
  });
});
