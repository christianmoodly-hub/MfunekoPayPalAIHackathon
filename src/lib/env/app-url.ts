export function appOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.APP_URL?.trim();
  if (!raw) {
    throw new Error("APP_URL is not set.");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("APP_URL is not a valid URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("APP_URL must use http or https.");
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("APP_URL must be an origin with no path, query, or credentials.");
  }

  return url.origin;
}

export function appUrl(path: string, env: NodeJS.ProcessEnv = process.env): URL {
  return new URL(path, appOrigin(env));
}
