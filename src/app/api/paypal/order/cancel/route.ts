import { NextResponse, type NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/guard";
import { cancelApprovalByOrderId } from "@/lib/checkout/approval";

export async function GET(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) {
    return denied;
  }

  const orderId = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (!orderId) {
    return NextResponse.redirect(new URL("/mandates?checkout=missing", request.url));
  }

  const approval = await cancelApprovalByOrderId(orderId);
  if (!approval) {
    return NextResponse.redirect(new URL("/mandates?checkout=missing", request.url));
  }
  const url = new URL(approval.runId ? `/runs/${approval.runId}` : "/mandates", request.url);
  return NextResponse.redirect(url);
}
