export function readChannel3Env(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = env.CHANNEL3_API_KEY;
  if (!apiKey) {
    throw new Error("CHANNEL3_API_KEY is not set.");
  }

  return { apiKey };
}
