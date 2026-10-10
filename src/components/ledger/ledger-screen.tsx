"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Search } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { centsToUsd, usdToCents } from "@/lib/money";

const eventSchema = z.object({
  id: z.string(),
  mandateId: z.string().nullable(),
  runId: z.string().nullable(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

type LedgerEvent = z.infer<typeof eventSchema>;
type SortKey = "createdAt" | "type" | "mandateId";

export function LedgerScreen() {
  const [events, setEvents] = useState<LedgerEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/ledger?limit=200");
        const body: unknown = await response.json();
        if (!response.ok) {
          throw new Error("Could not load the ledger.");
        }
        const parsed = z.object({ events: z.array(eventSchema) }).parse(body);
        if (!cancelled) {
          setEvents(parsed.events);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load the ledger.");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const types = useMemo(() => uniqueTypes(events ?? []), [events]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = (events ?? []).filter((event) => {
      if (type !== "all" && event.type !== type) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return [event.type, event.id, event.mandateId ?? "", event.runId ?? "", verdictOf(event) ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    return filtered.sort((left, right) => compare(left, right, sortKey, sortAsc));
  }, [events, query, sortAsc, sortKey, type]);

  const selected = visible.find((event) => event.id === selectedId) ?? visible[0] ?? null;
  const totals = useMemo(() => summarize(events ?? []), [events]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((value) => !value);
      return;
    }
    setSortKey(key);
    setSortAsc(key !== "createdAt");
  }

  return (
    <AppShell activeNav="/ledger">
      <header className="mb-6 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Deterministic audit ledger</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#404848]">
            Append-only. Every parse, search, verdict, and sandbox capture is written here and cannot be edited.
          </p>
        </div>
        <Button type="button" variant="outline" className="h-10 rounded-lg bg-card px-4" onClick={() => exportCsv(visible)} disabled={visible.length === 0}>
          <Download className="size-4" />
          Export CSV
        </Button>
      </header>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Captured" value={money(totals.spentCents)} note="Settled sandbox captures" />
        <Metric label="Escrow holds" value={money(totals.heldCents)} note="Reservations still open" />
        <Metric label="Events loaded" value={String(events?.length ?? 0)} note="Newest 200 rows" />
        <Metric label="Mandates touched" value={String(totals.mandates)} note="Distinct mandate ids" />
      </section>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative block lg:w-80">
          <span className="sr-only">Search the ledger</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#545f73]" />
          <input
            className="h-10 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-sm outline-none focus:border-primary"
            placeholder="Search type, mandate, run, verdict"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="text-sm text-[#545f73]">
          <span className="sr-only">Event type</span>
          <select
            className="h-10 rounded-lg border border-border bg-card px-3"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="all">All types</option>
            {types.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-x-auto rounded-3xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="bg-[#f8fafc] font-mono text-[11px] tracking-wider text-[#545f73] uppercase">
              <tr>
                <SortHeader label="Timestamp" active={sortKey === "createdAt"} asc={sortAsc} onClick={() => toggleSort("createdAt")} />
                <SortHeader label="Event" active={sortKey === "type"} asc={sortAsc} onClick={() => toggleSort("type")} />
                <th className="px-4 py-3 font-medium">Verdict</th>
                <SortHeader label="Mandate" active={sortKey === "mandateId"} asc={sortAsc} onClick={() => toggleSort("mandateId")} />
                <th className="px-4 py-3 font-medium">Run</th>
              </tr>
            </thead>
            <tbody>
              {events === null && !error ? (
                <tr>
                  <td className="px-4 py-8 font-mono text-[11px] text-[#545f73]" colSpan={5}>
                    Loading the ledger…
                  </td>
                </tr>
              ) : null}
              {events !== null && visible.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center" colSpan={5}>
                    <p className="font-semibold">No ledger entries matched that filter</p>
                    <p className="mt-1 text-sm text-[#545f73]">Clear the search or choose another event type.</p>
                  </td>
                </tr>
              ) : null}
              {visible.map((event) => {
                const selectedRow = selected?.id === event.id;
                return (
                  <tr
                    key={event.id}
                    className={`cursor-pointer border-t border-[#f1f5f9] ${selectedRow ? "bg-[#eff4ff]" : "hover:bg-[#f8fafc]"}`}
                    onClick={() => setSelectedId(event.id)}
                  >
                    <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap">{formatTime(event.createdAt)}</td>
                    <td className="px-4 py-3 font-mono text-[12px]">{event.type}</td>
                    <td className="px-4 py-3">
                      <VerdictBadge event={event} />
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px]">{event.mandateId ? event.mandateId.slice(0, 8).toUpperCase() : "—"}</td>
                    <td className="px-4 py-3 font-mono text-[12px]">
                      {event.runId ? (
                        <Link href={`/runs/${event.runId}`} className="text-primary underline-offset-2 hover:underline" onClick={(click) => click.stopPropagation()}>
                          {event.runId.slice(0, 8).toUpperCase()}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside className="rounded-3xl border border-border bg-[#f1f5f9] p-4">
          <p className="font-mono text-[11px] font-semibold tracking-wider text-[#545f73] uppercase">Event payload</p>
          {selected ? (
            <>
              <p className="mt-2 font-mono text-[12px] font-semibold">{selected.type}</p>
              <p className="mt-1 font-mono text-[11px] text-[#545f73]">{selected.id}</p>
              <pre className="mt-3 max-h-[480px] overflow-auto font-mono text-[11px] leading-5">{JSON.stringify(selected.payload, null, 2)}</pre>
            </>
          ) : (
            <p className="mt-3 text-sm text-[#545f73]">Select a row to inspect its payload.</p>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-bold tracking-[0.06em] text-[#545f73] uppercase">{label}</p>
      <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-primary">{value}</p>
      <p className="mt-1 text-xs text-[#00402a]">{note}</p>
    </article>
  );
}

function SortHeader({ label, active, asc, onClick }: { label: string; active: boolean; asc: boolean; onClick: () => void }) {
  return (
    <th className="px-4 py-3 font-medium">
      <button type="button" className="inline-flex items-center gap-1" onClick={onClick}>
        {label}
        <span aria-hidden="true">{active ? (asc ? "↑" : "↓") : ""}</span>
        <span className="sr-only">{active ? (asc ? "sorted ascending" : "sorted descending") : "sort"}</span>
      </button>
    </th>
  );
}

function VerdictBadge({ event }: { event: LedgerEvent }) {
  const verdict = verdictOf(event);
  if (!verdict) {
    return <span className="font-mono text-[11px] text-[#545f73]">—</span>;
  }
  const tone =
    verdict === "APPROVE" || verdict === "CAPTURED"
      ? "border-[#a7f3d0] bg-[#ecfdf5] text-[#065f46]"
      : verdict === "BLOCK" || verdict === "FAILED"
        ? "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]"
        : "border-[#fde68a] bg-[#fffbeb] text-[#92400e]";
  return <span className={`rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold ${tone}`}>{verdict}</span>;
}

function verdictOf(event: LedgerEvent): string | null {
  const verdict = event.payload.verdict;
  if (verdict === "APPROVE" || verdict === "ESCALATE" || verdict === "BLOCK") {
    return verdict;
  }
  if (event.type === "paypal.order.captured") {
    return "CAPTURED";
  }
  if (event.type.endsWith(".failed") || event.type === "checkout.blocked") {
    return "FAILED";
  }
  if (event.type === "checkout.escalated") {
    return "ESCALATE";
  }
  return null;
}

function uniqueTypes(events: LedgerEvent[]): string[] {
  return [...new Set(events.map((event) => event.type))].sort();
}

function compare(left: LedgerEvent, right: LedgerEvent, key: SortKey, asc: boolean): number {
  const order = (left[key] ?? "").localeCompare(right[key] ?? "");
  return asc ? order : -order;
}

function summarize(events: LedgerEvent[]): { spentCents: number; heldCents: number; mandates: number } {
  const mandates = new Set(events.map((event) => event.mandateId).filter((id): id is string => id !== null));
  const seenOrders = new Set<string>();
  const settled = new Set<string>();
  const released = new Set<string>();
  let spentCents = 0;

  for (const event of events) {
    const reservationId = stringField(event.payload, "reservationId");
    if (event.type === "checkout.released" && reservationId) {
      released.add(reservationId);
    }
    if (event.type === "paypal.order.captured" && reservationId) {
      settled.add(reservationId);
    }
  }

  for (const event of events) {
    if (event.type !== "paypal.order.captured") {
      continue;
    }
    const orderId = stringField(event.payload, "orderId");
    if (orderId) {
      if (seenOrders.has(orderId)) {
        continue;
      }
      seenOrders.add(orderId);
    }
    const cents = captureCents(event.payload);
    if (cents !== null && spentCents <= Number.MAX_SAFE_INTEGER - cents) {
      spentCents += cents;
    }
  }

  let heldCents = 0;
  for (const event of events) {
    if (event.type !== "checkout.reserved") {
      continue;
    }
    const reservationId = stringField(event.payload, "reservationId");
    const amount = event.payload.amountCents;
    if (!reservationId || typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
      continue;
    }
    if (settled.has(reservationId) || released.has(reservationId)) {
      continue;
    }
    if (heldCents <= Number.MAX_SAFE_INTEGER - amount) {
      heldCents += amount;
    }
  }

  return { spentCents, heldCents, mandates: mandates.size };
}

function captureCents(payload: Record<string, unknown>): number | null {
  const amount = payload.amount;
  if (!amount || typeof amount !== "object" || !("value" in amount)) {
    return null;
  }
  const value = amount.value;
  if (typeof value !== "string") {
    return null;
  }
  try {
    return usdToCents(value);
  } catch {
    return null;
  }
}

function stringField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function money(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    return "USD $0.00";
  }
  return `USD $${centsToUsd(cents)}`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function exportCsv(events: LedgerEvent[]) {
  const header = ["createdAt", "type", "verdict", "mandateId", "runId", "id"];
  const lines = [header.join(",")];
  for (const event of events) {
    lines.push(
      [event.createdAt, event.type, verdictOf(event) ?? "", event.mandateId ?? "", event.runId ?? "", event.id]
        .map(csvCell)
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "mandate-ledger.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
