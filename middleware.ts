import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
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
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
