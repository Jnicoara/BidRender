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

  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    path: "/",
    // Lax on https too, since 2026-10-15 (A-S9b, security-sweep.md on
    // track-c). It was None on https — a leftover from the Manus preview,
    // which ran the app inside another site's frame. With None, a hostile
    // page could send a request that carried the session; Lax sends it only
    // on the app's own pages and on a top-level link INTO the app (a reset
    // email, a bookmark), which is everything this app needs. csrfGuard
    // (track-c) closes the form-POST case on its own; this closes the class.
    // Lax is also what a plain-http local run needs: a None cookie that is
    // not Secure is discarded and sign-in bounces back to the form.
    sameSite: "lax",
    secure,
  };
}
