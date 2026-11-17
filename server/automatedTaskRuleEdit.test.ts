import { describe, expect, it } from "vitest";
import { parseTaskRules, replaceTaskRule, taskRuleFormValues, taskRuleKey, type SavedTaskRule } from "../shared/automatedTasks";

describe("editing an automated task rule", () => {
  const withId: SavedTaskRule = { id: "rule-abc", name: "Confirm numbers", trigger: "days_before_event", daysOffset: "7", priority: "high" };
  const legacy: SavedTaskRule = { name: "Send menu", trigger: "on_booking_confirmed", daysOffset: "2", priority: "medium" };
  const broken: SavedTaskRule = { name: "Old thing", trigger: "on_something_gone", daysOffset: "1", priority: "low" };

  it("opens the form with the rule's values", () => {
    expect(taskRuleFormValues(withId)).toEqual({ name: "Confirm numbers", trigger: "days_before_event", daysOffset: "7", priority: "high", status: "" });
    expect(taskRuleFormValues(legacy)).toMatchObject({ priority: "medium", trigger: "on_booking_confirmed" });
    expect(taskRuleFormValues({ name: "Pack", trigger: "on_function_pack_sent", daysOffset: "5", priority: "normal" }))
      .toEqual({ name: "Pack", trigger: "on_status_change", daysOffset: "5", priority: "medium", status: "function_pack_sent" });
  });

  it("keeps the rule's id, so it doesn't fire again for records it already made a task for", () => {
    const next = replaceTaskRule([withId, legacy], { key: "rule-abc", index: 0 }, { name: "Confirm final numbers", trigger: "days_before_event", daysOffset: "10", priority: "low" })!;
    expect(next[0]).toEqual({ id: "rule-abc", name: "Confirm final numbers", trigger: "days_before_event", daysOffset: "10", priority: "low" });
    expect(next[1]).toBe(legacy);
    expect(parseTaskRules(next)[0].key).toBe("rule-abc");
  });

  it("gives a rule saved before ids its old legacy key as its id", () => {
    const oldKey = taskRuleKey(legacy)!;
    expect(oldKey).toMatch(/^legacy:/);
    const next = replaceTaskRule([withId, legacy], { key: oldKey, index: 1 }, { name: "Send the menu", trigger: "on_booking_confirmed", daysOffset: "3", priority: "medium" })!;
    expect(next[1].id).toBe(oldKey);
    expect(parseTaskRules(next)[1].key).toBe(oldKey);
  });

  it("finds the rule by its key even if the list moved, and says when it's gone", () => {
    const moved = [legacy, withId];
    const next = replaceTaskRule(moved, { key: "rule-abc", index: 0 }, { name: "X", trigger: "days_before_event", daysOffset: "1", priority: "low" })!;
    expect(next[0]).toBe(legacy);
    expect(next[1].id).toBe("rule-abc");
    expect(replaceTaskRule([legacy], { key: "rule-abc", index: 0 }, { name: "X" })).toBeNull();
  });

  it("lets a rule that can't run be fixed, with a new id", () => {
    expect(taskRuleKey(broken)).toBeNull();
    const next = replaceTaskRule([broken], { key: null, index: 0 }, { name: "Old thing", trigger: "on_enquiry_received", daysOffset: "1", priority: "low" })!;
    expect(next[0].id).toMatch(/^rule-/);
    expect(parseTaskRules(next)).toHaveLength(1);
  });
});
