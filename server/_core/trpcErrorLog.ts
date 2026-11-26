import type { TRPCError } from "@trpc/server";
import { invalidField } from "./trpc";

// Expected outcomes (bad input, not found, not allowed) aren't errors worth
// logging as failures.
const EXPECTED_CODES = ["BAD_REQUEST", "NOT_FOUND", "UNAUTHORIZED", "FORBIDDEN", "CONFLICT", "PRECONDITION_FAILED", "TOO_MANY_REQUESTS"];

// The public enquiry form's own calls. A refusal there is a visitor who may
// give up, so each one is logged (one line, no values) to show how often
// they happen. Staff screens' validation errors stay out of the log.
const ENQUIRY_PATHS = new Set(["leads.startCapture", "leads.submit", "leads.touchPartial"]);

/** The tRPC onError hook (see _core/index.ts). */
export function logTrpcError({ error, path, type, ctx }: { error: TRPCError; path?: string; type?: string; ctx?: unknown }) {
  if (error.code === "BAD_REQUEST" && path && ENQUIRY_PATHS.has(path)) {
    const issues = (error.cause as { issues?: { code?: unknown }[] } | undefined)?.issues;
    const code = Array.isArray(issues) && typeof issues[0]?.code === "string" ? issues[0].code : null;
    // Which field and which rule; never what was typed.
    console.warn(JSON.stringify({ level: "warn", source: "enquiry-refused", path, field: invalidField(error) ?? null, code }));
    return;
  }
  if (EXPECTED_CODES.includes(error.code)) return;
  console.error(JSON.stringify({
    level: "error", source: "trpc", path, type, code: error.code,
    ownerId: (ctx as any)?.user?.id ?? null,
    // A failed query's message ends with the submitted values — keep
    // the SQL and the database's reason, drop the params.
    message: error.message.split(/\nparams:/)[0],
    dbReason: (error.cause as any)?.cause?.message ?? (error.cause as any)?.detail ?? undefined,
    stack: ((error.cause as any)?.stack ?? error.stack)?.split(/\nparams:/)[0],
  }));
}
