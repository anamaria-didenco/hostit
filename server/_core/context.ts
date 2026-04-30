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
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let isTeamMember = false;

  try {
    user = await sdk.authenticateRequest(opts.req);
    const cookies = parseCookies(opts.req.headers.cookie ?? "");
    const sessionInfo = await sdk.verifySession(cookies[COOKIE_NAME]);
    isTeamMember = sessionInfo?.isTeamMember === true;
  } catch (error) {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    isTeamMember,
  };
}
