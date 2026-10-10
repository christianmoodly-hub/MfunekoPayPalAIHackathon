import { requireSession } from "@/lib/auth/guard";
import { clientIp, takeRateLimit } from "@/lib/auth/rate-limit";
import { createGeminiGenerate } from "@/lib/gemini/client";
import { readGeminiEnv } from "@/lib/gemini/env";
import { redactSecrets } from "@/lib/gemini/redact";
import { MandateParseError } from "@/lib/mandate/parse";
import { parseRequestSchema } from "@/lib/mandate/schema";
import { createMandateFromText } from "@/lib/mandate/service";
import { MandateStoreError } from "@/lib/mandate/store";

export async function POST(request: Request) {
  const denied = await requireSession(request);
  if (denied) {
    return denied;
  }
  if (!takeRateLimit(`parse:${clientIp(request)}`)) {
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = parseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Text is required." }, { status: 400 });
  }

  try {
    const { apiKey, model } = readGeminiEnv();
    const mandate = await createMandateFromText(parsed.data.text, {
      generate: createGeminiGenerate(apiKey),
      model,
    });
    return Response.json({ mandate });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof MandateParseError || error instanceof MandateStoreError) {
    return Response.json({ error: error.message }, { status: error.statusCode });
  }

  if (error instanceof Error && error.message.endsWith("is not set.")) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ error: redactSecrets("Could not parse the mandate.") }, { status: 500 });
}
