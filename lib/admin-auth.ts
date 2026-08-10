import { NextRequest, NextResponse } from "next/server";
import { env } from "next-runtime-env";

/**
 * Extracts the client IP address from the request headers.
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");

  let rawIp = "127.0.0.1";
  if (forwarded) {
    rawIp = forwarded.split(",")[0].trim();
  } else if (realIp) {
    rawIp = realIp.trim();
  } else if ((req as any).ip) {
    rawIp = (req as any).ip;
  }

  // Normalize IPv6-mapped IPv4 addresses (e.g., ::ffff:127.0.0.1 -> 127.0.0.1)
  if (rawIp.startsWith("::ffff:")) {
    rawIp = rawIp.substring(7);
  }

  return rawIp;
}

/**
 * Checks if a given IP address is authorized according to the configured list.
 */
export function isIpAllowed(ip: string, allowedIpsConfig?: string): boolean {
  const normIp = ip.startsWith("::ffff:") ? ip.substring(7) : ip;

  const rawConfig =
    allowedIpsConfig !== undefined
      ? allowedIpsConfig
      : process.env.ADMIN_ALLOWED_IPS || env("ADMIN_ALLOWED_IPS") || "";

  const allowedList = rawConfig
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  // If no allowed IPs are specified, default to loopback access for local dev
  if (allowedList.length === 0) {
    return normIp === "127.0.0.1" || normIp === "::1" || normIp === "localhost";
  }

  return allowedList.some((allowed) => {
    let normAllowed = allowed.startsWith("::ffff:") ? allowed.substring(7) : allowed;

    if (normAllowed === "*" || normAllowed === normIp) {
      return true;
    }

    // Loopback equivalencies
    const isLoopbackIp = normIp === "127.0.0.1" || normIp === "::1" || normIp === "localhost";
    const isLoopbackAllowed =
      normAllowed === "127.0.0.1" || normAllowed === "::1" || normAllowed === "localhost";

    if (isLoopbackIp && isLoopbackAllowed) {
      return true;
    }

    return false;
  });
}

/**
 * Helper guard for admin API routes.
 * Returns a 403 Forbidden response if the client IP is not whitelisted.
 */
export function verifyAdminAccess(req: NextRequest): {
  allowed: boolean;
  ip: string;
  response?: NextResponse;
} {
  const ip = getClientIp(req);
  const allowed = isIpAllowed(ip);

  if (!allowed) {
    const errorResponse = NextResponse.json(
      {
        success: false,
        error: `Forbidden: Client IP '${ip}' is not authorized to access admin endpoints.`,
      },
      { status: 403 }
    );
    errorResponse.headers.set("Cache-Control", "no-store");
    return { allowed: false, ip, response: errorResponse };
  }

  return { allowed: true, ip };
}
