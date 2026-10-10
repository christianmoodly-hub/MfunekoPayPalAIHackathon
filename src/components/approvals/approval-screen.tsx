"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/app-shell";
import { formatUsd } from "@/components/mandates/mandate-card";
import { Button } from "@/components/ui/button";
import { mandateSchema, proposedPurchaseSchema } from "@/lib/policy/schema";

const approvalStatusSchema = z.enum([
  "pending",
  "ordering",
  "ordered",
  "blocked",
  "expired",
  "captured",
  "declined",
  "cancelled",
]);

const approvalSchema = z.object({
  id: z.string(),
  mandateId: z.string(),
  runId: z.string().nullable(),
  status: approvalStatusSchema,
  reasons: z.array(z.string()),
  purchase: proposedPurchaseSchema,
  productIds: z.array(z.string()),
  expectedCents: z.number().int(),
  expiresAt: z.string(),
  orderId: z.string().nullable(),
});

const approveResponseSchema = z.object({
  verdict: z.enum(["APPROVE", "ESCALATE", "BLOCK"]).optional(),
  reasons: z.array(z.string()).optional(),
  approvalUrl: z.string().nullable().optional(),
  orderId: z.string().nullable().optional(),
  error: z.string().optional(),
});

type Approval = z.infer<typeof approvalSchema>;
type Mandate = z.infer<typeof mandateSchema>;

