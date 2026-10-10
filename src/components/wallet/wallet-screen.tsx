"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ShieldCheck, Wallet } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/app-shell";
import { formatUsd } from "@/components/mandates/mandate-card";
import { Button } from "@/components/ui/button";
import { mandateSchema } from "@/lib/policy/schema";

const walletSchema = z.object({
  linked: z.boolean(),
  fingerprint: z.string().nullable(),
});

const mandateListSchema = z.object({
  mandates: z.array(
    mandateSchema.extend({
      spentCents: z.number().int().nonnegative(),
      heldCents: z.number().int().nonnegative(),
      remainingCents: z.number().int(),
    }),
  ),
});

const eventSchema = z.object({
  id: z.string(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

type WalletState = z.infer<typeof walletSchema>;
type MandateRow = z.infer<typeof mandateListSchema>["mandates"][number];
type LedgerEvent = z.infer<typeof eventSchema>;

export function WalletScreen() {
  const searchParams = useSearchParams();
  const linkedFlag = searchParams.get("linked");
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [mandates, setMandates] = useState<MandateRow[] | null>(null);
  const [events, setEvents] = useState<LedgerEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [walletResponse, mandateResponse, ledgerResponse] = await Promise.all([
          fetch("/api/wallet"),
          fetch("/api/mandates"),
          fetch("/api/ledger?limit=200"),
        ]);
        const walletBody: unknown = await walletResponse.json();
        const mandateBody: unknown = await mandateResponse.json();
        const ledgerBody: unknown = await ledgerResponse.json();
        if (!walletResponse.ok) {
          const message = z.object({ error: z.string() }).safeParse(walletBody);
          throw new Error(message.success ? message.data.error : "Could not load the wallet.");
        }
        const parsedWallet = walletSchema.parse(walletBody);
        const parsedMandates = mandateListSchema.safeParse(mandateBody);
        const parsedEvents = z.object({ events: z.array(eventSchema) }).safeParse(ledgerBody);
        if (!cancelled) {
          setWallet(parsedWallet);
          setMandates(parsedMandates.success ? parsedMandates.data.mandates : []);
          setEvents(parsedEvents.success ? parsedEvents.data.events.filter((event) => event.type.startsWith("paypal.")) : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load the wallet.");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const active = (mandates ?? []).filter((mandate) => mandate.status === "active");
  const totals = active.reduce(
    (sum, mandate) => ({
      allocatedCents: sum.allocatedCents + mandate.maxTotalCents,
      spentCents: sum.spentCents + mandate.spentCents,
      heldCents: sum.heldCents + mandate.heldCents,
    }),
    { allocatedCents: 0, spentCents: 0, heldCents: 0 },
  );
  const paypalEvents = (events ?? []).slice(0, 8);
  const notice =
    linkedFlag === "1"
      ? "PayPal returned from the sandbox approval."
      : linkedFlag === "0"
        ? "PayPal linking was cancelled or did not finish."
        : null;

  async function linkWallet() {
    setLinking(true);
    setError(null);
    try {
      const response = await fetch("/api/paypal/link", { method: "POST" });
      const body: unknown = await response.json().catch(() => null);
      const parsed = z.object({ approvalUrl: z.string().optional(), error: z.string().optional() }).safeParse(body);
      if (!response.ok || !parsed.success || !parsed.data.approvalUrl) {
        setError(parsed.success ? (parsed.data.error ?? "Could not start the PayPal link.") : "Could not start the PayPal link.");
        setLinking(false);
        return;
      }
      window.location.assign(parsed.data.approvalUrl);
    } catch {
      setError("Could not start the PayPal link.");
      setLinking(false);
    }
  }

  return (
    <AppShell walletLinked={wallet ? wallet.linked : null} activeNav="/wallet">
      <header className="mb-6 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <p className="font-mono text-[11px] tracking-wide text-[#545f73] uppercase">PayPal sandbox vault</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-primary">Link payment source</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#404848]">
            Approved carts are charged from the saved PayPal sandbox wallet. Spending still has to pass the mandate rules first.
          </p>
        </div>
      </header>

      {notice ? <p className="mb-4 text-sm text-[#92400e]">{notice}</p> : null}
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1.4fr_0.7fr]">
        <div className="flex flex-col gap-6">
          <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Step
              index="01"
              title="Authenticate PayPal"
              body="Approve a sandbox billing agreement. The vault id stays on the server."
              state={wallet === null ? "waiting" : wallet.linked ? "done" : "current"}
            />
            <Step
              index="02"
              title="Confirm mandates"
              body="Each purchase is capped by an active mandate, not by the wallet page."
              state={mandates === null ? "waiting" : active.length > 0 ? "done" : "current"}
            />
            <Step
              index="03"
              title="Policy then capture"
              body="The engine approves, escalates, or blocks before any sandbox capture."
              state="rule"
            />
          </ol>

          <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Saved payment method</h2>
                <p className="mt-1 font-mono text-[12px] text-[#545f73]">
                  {wallet === null
                    ? "Checking the PayPal sandbox vault…"
                    : wallet.linked
                      ? `Fingerprint ${wallet.fingerprint ?? "linked"}`
                      : "No sandbox wallet is saved."}
                </p>
              </div>
              {wallet ? (
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${wallet.linked ? "bg-[#ecfdf5] text-[#065f46]" : "bg-[#fef2f2] text-[#991b1b]"}`}
                >
                  {wallet.linked ? "LINKED" : "NOT LINKED"}
                </span>
              ) : null}
            </div>

            {mandates === null ? (
              <p className="mt-6 font-mono text-[11px] text-[#545f73]">Reading mandate balances…</p>
            ) : (
              <div className="mt-6">
                <div className="mb-2 flex items-baseline justify-between font-mono text-[12px]">
                  <span className="text-[#545f73]">Active mandate caps</span>
                  <span>{formatUsd(totals.allocatedCents)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#e2e8f0]" aria-hidden>
                  <div className="flex h-full">
                    <span className="bg-[#059669]" style={{ width: share(totals.spentCents, totals.allocatedCents) }} />
                    <span className="bg-[#d97706]" style={{ width: share(totals.heldCents, totals.allocatedCents) }} />
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-3 font-mono text-[12px]">
                  <Stat label="Captured" value={formatUsd(totals.spentCents)} />
                  <Stat label="Held" value={formatUsd(totals.heldCents)} />
                  <Stat label="Active mandates" value={String(active.length)} />
                </dl>
                {active.length > 0 ? (
                  <ul className="mt-4 flex flex-col gap-2">
                    {active.slice(0, 4).map((mandate) => (
                      <li key={mandate.id} className="flex items-baseline justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">{mandate.description}</span>
                        <span className="shrink-0 font-mono text-[12px] text-[#545f73]">{formatUsd(mandate.remainingCents)} left</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-[#545f73]">
                    No active mandate yet. <Link className="font-semibold text-primary underline" href="/mandates">Create one</Link> before a run can spend.
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">PayPal ledger</h2>
              <Link className="font-mono text-[11px] font-semibold text-primary underline" href="/ledger">
                Open full ledger
              </Link>
            </div>
            {events === null ? (
              <p className="font-mono text-[11px] text-[#545f73]">Reading PayPal events…</p>
            ) : paypalEvents.length === 0 ? (
              <p className="text-sm text-[#545f73]">No PayPal vault or order events in the latest ledger page.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {paypalEvents.map((event) => (
                  <li key={event.id} className="rounded-xl border border-border px-3 py-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-mono text-[12px] font-semibold">{event.type}</span>
                      <time className="font-mono text-[11px] text-[#545f73]" dateTime={event.createdAt}>
                        {formatTime(event.createdAt)}
                      </time>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-[#545f73]">{summarizePayload(event.payload)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="rounded-3xl border border-border bg-card p-6 shadow-sm xl:sticky xl:top-24">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#f1f5f9] text-primary">
            {wallet?.linked ? <ShieldCheck className="size-6" /> : <Wallet className="size-6" />}
          </div>
          <h2 className="text-lg font-semibold tracking-tight">{wallet?.linked ? "Sandbox wallet is linked" : "Link a sandbox wallet"}</h2>
          <p className="mt-2 text-sm leading-6 text-[#404848]">
            Connect opens PayPal sandbox approval. After you approve, this app stores the payment token and shows only its fingerprint.
          </p>
          <Button className="mt-5 h-11 w-full" disabled={wallet === null || linking} onClick={() => void linkWallet()}>
            {linking ? "Opening PayPal…" : wallet?.linked ? "Link a different sandbox account" : "Connect with PayPal"}
          </Button>
          <p className="mt-4 text-xs leading-5 text-[#545f73]">
            This does not move money by itself. A capture happens only after a mandate run is approved.
          </p>
        </aside>
      </div>
    </AppShell>
  );
}

function Step({ index, title, body, state }: { index: string; title: string; body: string; state: "done" | "current" | "waiting" | "rule" }) {
  const label = state === "done" ? "Done" : state === "current" ? "Needed" : state === "rule" ? "Always on" : "Checking";
  const tone = state === "done" ? "text-[#065f46]" : state === "current" ? "text-[#92400e]" : "text-[#545f73]";
  return (
    <li className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between font-mono text-[11px]">
        <span className="text-[#545f73]">{index}</span>
        <span className={tone}>{label}</span>
      </div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-[#545f73]">{body}</p>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[#545f73]">{label}</dt>
      <dd className="mt-0.5 font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function share(part: number, total: number): string {
  if (total <= 0 || part <= 0) {
    return "0%";
  }
  return `${Math.min(100, (part / total) * 100)}%`;
}

function summarizePayload(payload: Record<string, unknown>): string {
  const keys = ["status", "vaultFingerprint", "setupFingerprint", "paymentMethodId", "orderId", "step", "message"];
  const parts = keys.flatMap((key) => {
    const value = payload[key];
    return typeof value === "string" && value.length > 0 ? [`${key} ${value}`] : [];
  });
  return parts.length > 0 ? parts.join(" · ") : "Recorded";
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
