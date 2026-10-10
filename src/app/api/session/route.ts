import { NextResponse } from "next/server";
import { z } from "zod";

import { clientIp, delayFailure, SESSION_LIMIT, SESSION_WINDOW_MS, takeRateLimit } from "@/lib/auth/rate-limit";
import { DEMO_COOKIE, configuredPasscode, passcodeMatches, sessionToken } from "@/lib/auth/session";

const bodySchema = z.strictObject({
  passcode: z.string().min(1),
});

export async function POST(request: Request) {
  if (!takeRateLimit(`session:${clientIp(request)}`, Date.now(), SESSION_LIMIT, SESSION_WINDOW_MS)) {
    return reject(429, "Too many attempts. Try again later.");
  }

  if (!configuredPasscode()) {
    return reject(500, "DEMO_PASSCODE is not set.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reject(400, "Request body must be JSON.");
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return reject(400, "Passcode is required.");
  }
  if (!(await passcodeMatches(parsed.data.passcode))) {
    return reject(401, "Passcode is incorrect.");
  }

  const token = await sessionToken(configuredPasscode() ?? "");
  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEMO_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}

function reject(status: number, error: string): Promise<Response> {
  return delayFailure().then(() => {
    const headers = status === 429 ? { "retry-after": String(SESSION_WINDOW_MS / 1000) } : undefined;
    return Response.json({ error }, { status, headers });
  });
}
