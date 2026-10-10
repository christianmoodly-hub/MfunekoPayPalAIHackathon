import { NextResponse, type NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/guard";
import { captureAfterApproval, findApprovalByOrderId } from "@/lib/checkout/approval";

export async function GET(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) {
    return denied;
  }

  const orderId = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (!orderId) {
    return NextResponse.redirect(new URL("/mandates?checkout=missing", request.url));
  }

  const approval = await findApprovalByOrderId(orderId);
  if (!approval) {
    return NextResponse.redirect(new URL("/mandates?checkout=missing", request.url));
  }

  try {
    if (approval.status !== "captured") {
      await captureAfterApproval(approval.id);
    }
    return NextResponse.redirect(runUrl(request, approval.runId, false));
  } catch {
    return NextResponse.redirect(runUrl(request, approval.runId, true));
  }
}

function runUrl(request: NextRequest, runId: string | null | undefined, failed: boolean): URL {
  const url = new URL(runId ? `/runs/${runId}` : "/mandates", request.url);
  if (failed) {
    url.searchParams.set("checkout", "failed");
  }
  return url;
}
