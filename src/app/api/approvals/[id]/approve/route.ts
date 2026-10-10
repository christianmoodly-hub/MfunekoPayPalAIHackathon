import { z } from "zod";

import { requireSession } from "@/lib/auth/guard";
import { approveEscalation, loadApprovalRecord, saveApprovalRecord } from "@/lib/checkout/approval";
import { appendLedgerEvent } from "@/lib/ledger";
import { redactSecrets } from "@/lib/gemini/redact";

export async function POST(request: Request, context: RouteContext<"/api/approvals/[id]/approve">) {
  const denied = await requireSession(request);
  if (denied) {
    return denied;
  }

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Approval id is invalid." }, { status: 400 });
  }

  try {
    const approval = await loadApprovalRecord(id);
    if (!approval) {
      return Response.json({ error: "Approval was not found." }, { status: 404 });
    }
    if (isExpired(approval.status, approval.expiresAt)) {
      if (approval.status === "pending") {
        await saveApprovalRecord({ ...approval, status: "expired" });
        await appendLedgerEvent({
          type: "approval.expired",
          mandateId: approval.mandateId,
          runId: approval.runId ?? null,
          payload: { approvalId: id },
        });
      }
      return Response.json(
        { error: "Approval expired.", verdict: "BLOCK", reasons: ["Approval expired."], approvalUrl: null },
        { status: 409 },
      );
    }

    const result = await approveEscalation(id);
    const body = {
      verdict: result.verdict,
      reasons: result.reasons,
      approvalUrl: result.approvalUrl,
      orderId: result.orderId,
    };
    if (result.reasons.includes("Approval expired.") || result.approvalUrl === null) {
      return Response.json({ error: result.reasons[0] ?? "Approval was not ordered.", ...body }, { status: 409 });
    }
    return Response.json(body);
  } catch (error) {
    if (error instanceof Error && error.message === "Approval was not found.") {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error && error.message === "Approval is not pending.") {
      return Response.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Could not approve the purchase.";
    return Response.json({ error: redactSecrets(message) }, { status: 502 });
  }
}

function isExpired(status: string, expiresAt: string): boolean {
  return status === "expired" || (status === "pending" && Date.parse(expiresAt) <= Date.now());
}