export function ApprovalScreen({ id }: { id: string }) {
  const [approval, setApproval] = useState<Approval | null>(null);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [walletLinked, setWalletLinked] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(`/api/approvals/${id}`);
      const body: unknown = await response.json().catch(() => null);
      if (cancelled) {
        return;
      }
      if (!response.ok) {
        const message = z.object({ error: z.string() }).safeParse(body);
        setError(message.success ? message.data.error : "Approval was not found.");
        return;
      }
      const parsed = z.object({ approval: approvalSchema }).safeParse(body);
      if (!parsed.success) {
        setError("Approval response was not valid.");
        return;
      }
      setApproval(parsed.data.approval);
      const [mandateResponse, walletResponse] = await Promise.all([
        fetch(`/api/mandates/${parsed.data.approval.mandateId}`),
        fetch("/api/wallet"),
      ]);
      if (cancelled) {
        return;
      }
      const mandateBody: unknown = await mandateResponse.json().catch(() => null);
      const mandateParsed = z.object({ mandate: mandateSchema }).safeParse(mandateBody);
      if (mandateParsed.success) {
        setMandate(mandateParsed.data.mandate);
      }
      const walletBody: unknown = await walletResponse.json().catch(() => null);
      const walletParsed = z.object({ linked: z.boolean() }).safeParse(walletBody);
      if (walletParsed.success) {
        setWalletLinked(walletParsed.data.linked);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const expired = approval ? approval.status === "expired" || (approval.status === "pending" && Date.parse(approval.expiresAt) <= Date.now()) : false;
  const actionable = approval?.status === "pending" && !expired;

  async function approve() {
    setBusy("approve");
    setError(null);
    const response = await fetch(`/api/approvals/${id}/approve`, { method: "POST" });
    const body: unknown = await response.json().catch(() => null);
    const parsed = approveResponseSchema.safeParse(body);
    if (!response.ok || !parsed.success) {
      const message = z.object({ error: z.string() }).safeParse(body);
      setError(message.success ? message.data.error : "Could not approve the purchase.");
      setBusy(null);
      return;
    }
    if (parsed.data.approvalUrl) {
      window.location.assign(parsed.data.approvalUrl);
      return;
    }
    setApproval((current) =>
      current
        ? {
            ...current,
            status: parsed.data.verdict === "BLOCK" ? "blocked" : "ordered",
            orderId: parsed.data.orderId ?? current.orderId,
            reasons: parsed.data.reasons ?? current.reasons,
          }
        : current,
    );
    setError(parsed.data.error ?? parsed.data.reasons?.[0] ?? "PayPal did not return an approval link.");
    setBusy(null);
  }

  async function decline() {
    setBusy("decline");
    setError(null);
    const response = await fetch(`/api/approvals/${id}/decline`, { method: "POST" });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = z.object({ error: z.string() }).safeParse(body);
      setError(message.success ? message.data.error : "Could not decline the approval.");
      setBusy(null);
      return;
    }
    const parsed = z.object({ approval: approvalSchema }).safeParse(body);
    if (parsed.success) {
      setApproval(parsed.data.approval);
    }
    setBusy(null);
  }

  return (
    <AppShell walletLinked={walletLinked}>
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-8">
        <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#545f73]">
              <span>APPROVAL</span>
              <span>{shortId(id)}</span>
              {approval ? <StatusPill status={expired && approval.status === "pending" ? "expired" : approval.status} /> : null}
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-primary">Escalated purchase review</h1>
            {mandate ? <p className="mt-2 max-w-3xl text-sm text-[#334155]">“{mandate.description}”</p> : null}
          </div>
          <div className="flex flex-col items-start gap-1 font-mono text-[11px] text-[#545f73] lg:items-end">
            {approval?.runId ? (
              <Link className="font-semibold text-primary underline" href={`/runs/${approval.runId}`}>
                Run {shortId(approval.runId)}
              </Link>
            ) : null}
            {approval ? <p>Expires {formatTime(approval.expiresAt)}</p> : null}
          </div>
        </header>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!approval && !error ? <p className="font-mono text-[11px] text-[#545f73]">Loading the approval…</p> : null}

        {approval ? (
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1.35fr_0.75fr]">
            <div className="flex flex-col gap-6">
              <section className="rounded-3xl border border-[#fde68a] bg-[#fffbeb] p-6">
                <div className="mb-3 flex items-center gap-2 text-[#92400e]">
                  <ShieldAlert className="size-4" />
                  <h2 className="text-sm font-bold tracking-wide uppercase">Why this needs a person</h2>
                </div>
                {approval.reasons.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {approval.reasons.map((reason) => (
                      <li key={reason} className="rounded-xl border border-[#fde68a] bg-card px-4 py-3 text-sm text-[#334155]">
                        {reason}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[#92400e]">The engine recorded no reasons on this approval.</p>
                )}
              </section>

              <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold tracking-tight">Line items</h2>
                  <span className="font-mono text-[11px] text-[#545f73]">{approval.purchase.lineItems.length} lines</span>
                </div>
                {approval.purchase.lineItems.length === 0 ? (
                  <p className="text-sm text-[#545f73]">This approval has no line items.</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {approval.purchase.lineItems.map((item, index) => {
                      const lineCents = item.unitPriceCents * item.quantity;
                      const productId = approval.productIds[index];
                      return (
                        <li key={`${item.merchant}-${index}`} className="rounded-2xl border border-border px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold">{item.merchant}</p>
                              <p className="font-mono text-[11px] text-[#545f73]">
                                {item.category ?? "Uncategorized"} · qty {item.quantity}
                                {productId ? ` · ${productId}` : ""}
                              </p>
                            </div>
                            <p className="font-mono text-sm font-semibold">{formatUsd(lineCents)}</p>
                          </div>
                          <p className="mt-2 font-mono text-[11px] text-[#545f73]">
                            Unit {formatUsd(item.unitPriceCents)}
                            {item.checkoutUnitPriceCents !== undefined && item.checkoutUnitPriceCents !== item.unitPriceCents
                              ? ` · verified ${formatUsd(item.checkoutUnitPriceCents)}`
                              : ""}
                            {" · "}
                            {item.freeReturns === null ? "returns unknown" : item.freeReturns ? "free returns" : "no free returns"}
                            {item.deliveryDate ? ` · deliver ${item.deliveryDate}` : ""}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            <aside className="rounded-3xl border border-border bg-card p-6 shadow-sm xl:sticky xl:top-24">
              <h2 className="text-sm font-bold tracking-wide text-[#545f73] uppercase">Charge</h2>
              <dl className="mt-4 flex flex-col gap-3 font-mono text-[13px]">
                <Row label="Line total" value={formatUsd(lineTotal(approval))} />
                <Row label="Stated total" value={formatUsd(approval.purchase.statedTotalCents)} />
                <Row label="Expected charge" value={formatUsd(approval.expectedCents)} emphasis />
                {mandate ? <Row label="Escalate above" value={formatUsd(mandate.escalateAboveCents)} /> : null}
                {mandate ? <Row label="Mandate ceiling" value={formatUsd(mandate.maxTotalCents)} /> : null}
              </dl>
              {lineTotal(approval) !== approval.purchase.statedTotalCents ? (
                <p className="mt-3 text-xs text-[#92400e]">The stated total does not match the line items. Approval uses the expected charge.</p>
              ) : null}
              <p className="mt-4 text-xs text-[#545f73]">
                {walletLinked ? "PayPal sandbox wallet is linked." : walletLinked === false ? "PayPal sandbox wallet is not linked." : "Checking the PayPal sandbox vault…"}
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <Button className="h-11 w-full" disabled={!actionable || busy !== null} onClick={() => void approve()}>
                  {busy === "approve" ? "Opening PayPal…" : `Approve via PayPal · ${formatUsd(approval.expectedCents)}`}
                </Button>
                <Button
                  variant="outline"
                  className="h-11 w-full border-[#fecaca] text-[#991b1b] hover:bg-[#fef2f2]"
                  disabled={!actionable || busy !== null}
                  onClick={() => void decline()}
                >
                  {busy === "decline" ? "Declining…" : "Decline purchase"}
                </Button>
              </div>
              {approval.orderId ? <p className="mt-3 font-mono text-[11px] text-[#545f73]">PayPal order {approval.orderId}</p> : null}
              {!actionable ? <p className="mt-3 text-xs text-[#545f73]">{closedCopy(expired ? "expired" : approval.status)}</p> : null}
            </aside>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function Row({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${emphasis ? "border-t border-border pt-3 text-base font-semibold" : ""}`}>
      <dt className="text-[#545f73]">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function StatusPill({ status }: { status: Approval["status"] }) {
  const escalate = status === "pending" || status === "ordering";
  const closed = status === "blocked" || status === "expired" || status === "declined" || status === "cancelled";
  const tone = escalate ? "bg-[#fffbeb] text-[#92400e]" : closed ? "bg-[#fef2f2] text-[#991b1b]" : "bg-[#ecfdf5] text-[#065f46]";
  return <span className={`rounded-full px-2 py-0.5 font-semibold ${tone}`}>{status === "pending" ? "ESCALATE" : status.toUpperCase()}</span>;
}

function closedCopy(status: Approval["status"]): string {
  if (status === "expired") {
    return "This approval has expired. A new run is required.";
  }
  if (status === "declined" || status === "cancelled") {
    return "This purchase was declined. No PayPal order will be captured.";
  }
  if (status === "ordered") {
    return "A PayPal order was created. Finish it in the sandbox checkout if it is still open.";
  }
  if (status === "captured") {
    return "This purchase was captured.";
  }
  if (status === "blocked") {
    return "The engine blocked this purchase.";
  }
  if (status === "ordering") {
    return "PayPal order creation is in progress.";
  }
  return "This approval is closed.";
}

function lineTotal(approval: Approval): number {
  return approval.purchase.lineItems.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
}

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
