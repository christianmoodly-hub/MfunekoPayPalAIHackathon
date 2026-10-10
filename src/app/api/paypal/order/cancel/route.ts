import { NextResponse, type NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/guard";
import { cancelApprovalByOrderId } from "@/lib/checkout/approval";
import { appUrl } from "@/lib/env/app-url";

export async function GET(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) {
    return denied;
  }

  const orderId = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (!orderId) {
    return NextResponse.redirect(appUrl("/mandates?checkout=missing"));
  }

  const approval = await cancelApprovalByOrderId(orderId);
  if (!approval) {
    return NextResponse.redirect(appUrl("/mandates?checkout=missing"));
  }
  const url = appUrl(approval.runId ? `/runs/${approval.runId}` : "/mandates");
  return NextResponse.redirect(url);
}
