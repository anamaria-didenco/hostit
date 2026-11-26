import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import { logTrpcError } from "./_core/trpcErrorLog";

/**
 * A refusal on the public enquiry form leaves one log line saying which call,
 * which field and which rule, so production can show how often visitors hit
 * one. Never what they typed. Through the real Express adapter and routers,
 * as in _core/index.ts. No database needed: the input check refuses first.
 */
describe("enquiry refusals in the server log", () => {
  let server: Server;
  let base = "";
  beforeAll(async () => {
    const app = express();
    app.use("/api/trpc", createExpressMiddleware({
      router: appRouter,
      createContext: ({ req, res }) => ({ user: null, isTeamMember: false, req, res }) as any,
      onError: logTrpcError,
    }));
    await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/trpc`;
  });
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  const post = (path: string, json: unknown) => fetch(`${base}/${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ json }),
  });
  const refusalLines = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.map(c => String(c[0])).filter(l => l.includes('"enquiry-refused"'));

  it("logs path, field and rule for startCapture, submit and touchPartial, and nothing typed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const typed = "mere.testwell@example.test.";
      const r1 = await post("leads.startCapture", { ownerId: 1, firstName: "Mere", email: typed });
      expect(r1.status).toBe(400);
      expect((await r1.json()).error.json.data.field).toBe("email");
      const r2 = await post("leads.submit", { ownerId: 1, firstName: "Mere", email: "mere@example.test", eventDetail: "Ruby wedding ".repeat(30) });
      expect(r2.status).toBe(400);
      const r3 = await post("leads.touchPartial", { ownerId: 1, leadId: 3 });
      expect(r3.status).toBe(400);
      const lines = refusalLines(warn).map(l => JSON.parse(l));
      expect(lines).toEqual([
        { level: "warn", source: "enquiry-refused", path: "leads.startCapture", field: "email", code: "invalid_format" },
        { level: "warn", source: "enquiry-refused", path: "leads.submit", field: "eventDetail", code: "too_big" },
        { level: "warn", source: "enquiry-refused", path: "leads.touchPartial", field: "leadToken", code: "invalid_type" },
      ]);
      const all = refusalLines(warn).join("\n");
      expect(all).not.toContain("mere");
      expect(all).not.toContain("Ruby");
    } finally {
      warn.mockRestore();
    }
  });

  it("names the field the way the form shows it", async () => {
    const res = await post("leads.submit", { ownerId: 1, firstName: "Mere", email: "mere@example.test", eventDetail: "x".repeat(256) });
    expect((await res.json()).error.json.message).toBe("What's the occasion? is too long (255 characters at most).");
    const res2 = await post("leads.submit", { ownerId: 1, firstName: "Mere", email: "mere@example.test", invoicingNote: "x".repeat(256) });
    expect((await res2.json()).error.json.message).toBe("Invoice to is too long (255 characters at most).");
  });

  it("leaves other procedures' bad input out of the log, and still logs real failures", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      logTrpcError({ error: new TRPCError({ code: "BAD_REQUEST", message: "x" }), path: "leads.update", type: "mutation" });
      logTrpcError({ error: new TRPCError({ code: "NOT_FOUND", message: "x" }), path: "leads.submit", type: "mutation" });
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      logTrpcError({ error: new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed query: insert into leads\nparams: mere@example.test" }), path: "leads.submit", type: "mutation" });
      expect(error).toHaveBeenCalledTimes(1);
      const line = JSON.parse(String(error.mock.calls[0][0]));
      expect(line).toMatchObject({ level: "error", source: "trpc", path: "leads.submit", code: "INTERNAL_SERVER_ERROR", message: "Failed query: insert into leads" });
      expect(String(error.mock.calls[0][0])).not.toContain("mere@");
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });
});
