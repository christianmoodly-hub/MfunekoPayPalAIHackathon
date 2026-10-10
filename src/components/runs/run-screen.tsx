"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, LoaderCircle, ShieldAlert } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/app-shell";
import { centsToUsd } from "@/lib/money";
import { categoryMatches } from "@/lib/policy/categories";
import { merchantCoveredBy } from "@/lib/policy/merchants";
import { mandateSchema } from "@/lib/policy/schema";

const verdictSchema = z.enum(["APPROVE", "ESCALATE", "BLOCK"]);

const eventSchema = z.object({
  id: z.string(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

const runSchema = z.object({
  id: z.string(),
  mandateId: z.string(),
  status: z.enum(["running", "completed", "failed"]),
  outcome: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  events: z.array(eventSchema),
});

const candidateSchema = z.object({
  productId: z.string(),
  title: z.string(),
  domain: z.string(),
  category: z.string().nullable(),
  unitPriceCents: z.number().int().nonnegative(),
  freeReturns: z.boolean().nullable(),
  deliveryDate: z.string().nullable(),
  eligible: z.boolean(),
});

const reasoningSchema = z.object({
  accepted: z.boolean(),
  productId: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  reasoning: z.string().optional(),
  message: z.string().optional(),
});

const verdictEventSchema = z.object({
  verdict: verdictSchema,
  reasons: z.array(z.string()),
  statedTotalCents: z.number().int().optional(),
});

const checkoutSchema = z.object({
  verdict: verdictSchema,
  reasons: z.array(z.string()),
  chargedCents: z.number().int().nonnegative().nullable(),
  orderId: z.string().nullable(),
  approvalId: z.string().nullable().optional(),
  approvalUrl: z.string().nullable(),
});

type RunRecord = z.infer<typeof runSchema>;
type MandateRecord = z.infer<typeof mandateSchema>;
type CheckState = "pass" | "fail" | "wait";

const steps = [
  { title: "Searching products", types: ["shopping.search", "shopping.search_failed", "shopping.candidate"] },
  { title: "Ranking", types: ["shopping.reasoning"] },
  { title: "Policy check", types: ["shopping.verdict"] },
  { title: "Checkout", types: ["checkout.blocked", "checkout.escalated", "checkout.reserved", "paypal.order.created", "paypal.order.captured", "paypal.order.failed"] },
] as const;

export function RunScreen({ id }: { id: string }) {
  const [run, setRun] = useState<RunRecord | null>(null);
  const [mandate, setMandate] = useState<MandateRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (statusRef.current && statusRef.current !== "running") {
        return;
      }
      try {
        const response = await fetch(`/api/runs/${id}`);
        const body: unknown = await response.json();
        if (!response.ok) {
          statusRef.current = "stopped";
          const message = z.object({ error: z.string() }).safeParse(body);
          throw new Error(message.success ? message.data.error : "Could not load the run.");
        }
        const parsed = z.object({ run: runSchema }).parse(body);
        if (cancelled) {
          return;
        }
        statusRef.current = parsed.run.status;
        setRun(parsed.run);
        setError(null);
        const mandateResponse = await fetch(`/api/mandates/${parsed.run.mandateId}`);
        if (!mandateResponse.ok || cancelled) {
          return;
        }
        const mandateBody: unknown = await mandateResponse.json();
        const parsedMandate = z.object({ mandate: mandateSchema }).safeParse(mandateBody);
        if (parsedMandate.success && !cancelled) {
          setMandate(parsedMandate.data.mandate);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load the run.");
        }
      }
    }
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [id]);

  const chronological = [...(run?.events ?? [])].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const proposal = proposalFrom(chronological);
  const verdict = verdictFrom(run, chronological);
  const checkout = checkoutFrom(run?.outcome ?? null);

  return (
    <AppShell>
      <p className="mb-4 font-mono text-[11px] text-[#545f73]">
        <Link href="/mandates" className="hover:underline">Mandates</Link>
        <span> / Run {shortId(id)}</span>
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!run && !error ? <p className="font-mono text-[11px] text-[#545f73]">Loading the execution trace…</p> : null}
      {run ? (
        <div className="flex flex-col gap-6">
          <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#545f73]">
                <span>ACTIVE MANDATE</span>
                <span>{shortId(run.mandateId)}</span>
                <StatusPill status={run.status} verdict={verdict?.verdict ?? null} />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-primary">“{mandate?.description ?? "Mandate"}”</h1>
            </div>
            <div className="text-left font-mono text-[11px] text-[#545f73] lg:text-right">
              <p>EXECUTION ID {shortId(run.id)}</p>
              <p>Started {formatTime(run.createdAt)}</p>
            </div>
          </header>

          <VerdictBanner
            status={run.status}
            verdict={checkout?.verdict ?? verdict?.verdict ?? null}
            chargedCents={checkout?.chargedCents ?? null}
            error={run.error}
            approvalUrl={checkout?.approvalUrl ?? null}
            approvalId={checkout?.approvalId ?? null}
          />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight">Execution timeline</h2>
                <span className="font-mono text-[11px] text-[#545f73]">Deterministic rail</span>
              </div>
              <ol className="flex flex-col gap-3">
                {steps.map((step, index) => {
                  const matched = chronological.filter((event) => (step.types as readonly string[]).includes(event.type));
                  const started = matched.length > 0;
                  const laterStarted = steps.slice(index + 1).some((next) => chronological.some((event) => (next.types as readonly string[]).includes(event.type)));
                  const done = started && (laterStarted || run.status !== "running");
                  return (
                    <li key={step.title} className="rounded-2xl bg-[#eff4ff] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold">Step {index + 1} · {step.title}</p>
                        <StepMark done={done} active={run.status === "running" && !done && started} />
                      </div>
                      <p className="mt-1 text-sm text-[#404848]">{stepDetail(step.title, matched) ?? (run.status === "running" && !started ? "Waiting" : "Not reached")}</p>
                    </li>
                  );
                })}
              </ol>
            </section>

            <div className="flex flex-col gap-6">
              <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold tracking-tight">Proposed purchase</h2>
                {proposal ? (
                  <div>
                    <p className="mb-2 inline-flex rounded-lg bg-[#f1f5f9] px-2.5 py-1 font-mono text-[11px]">{proposal.domain}</p>
                    <p className="text-base font-semibold">{proposal.title}</p>
                    <p className="mt-1 font-mono text-[13px] text-[#545f73]">
                      Qty {proposal.quantity} · {money(proposal.unitPriceCents)} each
                    </p>
                    {proposal.reasoning ? <p className="mt-3 text-sm text-[#404848]">“{proposal.reasoning}”</p> : null}
                    <p className="mt-3 font-mono text-lg font-semibold text-primary">{money(proposal.unitPriceCents * proposal.quantity)}</p>
                  </div>
                ) : (
                  <p className="text-sm text-[#545f73]">{run.status === "running" ? "The agent has not selected a product yet." : "No product was selected."}</p>
                )}
              </section>

              <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold tracking-tight">Rules checked</h2>
                  <span className="font-mono text-[11px] font-semibold text-primary">{verdict?.verdict ?? "PENDING"}</span>
                </div>
                <ul className="flex flex-col gap-2">
                  {checklist(mandate, proposal, verdict).map((item) => (
                    <li key={item.label} className="flex items-start justify-between gap-3 rounded-xl bg-[#eff4ff] px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="font-mono text-[11px] text-[#545f73]">{item.detail}</p>
                      </div>
                      <CheckMark state={item.state} />
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>

          <details className="rounded-3xl border border-border bg-[#f1f5f9] p-4">
            <summary className="cursor-pointer font-mono text-[11px] font-semibold tracking-wider text-[#545f73] uppercase">Raw ledger payload</summary>
            <pre className="mt-3 overflow-x-auto font-mono text-[11px] leading-5 text-foreground">{JSON.stringify({ outcome: run.outcome, error: run.error, events: chronological }, null, 2)}</pre>
          </details>
        </div>
      ) : null}
    </AppShell>
  );
}

function StatusPill({ status, verdict }: { status: RunRecord["status"]; verdict: z.infer<typeof verdictSchema> | null }) {
  const label = status === "running" ? "RUNNING" : verdict ?? status.toUpperCase();
  const tone = label === "APPROVE" ? "bg-[#ecfdf5] text-[#065f46]" : label === "BLOCK" || status === "failed" ? "bg-[#fef2f2] text-[#991b1b]" : "bg-[#fffbeb] text-[#92400e]";
  return <span className={`rounded-full px-2 py-0.5 font-semibold ${tone}`}>{label}</span>;
}

function VerdictBanner({
  status,
  verdict,
  chargedCents,
  error,
  approvalUrl,
  approvalId,
}: {
  status: RunRecord["status"];
  verdict: z.infer<typeof verdictSchema> | null;
  chargedCents: number | null;
  error: string | null;
  approvalUrl: string | null;
  approvalId: string | null;
}) {
  const text = bannerText(status, verdict, chargedCents, error);
  const tone = verdict === "APPROVE" ? "border-[#a7f3d0] bg-[#ecfdf5]" : verdict === "BLOCK" || status === "failed" ? "border-[#fecaca] bg-[#fef2f2]" : "border-[#fde68a] bg-[#fffbeb]";
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${tone}`}>
      <p className="font-mono text-[13px] font-semibold">{text}</p>
      {approvalId ? (
        <Link className="text-sm font-semibold text-primary underline" href={`/approvals/${approvalId}`}>
          Review approval
        </Link>
      ) : approvalUrl ? (
        <a className="text-sm font-semibold text-primary underline" href={approvalUrl}>
          Review approval
        </a>
      ) : null}
    </div>
  );
}

function StepMark({ done, active }: { done: boolean; active: boolean }) {
  if (done) {
    return <CheckCircle2 className="size-4 text-[#059669]" />;
  }
  if (active) {
    return <LoaderCircle className="size-4 animate-spin text-[#d97706]" />;
  }
  return <span className="size-2 rounded-full bg-[#cbd5e1]" />;
}

function CheckMark({ state }: { state: CheckState }) {
  if (state === "pass") {
    return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#059669]" />;
  }
  if (state === "fail") {
    return <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#dc2626]" />;
  }
  return <AlertCircle className="mt-0.5 size-4 shrink-0 text-[#d97706]" />;
}

function proposalFrom(events: RunRecord["events"]) {
  const reasoningEvent = [...events].reverse().find((event) => event.type === "shopping.reasoning");
  const reasoning = reasoningEvent ? reasoningSchema.safeParse(reasoningEvent.payload) : null;
  if (!reasoning?.success || !reasoning.data.accepted || !reasoning.data.productId) {
    return null;
  }
  const candidateEvent = [...events].reverse().find((event) => {
    if (event.type !== "shopping.candidate") {
      return false;
    }
    const parsed = candidateSchema.safeParse(event.payload);
    return parsed.success && parsed.data.productId === reasoning.data.productId;
  });
  const candidate = candidateEvent ? candidateSchema.safeParse(candidateEvent.payload) : null;
  if (!candidate?.success) {
    return null;
  }
  return {
    ...candidate.data,
    quantity: reasoning.data.quantity ?? 1,
    reasoning: reasoning.data.reasoning ?? "",
  };
}

function verdictFrom(run: RunRecord | null, events: RunRecord["events"]) {
  const checkout = checkoutFrom(run?.outcome ?? null);
  if (checkout) {
    return { verdict: checkout.verdict, reasons: checkout.reasons };
  }
  const event = [...events].reverse().find((item) => item.type === "shopping.verdict");
  const parsed = event ? verdictEventSchema.safeParse(event.payload) : null;
  return parsed?.success ? parsed.data : null;
}

function checkoutFrom(outcome: Record<string, unknown> | null) {
  if (!outcome || !("checkout" in outcome) || outcome.checkout == null) {
    return null;
  }
  const parsed = checkoutSchema.safeParse(outcome.checkout);
  return parsed.success ? parsed.data : null;
}

function checklist(
  mandate: MandateRecord | null,
  proposal: ReturnType<typeof proposalFrom>,
  verdict: { verdict: z.infer<typeof verdictSchema>; reasons: string[] } | null,
) {
  if (!mandate || !proposal) {
    if (verdict && verdict.reasons.length > 0) {
      return verdict.reasons.map((reason) => ({ label: reason, detail: verdict.verdict, state: verdict.verdict === "APPROVE" ? "pass" as const : "fail" as const }));
    }
    return [{ label: "Policy engine", detail: "Waiting for a proposal", state: "wait" as const }];
  }
  const total = proposal.unitPriceCents * proposal.quantity;
  const rows: { label: string; detail: string; state: CheckState }[] = [
    {
      label: "Total within mandate cap",
      detail: `${money(total)} of ${money(mandate.maxTotalCents)}`,
      state: total <= mandate.maxTotalCents ? "pass" : "fail",
    },
    {
      label: "Unit price within per-item cap",
      detail: `${money(proposal.unitPriceCents)} of ${money(mandate.maxPerItemCents)}`,
      state: proposal.unitPriceCents <= mandate.maxPerItemCents ? "pass" : "fail",
    },
    merchantRow(mandate, proposal.domain),
    categoryRow(mandate, proposal.category),
  ];
  if (mandate.requireFreeReturns) {
    rows.push({
      label: "Free returns required",
      detail: proposal.freeReturns === true ? "Free returns" : "Not marked free returns",
      state: proposal.freeReturns === true ? "pass" : "fail",
    });
  }
  if (mandate.deliverBy) {
    rows.push({
      label: "Deliver by deadline",
      detail: proposal.deliveryDate ? `${proposal.deliveryDate} vs ${mandate.deliverBy}` : "No delivery date",
      state: proposal.deliveryDate !== null && proposal.deliveryDate <= mandate.deliverBy ? "pass" : "fail",
    });
  }
  if (verdict?.verdict === "ESCALATE") {
    rows.push({ label: "Human approval", detail: verdict.reasons.join(" ") || "Escalated", state: "wait" });
  }
  return rows;
}

function merchantRow(mandate: MandateRecord, domain: string): { label: string; detail: string; state: CheckState } {
  const allowed = mandate.allowedMerchants ?? [];
  const blocked = mandate.blockedMerchants.some((rule) => merchantCoveredBy(rule, domain));
  const allowedHit = allowed.length === 0 || allowed.some((rule) => merchantCoveredBy(rule, domain));
  return {
    label: "Merchant domain",
    detail: domain,
    state: blocked || !allowedHit ? "fail" : "pass",
  };
}

function categoryRow(mandate: MandateRecord, category: string | null): { label: string; detail: string; state: CheckState } {
  if (mandate.allowedCategories === null) {
    return { label: "Category", detail: category ?? "Any category", state: "pass" };
  }
  const matches = category !== null && categoryMatches(mandate.allowedCategories, category);
  return { label: "Category", detail: category ?? "Missing category", state: matches ? "pass" : "fail" };
}

function stepDetail(title: string, events: RunRecord["events"]): string | null {
  const latest = events.at(-1);
  if (!latest) {
    return null;
  }
  if (title === "Searching products") {
    const candidates = events.filter((event) => event.type === "shopping.candidate").length;
    return candidates > 0 ? `${candidates} products considered` : latest.type === "shopping.search_failed" ? "Search failed" : "Search finished";
  }
  if (title === "Ranking") {
    const parsed = reasoningSchema.safeParse(latest.payload);
    if (!parsed.success) {
      return "Ranking recorded";
    }
    return parsed.data.accepted ? "A product was selected" : (parsed.data.message ?? "No product accepted");
  }
  if (title === "Policy check") {
    const parsed = verdictEventSchema.safeParse(latest.payload);
    return parsed.success ? parsed.data.verdict : "Verdict recorded";
  }
  return latest.type;
}

function bannerText(status: RunRecord["status"], verdict: z.infer<typeof verdictSchema> | null, chargedCents: number | null, error: string | null): string {
  if (status === "failed") {
    return error ?? "The run failed before checkout.";
  }
  if (status === "running") {
    return "The agent is searching. No money moves until the policy engine approves.";
  }
  if (chargedCents !== null) {
    return `Approved. Captured ${money(chargedCents)} in the PayPal sandbox.`;
  }
  if (verdict === "ESCALATE") {
    return "Escalated. A person has to approve before capture.";
  }
  if (verdict === "BLOCK") {
    return error ?? "Blocked. The policy engine refused the purchase.";
  }
  if (verdict === "APPROVE") {
    return "Approved by the policy engine.";
  }
  return "The run finished without a checkout.";
}

function money(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    return "USD $0.00";
  }
  return `USD $${centsToUsd(cents)}`;
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
