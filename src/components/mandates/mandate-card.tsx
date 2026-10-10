"use client";

import {
  AlertTriangle,
  Bot,
  CalendarX,
  CheckCircle2,
  FilePenLine,
  Lock,
  Play,
  ShieldAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { centsToUsd } from "@/lib/money";

export type MandateStatus = "draft" | "active" | "exhausted" | "expired";

export type MandateCardModel = {
  id: string;
  description: string;
  maxTotalCents: number;
  allowedMerchants?: string[] | null;
  requireFreeReturns: boolean;
  deliverBy?: string | null;
  expiresAt: string;
  status: MandateStatus;
  needsInput: string[];
  spentCents: number;
  heldCents: number;
  remainingCents: number;
};

export function MandateCard({
  mandate,
  pending,
  onRun,
}: {
  mandate: MandateCardModel;
  pending: boolean;
  onRun: (id: string) => void;
}) {
  const closed = mandate.status === "expired" || mandate.status === "exhausted";

  return (
    <article className="flex flex-col justify-between rounded-3xl border border-border bg-card p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <StatusBadge status={mandate.status} />
            <span className="truncate font-mono text-[11px] text-[#545f73]">{shortId(mandate.id)}</span>
          </div>
          <span className="shrink-0 font-mono text-[11px] text-[#545f73]">{timingLabel(mandate)}</span>
        </div>
        <h2 className={`mb-2 text-2xl font-semibold tracking-tight ${closed ? "text-[#545f73]" : "text-primary"}`}>
          “{mandate.description}”
        </h2>
        {mandate.status === "draft" && mandate.needsInput.length > 0 ? (
          <div className="mb-4 flex items-start gap-2 rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#dc2626]" />
            <div>
              <p className="font-mono text-[11px] font-bold tracking-wider text-[#991b1b] uppercase">
                Budget cap unverified
              </p>
              <p className="text-xs text-foreground">
                Still needed before this mandate can be confirmed: {mandate.needsInput.join(", ")}.
              </p>
            </div>
          </div>
        ) : null}
        <div className="mb-4 flex flex-wrap gap-2">
          {(mandate.allowedMerchants ?? []).map((merchant) => (
            <span
              key={merchant}
              className="inline-flex items-center gap-1 rounded-lg bg-[#f1f5f9] px-2.5 py-1 font-mono text-[11px] text-foreground"
            >
              <Lock className="size-3.5 text-[#545f73]" />
              {merchant}
            </span>
          ))}
          {mandate.allowedMerchants == null || mandate.allowedMerchants.length === 0 ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-[#f1f5f9] px-2.5 py-1 font-mono text-[11px] text-[#545f73]">
              <ShieldAlert className="size-3.5" />
              Merchant: any allowed domain
            </span>
          ) : null}
          {mandate.requireFreeReturns ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-[#eff4ff] px-2.5 py-1 text-xs text-[#404848]">
              <CheckCircle2 className="size-3.5 text-[#059669]" />
              Free returns required
            </span>
          ) : null}
          {mandate.deliverBy ? (
            <span className="rounded-lg bg-[#eff4ff] px-2.5 py-1 text-xs text-[#404848]">
              Deliver by {mandate.deliverBy}
            </span>
          ) : null}
        </div>
        {mandate.status === "draft" ? null : (
          <SpendingRail
            label={closed ? "Archived execution history" : "Deterministic spending rail"}
            limitCents={mandate.maxTotalCents}
            spentCents={mandate.spentCents}
            heldCents={mandate.heldCents}
            remainingCents={mandate.remainingCents}
            muted={closed}
          />
        )}
      </div>
      <div className="mt-4 flex flex-col items-stretch justify-between gap-3 border-t border-[#f1f5f9] pt-4 sm:flex-row sm:items-center">
        <p className="flex items-center gap-2 font-mono text-[11px] text-[#545f73]">
          {mandate.status === "active" ? (
            <>
              <Bot className="size-4" />
              Ready for a guarded run
            </>
          ) : mandate.status === "draft" ? (
            "Parameters incomplete"
          ) : (
            "Auto-renewal disarmed"
          )}
        </p>
        {mandate.status === "active" ? (
          <Button type="button" disabled={pending} onClick={() => onRun(mandate.id)} className="h-10 rounded-lg px-4">
            <Play className="size-4" />
            Run agent
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: MandateStatus }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#a7f3d0] bg-[#ecfdf5] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#065f46]">
        <CheckCircle2 className="size-3.5 text-[#059669]" />
        ACTIVE
      </span>
    );
  }
  if (status === "draft") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fde68a] bg-[#fffbeb] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#92400e]">
        <FilePenLine className="size-3.5 text-[#d97706]" />
        DRAFT
      </span>
    );
  }
  if (status === "exhausted") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fecaca] bg-[#fef2f2] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#991b1b]">
        <ShieldAlert className="size-3.5 text-[#dc2626]" />
        EXHAUSTED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-[#f1f5f9] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#545f73]">
      <CalendarX className="size-3.5" />
      EXPIRED
    </span>
  );
}

function SpendingRail({
  label,
  limitCents,
  spentCents,
  heldCents,
  remainingCents,
  muted,
}: {
  label: string;
  limitCents: number;
  spentCents: number;
  heldCents: number;
  remainingCents: number;
  muted: boolean;
}) {
  const scale = Math.max(limitCents, spentCents + heldCents, 1);
  const spent = (spentCents / scale) * 100;
  const held = (heldCents / scale) * 100;
  const left = Math.max(0, 100 - spent - held);

  return (
    <div className="mb-2 rounded-2xl bg-[#eff4ff] p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold tracking-[0.06em] text-[#545f73] uppercase">{label}</span>
        <span className="font-mono text-[11px] font-semibold text-primary">Limit: {formatUsd(limitCents)}</span>
      </div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-[#d3e4fe] p-0.5">
        {spent > 0 ? (
          <div className={`h-full rounded-full ${muted ? "bg-[#545f73]" : "bg-primary"}`} style={{ width: `${spent}%` }} />
        ) : null}
        {held > 0 ? <div className="h-full rounded-full bg-[#545f73]" style={{ width: `${held}%` }} /> : null}
        {left > 0 ? <div className="h-full rounded-full bg-[#dce9ff]" style={{ width: `${left}%` }} /> : null}
      </div>
      <p className="mt-2 font-mono text-[13px] font-semibold text-foreground">
        {formatUsd(spentCents)} spent, {formatUsd(heldCents)} held, {formatUsd(Math.max(0, remainingCents))} left of{" "}
        {formatUsd(limitCents)}
      </p>
    </div>
  );
}

function shortId(id: string): string {
  return id.length > 12 ? `MND-${id.slice(0, 8).toUpperCase()}` : id;
}

function timingLabel(mandate: MandateCardModel): string {
  if (mandate.status === "expired" || mandate.status === "exhausted") {
    return `Closed ${mandate.expiresAt.slice(0, 10)}`;
  }
  return `Expires ${mandate.expiresAt.slice(0, 10)}`;
}

export function formatUsd(cents: number): string {
  const absolute = Math.abs(Math.trunc(cents));
  const body = Number.isInteger(absolute) ? centsToUsd(absolute) : "0.00";
  return `${cents < 0 ? "-" : ""}USD $${body}`;
}
