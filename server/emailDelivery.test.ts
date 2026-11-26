import { describe, it, expect } from "vitest";
import {
  AUTO_REPLY_RETRY, EMAIL_DELIVERY_STATUSES, EMAIL_ERROR_MAX, EMAIL_RETRY_BACKOFF_MS, EMAIL_SENDING_LEASE_MS,
  SMTP_TIMEOUTS, VENUE_EMAIL_RETRY, describeSmtpError, nextEmailAttemptAt,
} from "@shared/emailDelivery";

const MIN = 60_000;
const queued = new Date("2026-12-01T07:00:00.000Z");
const at = (min: number) => new Date(queued.getTime() + min * MIN);

describe("email retries", () => {
  it("waits longer after each failed try", () => {
    expect(nextEmailAttemptAt(1, queued, at(0), VENUE_EMAIL_RETRY)).toEqual(at(1));
    expect(nextEmailAttemptAt(2, queued, at(1), VENUE_EMAIL_RETRY)).toEqual(at(3));
    expect(nextEmailAttemptAt(3, queued, at(3), VENUE_EMAIL_RETRY)).toEqual(at(8));
    expect(EMAIL_RETRY_BACKOFF_MS.every((ms, i) => i === 0 || ms >= EMAIL_RETRY_BACKOFF_MS[i - 1])).toBe(true);
  });

  it("gives the venue's email every try within two hours, then gives up", () => {
    let now = at(0);
    let tries = 0;
    for (let attempts = 1; ; attempts++) {
      tries = attempts;
      const next = nextEmailAttemptAt(attempts, queued, now, VENUE_EMAIL_RETRY);
      if (!next) break;
      expect(next.getTime() - queued.getTime()).toBeLessThanOrEqual(VENUE_EMAIL_RETRY.retryForMs);
      now = next;
    }
    expect(tries).toBe(VENUE_EMAIL_RETRY.maxAttempts);
    // Tries keep going for over an hour of mail-server trouble.
    expect(now.getTime() - queued.getTime()).toBeGreaterThan(60 * MIN);
  });

  it("stops on the time limit even with tries left", () => {
    expect(nextEmailAttemptAt(2, queued, at(119.5), VENUE_EMAIL_RETRY)).toBeNull();
    expect(nextEmailAttemptAt(1, queued, at(29.5), AUTO_REPLY_RETRY)).toBeNull();
  });

  it("tries the visitor's confirmation only a few times", () => {
    expect(nextEmailAttemptAt(1, queued, at(0), AUTO_REPLY_RETRY)).toEqual(at(1));
    expect(nextEmailAttemptAt(2, queued, at(1), AUTO_REPLY_RETRY)).toEqual(at(3));
    expect(nextEmailAttemptAt(3, queued, at(3), AUTO_REPLY_RETRY)).toBeNull();
  });

  it("has a claim that outlasts a slow send", () => {
    const slowest = SMTP_TIMEOUTS.connectionTimeout + SMTP_TIMEOUTS.greetingTimeout + SMTP_TIMEOUTS.socketTimeout * 3;
    expect(EMAIL_SENDING_LEASE_MS).toBeGreaterThan(slowest);
    expect(EMAIL_DELIVERY_STATUSES).toEqual(["pending", "sending", "sent", "failed", "skipped"]);
  });
});

describe("describing a failed send", () => {
  it("keeps the reply code, the stage and the server's words", () => {
    const err = Object.assign(new Error("Message failed: 451 4.3.0 Temporary failure"), {
      code: "EMESSAGE", responseCode: 451, command: "DATA", response: "451 4.3.0 Temporary failure",
    });
    expect(describeSmtpError(err)).toBe("451 EMESSAGE (DATA): 451 4.3.0 Temporary failure");
  });

  it("covers a connection refused at the greeting (Gmail's 421)", () => {
    const err = Object.assign(new Error("Greeting never received"), { code: "ETIMEDOUT", command: "CONN" });
    expect(describeSmtpError(err)).toBe("ETIMEDOUT (CONN): Greeting never received");
    const busy = Object.assign(new Error("x"), { code: "EPROTOCOL", responseCode: 421, response: "421 4.7.0 Try again later, closing connection." });
    expect(describeSmtpError(busy)).toBe("421 EPROTOCOL: 421 4.7.0 Try again later, closing connection.");
  });

  it("never keeps an email address", () => {
    const err = Object.assign(new Error("Can't send mail - all recipients were rejected"), {
      code: "EENVELOPE", responseCode: 550, command: "RCPT TO",
      response: "550 5.1.1 <events@venue.example.test>: Recipient address rejected: aroha.t@example.test unknown",
    });
    const line = describeSmtpError(err);
    expect(line).not.toMatch(/@/);
    expect(line).toBe("550 EENVELOPE (RCPT): 550 5.1.1 <<address>>: Recipient address rejected: <address> unknown");
  });

  it("copes with odd errors and stays short", () => {
    expect(describeSmtpError(null)).toBe("Unknown error");
    expect(describeSmtpError(undefined)).toBe("Unknown error");
    expect(describeSmtpError("socket hang up")).toBe("socket hang up");
    expect(describeSmtpError({})).toBe("Unknown error");
    expect(describeSmtpError(new Error("x".repeat(2000))).length).toBe(EMAIL_ERROR_MAX);
    expect(describeSmtpError(new Error("line one\n  line two"))).toBe("line one line two");
  });
});
