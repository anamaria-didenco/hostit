import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { parse as parseCookies } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  isTeamMember: boolean;
  isStaff: boolean;
  /** Display name from the session — for a team-link login this is the team
   *  member's own name (ctx.user is the venue owner they act under). */
  actorName: string | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let isTeamMember = false;
  let isStaff = false;
  let actorName: string | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
    const cookies = parseCookies(opts.req.headers.cookie ?? "");
    const sessionInfo = await sdk.verifySession(cookies[COOKIE_NAME]);
    isTeamMember = sessionInfo?.isTeamMember === true;
    isStaff = sessionInfo?.isStaff === true;
    actorName = sessionInfo?.name ?? null;
  } catch (error) {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    isTeamMember,
    isStaff,
    actorName,
  };
}
