import { z } from "zod";

import { requireSession } from "@/lib/auth/guard";
import { listLedgerEvents } from "@/lib/ledger/query";

const querySchema = z.object({
  mandateId: z.string().uuid().optional(),
  type: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(request: Request) {
  const denied = await requireSession(request);
  if (denied) {
    return denied;
  }

  const url = new URL(request.url);
  const raw: { mandateId?: string; type?: string; limit?: string } = {};
  const mandateId = url.searchParams.get("mandateId");
  const type = url.searchParams.get("type");
  const limit = url.searchParams.get("limit");
  if (mandateId !== null) {
    raw.mandateId = mandateId;
  }
  if (type !== null) {
    raw.type = type;
  }
  if (limit !== null) {
    raw.limit = limit;
  }

  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Ledger filters are invalid." }, { status: 400 });
  }

  const events = await listLedgerEvents(parsed.data);
  return Response.json({ events });
}
