import type { NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/guard";
import { confirmSavedMandate } from "@/lib/mandate/service";
import { MandateStoreError } from "@/lib/mandate/store";

export async function POST(request: NextRequest, context: RouteContext<"/api/mandates/[id]/confirm">) {
  const denied = await requireSession(request);
  if (denied) {
    return denied;
  }
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  try {
    const mandate = await confirmSavedMandate(id, body);
    return Response.json({ mandate });
  } catch (error) {
    if (error instanceof MandateStoreError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    return Response.json({ error: "Could not confirm the mandate." }, { status: 500 });
  }
}
