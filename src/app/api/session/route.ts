import { NextResponse } from "next/server";
import { z } from "zod";

import { DEMO_COOKIE, configuredPasscode, passcodeMatches, sessionToken } from "@/lib/auth/session";

const bodySchema = z.strictObject({
  passcode: z.string().min(1),
});

export async function POST(request: Request) {
  if (!configuredPasscode()) {
    return Response.json({ error: "DEMO_PASSCODE is not set." }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Passcode is required." }, { status: 400 });
  }
  if (!(await passcodeMatches(parsed.data.passcode))) {
    return Response.json({ error: "Passcode is incorrect." }, { status: 401 });
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
