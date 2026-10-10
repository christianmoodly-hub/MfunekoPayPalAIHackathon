import { z } from "zod";

import { requireSession } from "@/lib/auth/guard";
import { loadApprovalRecord, publicApproval } from "@/lib/checkout/approval";

export async function GET(request: Request, context: RouteContext<"/api/approvals/[id]">) {
  const denied = await requireSession(request);
  if (denied) {
    return denied;
  }

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Approval id is invalid." }, { status: 400 });
  }

  const approval = await loadApprovalRecord(id);
  if (!approval) {
    return Response.json({ error: "Approval was not found." }, { status: 404 });
  }
  return Response.json({ approval: publicApproval(approval) });
}
