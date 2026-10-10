import { NextResponse, type NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/guard";
import { captureAfterApproval, findApprovalByOrderId } from "@/lib/checkout/approval";
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

  const approval = await findApprovalByOrderId(orderId);
  if (!approval) {
    return NextResponse.redirect(appUrl("/mandates?checkout=missing"));
  }

  try {
    if (approval.status !== "captured") {
      await captureAfterApproval(approval.id);
    }
    return NextResponse.redirect(runUrl(approval.runId, false));
  } catch {
    return NextResponse.redirect(runUrl(approval.runId, true));
  }
}

function runUrl(runId: string | null | undefined, failed: boolean): URL {
  const url = appUrl(runId ? `/runs/${runId}` : "/mandates");
  if (failed) {
    url.searchParams.set("checkout", "failed");
  }
  return url;
}
