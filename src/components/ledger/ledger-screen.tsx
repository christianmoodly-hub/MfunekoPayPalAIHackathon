"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ICellRendererParams, DoesExternalFilterPass } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import type { ColDef, GridApi } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { Download, Search } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { centsToUsd, usdToCents } from "@/lib/money";

ModuleRegistry.registerModules([AllCommunityModule]);

const eventSchema = z.object({
  id: z.string(),
  mandateId: z.string().nullable(),
  runId: z.string().nullable(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

type LedgerEvent = z.infer<typeof eventSchema>;

const ledgerTheme = themeQuartz.withParams({
  backgroundColor: "var(--card)",
  foregroundColor: "var(--card-foreground)",
  headerBackgroundColor: "var(--muted)",
  headerTextColor: "var(--muted-foreground)",
  borderColor: "var(--border)",
  accentColor: "var(--primary)",
  fontFamily: "inherit",
  spacing: 8,
});

export function LedgerScreen() {
  const gridRef = useRef<AgGridReact<LedgerEvent>>(null);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showEverything, setShowEverything] = useState(false);
  const [balances, setBalances] = useState<{ spentCents: number; heldCents: number } | null>(null);
  const [unlinkedCapturedCents, setUnlinkedCapturedCents] = useState(0);
  const [missingMandate, setMissingMandate] = useState({
    spentCents: 0,
    heldCents: 0,
    holdCount: 0,
    reconciliationCount: 0,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gridApi, setGridApi] = useState<GridApi<LedgerEvent> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/ledger?limit=200");
        const body: unknown = await response.json();
        if (!response.ok) throw new Error("Could not load the ledger.");
        const parsed = z.object({
          events: z.array(eventSchema),
          mandates: z.array(z.object({ spentCents: z.number(), heldCents: z.number() })),
          unlinkedSandboxCapturedCents: z.number(),
          missingMandateCapturedCents: z.number(),
          missingMandateHeldCents: z.number(),
          missingMandateHoldCount: z.number(),
          missingMandateReconciliationCount: z.number(),
        }).parse(body);
        if (cancelled) return;
        setEvents(parsed.events);
        setBalances(parsed.mandates.reduce(
          (sum, row) => ({
            spentCents: sum.spentCents + row.spentCents,
            heldCents: sum.heldCents + row.heldCents,
          }),
          { spentCents: 0, heldCents: 0 },
        ));
        setUnlinkedCapturedCents(parsed.unlinkedSandboxCapturedCents);
        setMissingMandate({
          spentCents: parsed.missingMandateCapturedCents,
          heldCents: parsed.missingMandateHeldCents,
          holdCount: parsed.missingMandateHoldCount,
          reconciliationCount: parsed.missingMandateReconciliationCount,
        });
      } catch {
        if (!cancelled) setError("Could not load the ledger.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => summarize(events), [events]);
  const selected = events.find((event) => event.id === selectedId) ?? null;
  const columnDefs = useMemo<ColDef<LedgerEvent>[]>(() => [
    {
      field: "createdAt",
      headerName: "Timestamp",
      minWidth: 190,
      sort: "desc",
      filter: "agTextColumnFilter",
      valueFormatter: ({ value }) => formatTime(value ?? ""),
    },
    {
      field: "type",
      headerName: "Event",
      minWidth: 230,
      cellRenderer: (params: ICellRendererParams<LedgerEvent, string>) =>
        <EventBadge type={params.value ?? ""} />,
    },
    {
      colId: "verdict",
      headerName: "Verdict",
      minWidth: 125,
      filter: "agTextColumnFilter",
      valueGetter: ({ data }) => (data ? verdictOf(data) : null),
    },
    {
      colId: "amount",
      headerName: "Amount",
      minWidth: 125,
      filter: "agNumberColumnFilter",
      valueGetter: ({ data }) => (data ? eventAmountCents(data) : null),
      valueFormatter: ({ value }) => (typeof value === "number" ? money(value) : "—"),
      cellRenderer: (params: ICellRendererParams<LedgerEvent, number | null>) => (
        <span className="font-mono text-xs font-medium">
          {typeof params.value === "number" ? money(params.value) : "—"}
        </span>
      ),
    },
    {
      field: "mandateId",
      headerName: "Mandate",
      minWidth: 145,
      valueFormatter: ({ value }) => (value ? value.slice(0, 8).toUpperCase() : "—"),
    },
    {
      field: "runId",
      headerName: "Run",
      minWidth: 140,
      cellRenderer: (params: ICellRendererParams<LedgerEvent, string | null>) => {
        if (!params.value) return <span className="text-muted-foreground">—</span>;
        return (
          <a
            href={"/runs/" + params.value}
            className="font-mono text-xs text-primary underline-offset-2 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {params.value.slice(0, 8).toUpperCase()}
          </a>
        );
      },
    },
  ], []);
  const defaultColDef = useMemo<ColDef<LedgerEvent>>(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 110,
    flex: 1,
  }), []);
  const rowClassRules = useMemo(() => ({
    "ledger-row-selected": (params: { data?: LedgerEvent }) => params.data?.id === selectedId,
  }), [selectedId]);
  const isExternalFilterPresent = useCallback(
    () => !showEverything,
    [showEverything],
  );
  const doesExternalFilterPass = useCallback<DoesExternalFilterPass<LedgerEvent>>(
    (node) => Boolean(node.data && isMoneyEvent(node.data.type)),
    [],
  );

  useEffect(() => {
    gridApi?.onFilterChanged();
  }, [gridApi, isExternalFilterPresent, showEverything]);

  function exportAuditTrail() {
    gridRef.current?.api.exportDataAsCsv({
      fileName: "mandate-audit-trail.csv",
    });
  }

  return (
    <AppShell activeNav="/ledger">
      <header className="mb-6 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Deterministic audit ledger</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Append-only. Every parse, search, verdict, and sandbox capture is written here and cannot be edited.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-lg bg-card px-4"
          onClick={exportAuditTrail}
          disabled={loading || events.length === 0}
        >
          <Download className="size-4" />
          Export audit trail
        </Button>
      </header>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Mandate captures" value={money((balances?.spentCents ?? 0) + missingMandate.spentCents)} note="Only mandate-linked captures count as spend" />
        <Metric label="Open reservations" value={money((balances?.heldCents ?? 0) + missingMandate.heldCents)} note="Reserved mandate spend" />
        <Metric label="Unlinked captures" value={money(unlinkedCapturedCents)} note="Sandbox test charges without a mandate" />
        <Metric label="Events loaded" value={String(events.length)} note="Newest 200 rows" />
        <Metric label="Mandates touched" value={String(totals.mandates)} note="Distinct mandate ids" />
      </section>

      {missingMandate.holdCount > 0 ? (
        <p className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          {missingMandate.holdCount} open reservation{missingMandate.holdCount === 1 ? "" : "s"} ({money(missingMandate.heldCents)}) belong to mandate ids with no matching mandate record.
          {missingMandate.reconciliationCount > 0 ? " " + missingMandate.reconciliationCount + " need reconciliation." : ""}
        </p>
      ) : null}
      {events.some((event) => event.type === "checkout.needs_reconciliation") ? (
        <p className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          {events.filter((event) => event.type === "checkout.needs_reconciliation").length} checkout hold(s) need reconciliation and remain reserved.
        </p>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block sm:w-96">
          <span className="sr-only">Search the ledger</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-10 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-sm outline-none focus:border-primary"
            placeholder="Search all visible columns"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showEverything}
            onChange={(event) => setShowEverything(event.target.checked)}
          />
          Show everything
        </label>
      </div>

      {error ? <p className="mb-4 text-sm text-destructive" role="alert">{error}</p> : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 overflow-hidden rounded-3xl border border-border bg-card shadow-sm" aria-label="Audit trail">
          <div className="ledger-grid h-[620px] min-h-[420px] w-full">
            <AgGridReact<LedgerEvent>
              ref={gridRef}
              rowData={events}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              theme={ledgerTheme}
              quickFilterText={query}
              pagination
              paginationPageSize={25}
              paginationPageSizeSelector={[25, 50, 100]}
              getRowId={({ data }) => data.id}
              rowClassRules={rowClassRules}
              isExternalFilterPresent={isExternalFilterPresent}
              doesExternalFilterPass={doesExternalFilterPass}
              onGridReady={({ api }) => setGridApi(api)}
              onRowClicked={({ data }) => {
                if (data) setSelectedId(data.id);
              }}
              overlayNoRowsTemplate={loading ? "Loading the ledger…" : "No ledger entries to display"}
            />
          </div>
        </section>

        <aside className="min-w-0 rounded-3xl border border-border bg-muted p-4" aria-label="Selected event details">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Event payload</p>
            {selected ? (
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSelectedId(null)}>
                Close
              </button>
            ) : null}
          </div>
          {selected ? (
            <>
              <p className="mt-2 break-all font-mono text-xs font-semibold">{selected.type}</p>
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{selected.id}</p>
              <pre className="mt-3 max-h-[480px] overflow-auto font-mono text-[11px] leading-5">
                {JSON.stringify(formatPayload(selected.payload), null, 2)}
              </pre>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Select a row to inspect its payload.</p>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-primary">{value}</p>
      <p className="mt-1 text-xs text-primary">{note}</p>
    </article>
  );
}

function EventBadge({ type }: { type: string }) {
  const palette = type.startsWith("paypal.order.")
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : type.startsWith("checkout.")
      ? "border-sky-200 bg-sky-50 text-sky-800"
      : type.startsWith("approval.")
        ? "border-violet-200 bg-violet-50 text-violet-800"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span className={"inline-flex max-w-full truncate rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium " + palette}>
      {type}
    </span>
  );
}

function verdictOf(event: LedgerEvent): string | null {
  const verdict = event.payload.verdict;
  if (verdict === "APPROVE" || verdict === "ESCALATE" || verdict === "BLOCK") return verdict;
  if (event.type === "paypal.order.captured") return "CAPTURED";
  if (event.type.endsWith(".failed") || event.type === "checkout.blocked") return "FAILED";
  if (event.type === "checkout.escalated") return "ESCALATE";
  if (event.type === "checkout.needs_reconciliation") return "RECONCILIATION";
  return null;
}

function isMoneyEvent(type: string): boolean {
  return type.startsWith("paypal.order.") || type.startsWith("checkout.") || type.startsWith("approval.");
}

function eventAmountCents(event: LedgerEvent): number | null {
  if (event.type === "paypal.order.captured") return captureCents(event.payload);
  for (const key of ["amountCents", "expectedCents", "statedTotalCents", "totalCents"]) {
    const value = event.payload[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  }
  return captureCents(event.payload);
}

function formatPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => {
    if (typeof value === "number" && /cents$/i.test(key) && Number.isSafeInteger(value)) {
      return [key.replace(/cents$/i, ""), money(value)];
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      if (key === "amount" && nested.currencyCode === "USD" && typeof nested.value === "string") {
        return [key, { ...nested, value: "USD $" + nested.value }];
      }
      return [key, formatPayload(nested)];
    }
    return [key, value];
  }));
}

function summarize(events: LedgerEvent[]): { mandates: number } {
  return {
    mandates: new Set(events.map((event) => event.mandateId).filter((id): id is string => id !== null)).size,
  };
}

function captureCents(payload: Record<string, unknown>): number | null {
  const amount = payload.amount;
  if (!amount || typeof amount !== "object" || !("value" in amount)) return null;
  const value = amount.value;
  if (typeof value !== "string") return null;
  try {
    return usdToCents(value);
  } catch {
    return null;
  }
}

function money(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) return "USD $0.00";
  return "USD $" + centsToUsd(cents);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
