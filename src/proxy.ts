import { NextResponse, type NextRequest } from "next/server";

import { sessionMatches } from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/enter" || pathname === "/api/session") {
    return NextResponse.next();
  }

  const state = await sessionMatches(request);
  if (state === "ok") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    const status = state === "unconfigured" ? 500 : 401;
    const error = state === "unconfigured" ? "DEMO_PASSCODE is not set." : "Sign in required.";
    return NextResponse.json({ error }, { status });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/enter";
  url.search = "";
  if (pathname.startsWith("/") && !pathname.startsWith("//")) {
    url.searchParams.set("next", pathname);
  }
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
