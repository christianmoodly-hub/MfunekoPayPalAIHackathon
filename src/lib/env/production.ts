import { appOrigin } from "./app-url";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") {
    return;
  }

  const problems: string[] = [];

  try {
    const origin = appOrigin(env);
    const url = new URL(origin);
    if (url.protocol !== "https:" || LOCAL_HOSTS.has(url.hostname)) {
      problems.push("APP_URL must be a public https origin in production.");
    }
  } catch (error) {
    problems.push(error instanceof Error ? error.message : "APP_URL is invalid.");
  }

  if (!env.DEMO_PASSCODE?.trim()) {
    problems.push("DEMO_PASSCODE is not set.");
  }

  if (env.PAYPAL_ENV !== "sandbox") {
    problems.push("PAYPAL_ENV must be sandbox.");
  }

  if (problems.length > 0) {
    throw new Error(`Refusing to start in production:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
  }
}
