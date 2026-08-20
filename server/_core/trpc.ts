import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

/**
 * Staff logins are restricted to viewing events and runsheets. Enforcement
 * lives here rather than in each router so nothing can be reached by calling
 * the API directly — hiding buttons in the UI is not a permission model.
 *
 * The rule is deny-by-default for anything that changes data, plus an explicit
 * denylist for sensitive *reads*. Written this way round because a new
 * procedure added later is then blocked for staff until someone deliberately
 * opens it, rather than silently exposed.
 */
const STAFF_BLOCKED_READ_PREFIXES = [
  "payments.",       // money in/out
  "xero.",           // accounting + invoices
  "accountLogins.",  // could mint themselves an owner login
  "reports.",        // revenue reporting
  "dashboard.",      // revenue tiles
  "proposals.",      // pricing sent to clients
  "quote",           // quote settings/items — pricing
  "contacts.",       // full client contact book
  "leads.list",      // enquiry pipeline incl. budgets
  "leads.get",
];
/** Mutations a staff login MAY perform (none today — read-only by choice). */
const STAFF_ALLOWED_MUTATIONS: string[] = [];

export function staffMayCall(path: string, type: "query" | "mutation" | "subscription"): boolean {
  if (type !== "query") return STAFF_ALLOWED_MUTATIONS.includes(path);
  return !STAFF_BLOCKED_READ_PREFIXES.some(p => path.startsWith(p));
}

const restrictStaff = t.middleware(async opts => {
  const { ctx, next, path, type } = opts;
  if (ctx.isStaff && !staffMayCall(path, type)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This is a staff login — it can view events and runsheets only.",
    });
  }
  return next();
});

export const protectedProcedure = t.procedure.use(requireUser).use(restrictStaff);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
