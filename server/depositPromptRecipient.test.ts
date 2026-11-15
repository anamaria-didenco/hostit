import { describe, it, expect, afterEach } from "vitest";
import { depositPromptRecipient } from "./depositPrompt";

const prev = process.env.DEPOSIT_PROMPT_EMAIL;
afterEach(() => {
  if (prev === undefined) delete process.env.DEPOSIT_PROMPT_EMAIL; else process.env.DEPOSIT_PROMPT_EMAIL = prev;
});

describe("deposit reminder recipient", () => {
  it("uses the venue's own notification email, then its SMTP sender", () => {
    delete process.env.DEPOSIT_PROMPT_EMAIL;
    expect(depositPromptRecipient({ notificationEmail: "events@a.nz", smtpFromEmail: "from@a.nz", smtpUser: "u@a.nz" })).toBe("events@a.nz");
    expect(depositPromptRecipient({ smtpFromEmail: "from@a.nz", smtpUser: "u@a.nz" })).toBe("from@a.nz");
    expect(depositPromptRecipient({ smtpUser: "u@a.nz" })).toBe("u@a.nz");
  });
  it("lets the env var override", () => {
    process.env.DEPOSIT_PROMPT_EMAIL = "ops@a.nz";
    expect(depositPromptRecipient({ notificationEmail: "events@a.nz" })).toBe("ops@a.nz");
  });
  it("is empty when nothing is known, never a hard-coded address", () => {
    delete process.env.DEPOSIT_PROMPT_EMAIL;
    expect(depositPromptRecipient({})).toBe("");
    expect(depositPromptRecipient({ notificationEmail: "  ", smtpUser: null })).toBe("");
  });
});
