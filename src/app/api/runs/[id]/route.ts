import { z } from "zod";

import { requireSession } from "@/lib/auth/guard";
import { getRun } from "@/lib/runs/service";

export async function GET(request: Request, context: RouteContext<"/api/runs/[id]">) {
  const denied = await requireSession(request);
  if (denied) {
    return denied;
  }

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Run id is invalid." }, { status: 400 });
  }

  const run = await getRun(id);
  if (!run) {
    return Response.json({ error: "Run was not found." }, { status: 404 });
  }
  return Response.json({ run });
}
