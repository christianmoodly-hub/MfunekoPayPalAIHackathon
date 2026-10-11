const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function readLocalTestDatabaseUrl(): string | null {
  const value = process.env.DATABASE_URL_TEST;
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("DATABASE_URL_TEST must be a local PostgreSQL URL.");
  }
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    !LOCAL_DATABASE_HOSTS.has(parsed.hostname.toLowerCase())
  ) {
    throw new Error("DATABASE_URL_TEST must point to localhost; hosted database URLs are refused.");
  }

  return value;
}
