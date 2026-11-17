import { describe, expect, it } from "vitest";
import { normaliseTaskPriority, taskDuePrefix, taskDueState } from "../shared/taskFields";

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

describe("taskDueState", () => {
  const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
  const now = at(2026, 11, 17, 15, 30);

  it("a task due earlier today is due today, not overdue (both places agree)", () => {
    expect(taskDueState(at(2026, 11, 17, 12), now)).toBe("today");
    expect(taskDueState(at(2026, 11, 17, 0), now)).toBe("today");
    expect(taskDueState(at(2026, 11, 17, 23, 59), now)).toBe("today");
  });

  it("yesterday or before is overdue; tomorrow on is later", () => {
    expect(taskDueState(at(2026, 11, 16, 23, 59), now)).toBe("overdue");
    expect(taskDueState(at(2026, 10, 1), now)).toBe("overdue");
    expect(taskDueState(at(2026, 11, 18, 0), now)).toBe("later");
  });

  it("words before the date", () => {
    expect(taskDuePrefix("overdue")).toBe("Overdue — ");
    expect(taskDuePrefix("today")).toBe("Due today — ");
    expect(taskDuePrefix("later")).toBe("Due ");
  });
});
