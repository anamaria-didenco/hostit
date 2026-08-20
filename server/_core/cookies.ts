import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // const hostname = req.hostname;
  // const shouldSetDomain =
  //   hostname &&
  //   !LOCAL_HOSTS.has(hostname) &&
  //   !isIpAddress(hostname) &&
  //   hostname !== "127.0.0.1" &&
  //   hostname !== "::1";

  // const domain =
  //   shouldSetDomain && !hostname.startsWith(".")
  //     ? `.${hostname}`
  //     : shouldSetDomain
  //       ? hostname
  //       : undefined;

  // SameSite=Lax, not None.
  //
  // A `SameSite=None` cookie without `Secure` is REJECTED outright by every
  // current browser, so on any plain-HTTP origin (local development) login
  // appeared to succeed — the POST returned 200 and the app navigated to the
  // dashboard — while no session cookie was ever stored. Every authenticated
  // page then bounced straight back to /login.
  //
  // `None` also means the session cookie rides along on requests initiated by
  // ANY other site, which is the precondition for CSRF. Nothing here needs it:
  // the only route we allow to be framed cross-site is the public /enquire
  // form, and that talks exclusively to public procedures. Everything
  // authenticated is X-Frame-Options: SAMEORIGIN.
  //
  // Lax still accompanies top-level navigations, so magic links, staff links
  // and OAuth returns are unaffected.
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req),
  };
}
