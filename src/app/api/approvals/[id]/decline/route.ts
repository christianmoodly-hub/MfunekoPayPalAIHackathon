import { z } from "zod";

import { requireSession } from "@/lib/auth/guard";
import { ApprovalCloseError, declineApproval, publicApproval } from "@/lib/checkout/approval";
import { redactSecrets } from "@/lib/gemini/redact";

export async function POST(request: Request, context: RouteContext<"/api/approvals/[id]/decline">) {
  const denied = await requireSession(request);
  if (denied) {
    return denied;
  }

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Approval id is invalid." }, { status: 400 });
  }

  try {
    const approval = await declineApproval(id);
    if (!approval) {
      return Response.json({ error: "Approval was not found." }, { status: 404 });
    }
    return Response.json({ approval: publicApproval(approval) });
  } catch (error) {
    if (error instanceof ApprovalCloseError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Could not decline the approval.";
    return Response.json({ error: redactSecrets(message) }, { status: 500 });
  }
}
