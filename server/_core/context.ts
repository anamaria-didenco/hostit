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
  /** Set for an extra login (Settings → Team → Account logins). */
  loginId?: number | null;
  /** Set for a team-access-link session, with that member's role. */
  teamMemberId?: number | null;
  teamRole?: string | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let isTeamMember = false;
  let isStaff = false;
  let actorName: string | null = null;
  let loginId: number | null = null;
  let teamMemberId: number | null = null;
  let teamRole: string | null = null;

  try {
    const auth = await sdk.authenticateWithAccess(opts.req);
    user = auth.user;
    isTeamMember = auth.access.isTeamMember;
    isStaff = auth.access.isStaff;
    loginId = auth.access.loginId;
    teamMemberId = auth.access.teamMemberId;
    teamRole = auth.access.teamRole;
    const cookies = parseCookies(opts.req.headers.cookie ?? "");
    const sessionInfo = await sdk.verifySession(cookies[COOKIE_NAME]);
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
    loginId,
    teamMemberId,
    teamRole,
  };
}
