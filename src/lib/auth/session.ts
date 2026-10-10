export const DEMO_COOKIE = "mandate_demo";
const SESSION_LABEL = "mandate-demo-session";

export async function sessionToken(passcode: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passcode),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(SESSION_LABEL));
  return hex(signature);
}

export async function passcodeMatches(given: string): Promise<boolean> {
  const passcode = configuredPasscode();
  if (!passcode) {
    return false;
  }
  const expected = await sessionToken(passcode);
  const actual = await sessionToken(given);
  return timingSafeEqual(actual, expected);
}

export async function sessionMatches(request: Request): Promise<"ok" | "missing" | "unconfigured"> {
  const passcode = configuredPasscode();
  if (!passcode) {
    return "unconfigured";
  }
  const cookie = readCookie(request, DEMO_COOKIE);
  if (!cookie) {
    return "missing";
  }
  const expected = await sessionToken(passcode);
  return timingSafeEqual(cookie, expected) ? "ok" : "missing";
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) {
    return null;
  }
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

export function configuredPasscode(): string | null {
  const passcode = process.env.DEMO_PASSCODE?.trim();
  return passcode ? passcode : null;
}

export async function testSessionCookie(): Promise<string> {
  process.env.DEMO_PASSCODE = "demo-gate";
  return `${DEMO_COOKIE}=${await sessionToken("demo-gate")}`;
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}
