import { after } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/guard";
import { clientIp, takeRateLimit } from "@/lib/auth/rate-limit";
import { redactSecrets } from "@/lib/gemini/redact";
import { MandateStoreError } from "@/lib/mandate/store";
import { createRun, executeRun } from "@/lib/runs/service";

const bodySchema = z.strictObject({
  mandateId: z.string().uuid(),
});

export async function POST(request: Request) {
  const denied = await requireSession(request);
  if (denied) {
    return denied;
  }
  if (!takeRateLimit(`run:${clientIp(request)}`)) {
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "A mandate id is required." }, { status: 400 });
  }

  try {
    const run = await createRun(parsed.data.mandateId);
    after(() => executeRun(run.id));
    return Response.json({ run }, { status: 202 });
  } catch (error) {
    if (error instanceof MandateStoreError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    return Response.json({ error: redactSecrets("Could not start the run.") }, { status: 500 });
  }
}
