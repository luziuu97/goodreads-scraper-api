import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAccess } from "@/lib/admin-auth";

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const path = req.nextUrl.pathname;
    const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    console.log(`[API REQUEST] ${timestamp} | ${method} ${path}`, {
      params: searchParams,
      ip,
      userAgent,
    });

    if (path.startsWith("/api/admin/")) {
      const auth = verifyAdminAccess(req);
      if (!auth.allowed && auth.response) {
        console.warn(`[ADMIN ACCESS DENIED] IP '${auth.ip}' blocked for path ${path}`);
        return auth.response;
      }
    }
  }

  return NextResponse.next();
}


export const config = {
  matcher: "/api/:path*",
};
