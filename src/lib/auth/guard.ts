import { sessionMatches } from "./session";

export async function requireSession(request: Request): Promise<Response | null> {
  const state = await sessionMatches(request);
  if (state === "ok") {
    return null;
  }
  if (state === "unconfigured") {
    return Response.json({ error: "DEMO_PASSCODE is not set." }, { status: 500 });
  }
  return Response.json({ error: "Sign in required." }, { status: 401 });
}
