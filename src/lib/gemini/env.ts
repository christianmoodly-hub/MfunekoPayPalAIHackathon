export function readGeminiEnv(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set.");
  }
  if (!model) {
    throw new Error("GEMINI_MODEL is not set.");
  }

  return { apiKey, model };
}
