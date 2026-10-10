"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  FolderX,
  Landmark,
  Link2Off,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { MandateForm } from "@/app/mandates/mandate-form";
import { mandateSchema } from "@/lib/policy/schema";

import { formatUsd, MandateCard, type MandateCardModel, type MandateStatus } from "./mandate-card";

const mandateListSchema = z.object({
  mandates: z.array(
    mandateSchema.extend({
      spentCents: z.number().int().nonnegative(),
      heldCents: z.number().int().nonnegative(),
      remainingCents: z.number().int(),
    }),
  ),
});

const walletSchema = z.object({
  linked: z.boolean(),
  fingerprint: z.string().nullable(),
});

type Filter = "all" | MandateStatus;

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "draft", label: "Draft" },
  { id: "expired", label: "Expired" },
  { id: "exhausted", label: "Exhausted" },
];

export function MandateDashboard() {
  const router = useRouter();
  const [mandates, setMandates] = useState<MandateCardModel[] | null>(null);
  const [wallet, setWallet] = useState<z.infer<typeof walletSchema> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [mandateResponse, walletResponse] = await Promise.all([
          fetch("/api/mandates"),
          fetch("/api/wallet"),
        ]);
        const mandateBody: unknown = await mandateResponse.json();
        const walletBody: unknown = await walletResponse.json();
        if (!mandateResponse.ok || !walletResponse.ok) {
          throw new Error("Could not load the dashboard.");
        }
        const parsedMandates = mandateListSchema.parse(mandateBody);
        const parsedWallet = walletSchema.parse(walletBody);
        if (!cancelled) {
          setMandates(parsedMandates.mandates);
          setWallet(parsedWallet);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load mandates.");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const counts = useMemo(() => countByStatus(mandates ?? []), [mandates]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (mandates ?? []).filter((mandate) => {
      if (filter !== "all" && mandate.status !== filter) {
        return false;
      }
      if (needle.length === 0) {
        return true;
      }
      const haystack = [mandate.description, mandate.id, ...(mandate.allowedMerchants ?? [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [filter, mandates, query]);

  const totals = useMemo(() => summarize(mandates ?? []), [mandates]);

  async function runAgent(id: string) {
    setRunningId(id);
    setNotice(null);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mandateId: id }),
      });
      const body = (await response.json()) as { run?: { id: string }; error?: string };
      if (response.ok && body.run?.id) {
        router.push(`/runs/${body.run.id}`);
        return;
      }
      setNotice(body.error ?? "Could not start the run.");
    } catch {
      setNotice("Could not start the run.");
    } finally {
      setRunningId(null);
    }
  }

  async function linkWallet() {
    setLinking(true);
    setNotice(null);
    try {
      const response = await fetch("/api/paypal/link", { method: "POST" });
      const body = (await response.json()) as { approvalUrl?: string; error?: string };
      if (!response.ok || !body.approvalUrl) {
        setNotice(body.error ?? "Could not start the PayPal link.");
        return;
      }
      window.location.assign(body.approvalUrl);
    } catch {
      setNotice("Could not start the PayPal link.");
    } finally {
      setLinking(false);
    }
  }

  if (creating) {
    return (
      <AppShell walletLinked={wallet ? wallet.linked : null}>
        <MandateForm
          onDone={() => {
            setCreating(false);
            setReloadKey((value) => value + 1);
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell walletLinked={wallet ? wallet.linked : null}>
      <section className="relative mb-6 overflow-hidden rounded-3xl border border-border bg-[#eff4ff] p-6">
        <div className="pointer-events-none absolute -top-16 -right-12 size-64 rounded-full bg-[#beebe9]/40 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex max-w-3xl flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-bold tracking-[0.08em] text-primary-foreground uppercase">
                Execution Standard
              </span>
              <span className="font-mono text-[11px] text-[#545f73]">POLICY_GOV_SPEC_v2.08</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-balance text-primary sm:text-4xl">
              The AI proposes. Deterministic rules decide.
            </h1>
            <p className="text-sm leading-6 text-[#404848]">
              Autonomous agents search catalogs and draft a cart. Spending caps, merchant lists, and return rules are
              enforced in code before any sandbox capture.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm">
            <div className="text-right">
              <p className="text-[11px] font-bold tracking-[0.06em] text-[#545f73] uppercase">Deterministic Shield</p>
              <p className="font-mono text-[11px] font-semibold text-[#00402a]">ZERO OVERDRAFT RISK</p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-lg bg-[#00402a]/10 text-[#00402a]">
              <ShieldCheck className="size-5" />
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-3xl border border-border bg-card p-6 shadow-sm">
        {wallet === null ? (
          <p className="font-mono text-[11px] text-[#545f73]">Checking the PayPal sandbox vault…</p>
        ) : wallet.linked ? (
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-[#f1f5f9] text-primary">
              <Wallet className="size-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">PayPal Authorized Ledger</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#85f8c4] px-2 py-0.5 font-mono text-[11px] text-[#002114]">
                  <span className="size-1.5 rounded-full bg-[#00402a]" />
                  VERIFIED ACTIVE
                </span>
              </div>
              <p className="mt-0.5 font-mono text-[13px] text-[#545f73]">
                Vault fingerprint: <strong className="text-foreground">{wallet.fingerprint ?? "linked"}</strong>
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-[#ffdad6]/40 text-[#ba1a1a]">
                <Link2Off className="size-7" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">No execution account tethered</h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#ffdad6] px-2 py-0.5 font-mono text-[11px] text-[#93000a]">
                    <span className="size-1.5 rounded-full bg-[#ba1a1a]" />
                    STANDBY DISARMED
                  </span>
                </div>
                <p className="text-sm text-[#404848]">
                  Link a PayPal sandbox wallet before an approved purchase can be captured.
                </p>
              </div>
            </div>
            <Button type="button" disabled={linking || wallet === null} onClick={() => void linkWallet()} className="h-10 rounded-lg px-4">
              {linking ? "Opening PayPal…" : "Link PayPal wallet"}
            </Button>
          </div>
        )}
      </section>

      {mandates === null ? null : (
      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Active mandates" value={String(counts.active)} detail={`/ ${counts.all} configured`} note="Policy evaluation live" icon={<Landmark className="size-5" />} />
        <Metric label="Total allocated" value={formatUsd(totals.allocatedCents)} detail="" note="Sum of mandate caps" icon={<Landmark className="size-5" />} />
        <Metric label="Captured (spent)" value={formatUsd(totals.spentCents)} detail="" note="Settled on merchant rails" icon={<Receipt className="size-5" />} />
        <Metric label="Escrow holds" value={formatUsd(totals.heldCents)} detail="" note="Awaiting capture or release" icon={<LockKeyhole className="size-5" />} />
      </section>
      )}

      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex gap-1 overflow-x-auto rounded-2xl bg-[#eff4ff] p-1" role="tablist" aria-label="Mandate status">
          {filters.map((item) => {
            const selected = filter === item.id;
            const count = item.id === "all" ? counts.all : counts[item.id];
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`rounded-xl px-4 py-2 text-sm whitespace-nowrap ${selected ? "bg-card font-semibold text-primary shadow-sm" : "text-[#545f73] hover:bg-[#dce9ff]"}`}
                onClick={() => setFilter(item.id)}
              >
                {item.label} ({count})
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <label className="relative block sm:w-72">
            <span className="sr-only">Filter mandates</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#545f73]" />
            <input
              className="h-10 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-sm outline-none focus:border-primary"
              placeholder="Filter mandates, merchants..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <Button type="button" className="h-10 rounded-lg px-4" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            New mandate
          </Button>
        </div>
      </div>

      {notice ? <p className="mb-4 text-sm text-[#404848]">{notice}</p> : null}
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {mandates === null && !error ? <SyncingCard /> : null}

      {mandates !== null && mandates.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : null}

      {mandates !== null && mandates.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">No mandates match this filter.</p>
          ) : (
            visible.map((mandate) => (
              <MandateCard
                key={mandate.id}
                mandate={mandate}
                pending={runningId === mandate.id}
                onRun={(id) => void runAgent(id)}
              />
            ))
          )}
        </div>
      ) : null}
    </AppShell>
  );
}

function Metric({
  label,
  value,
  detail,
  note,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  note: string;
  icon: ReactNode;
}) {
  return (
    <article className="flex flex-col justify-between rounded-3xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between text-[#545f73]">
        <span className="text-[11px] font-bold tracking-[0.06em] uppercase">{label}</span>
        {icon}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono text-2xl leading-none font-bold tracking-tight text-primary">{value}</span>
        {detail ? <span className="font-mono text-[11px] text-[#545f73]">{detail}</span> : null}
      </div>
      <p className="mt-1 text-xs font-medium text-[#00402a]">{note}</p>
    </article>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="flex flex-col items-center rounded-3xl border border-border bg-card px-6 py-10 text-center shadow-sm">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-[#f1f5f9] text-[#545f73]">
        <FolderX className="size-8" />
      </div>
      <p className="mb-1 text-[11px] font-bold tracking-[0.06em] text-[#545f73] uppercase">
        Condition: zero mandates active
      </p>
      <h2 className="mb-2 text-lg font-semibold">No mandates configured yet</h2>
      <p className="mb-6 max-w-md text-sm text-[#404848]">
        Define spending boundaries for the shopping agent. The engine blocks any checkout outside those limits.
      </p>
      <Button type="button" className="h-10 rounded-lg px-4" onClick={onCreate}>
        <Plus className="size-4" />
        Create your first mandate
      </Button>
    </section>
  );
}

function SyncingCard() {
  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-sm" aria-busy="true" aria-live="polite">
      <div className="mb-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f5f9] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#545f73]">
          <LoaderCircle className="size-3.5 animate-spin" />
          SYNCING LEDGER
        </span>
        <span className="font-mono text-[11px] text-[#545f73]">Loading mandates</span>
      </div>
      <div className="space-y-3">
        <div className="h-6 w-3/4 animate-pulse rounded bg-[#f1f5f9]" />
        <div className="h-3 w-full animate-pulse rounded bg-[#dce9ff]" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-[#dce9ff]" />
      </div>
      <p className="mt-4 font-mono text-[11px] text-[#545f73]">Reading saved mandates and the linked PayPal vault…</p>
    </section>
  );
}

function countByStatus(mandates: MandateCardModel[]) {
  return {
    all: mandates.length,
    active: mandates.filter((mandate) => mandate.status === "active").length,
    draft: mandates.filter((mandate) => mandate.status === "draft").length,
    expired: mandates.filter((mandate) => mandate.status === "expired").length,
    exhausted: mandates.filter((mandate) => mandate.status === "exhausted").length,
  };
}

function summarize(mandates: MandateCardModel[]) {
  return mandates.reduce(
    (totals, mandate) => ({
      allocatedCents: totals.allocatedCents + mandate.maxTotalCents,
      spentCents: totals.spentCents + mandate.spentCents,
      heldCents: totals.heldCents + mandate.heldCents,
    }),
    { allocatedCents: 0, spentCents: 0, heldCents: 0 },
  );
}
