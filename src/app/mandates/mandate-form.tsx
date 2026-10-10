"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  BadgeCheck,
  Ban,
  Calendar,
  FolderOpen,
  Gavel,
  Lock,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { centsToUsd } from "@/lib/money";

type Mandate = {
  id: string;
  description: string;
  maxTotalCents: number;
  maxPerItemCents: number;
  allowedCategories: string[] | null;
  blockedMerchants: string[];
  allowedMerchants: string[] | null;
  requireFreeReturns: boolean;
  deliverBy: string | null;
  escalateAboveCents: number;
  expiresAt: string;
  status: string;
  searchQuery: string;
  needsInput: string[];
};

type DraftFields = {
  description: string;
  maxTotalCents: string;
  maxPerItemCents: string;
  anyCategory: boolean;
  allowedCategories: string[];
  blockedMerchants: string;
  allowedMerchants: string;
  requireFreeReturns: boolean;
  deliverBy: string;
  escalateAboveCents: string;
  expiresAt: string;
  searchQuery: string;
  needsInput: string[];
};

const emptyFields: DraftFields = {
  description: "",
  maxTotalCents: "",
  maxPerItemCents: "",
  anyCategory: true,
  allowedCategories: [],
  blockedMerchants: "",
  allowedMerchants: "",
  requireFreeReturns: false,
  deliverBy: "",
  escalateAboveCents: "",
  expiresAt: "",
  searchQuery: "",
  needsInput: [],
};

const presets = [
  "Buy printer paper under $20 from staples.com",
  "Refill organic dark roast whole bean coffee under $15",
  "USB-C charging cables 2-pack under $12 from anker.com",
];

const control =
  "w-full rounded-lg border border-transparent bg-[#eff4ff] px-3 py-2 text-sm outline-none focus:border-primary focus:bg-card";

export function MandateForm({ onDone }: { onDone?: () => void }) {
  const [text, setText] = useState("");
  const [mandateId, setMandateId] = useState<string | null>(null);
  const [fields, setFields] = useState<DraftFields>(emptyFields);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"parse" | "confirm" | null>(null);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [allowedDraft, setAllowedDraft] = useState("");
  const [blockedDraft, setBlockedDraft] = useState("");

  async function parseMandate() {
    setPending("parse");
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/mandates/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = (await response.json()) as { mandate?: Mandate; error?: string };
      if (!response.ok || !body.mandate) {
        setError(body.error ?? "Could not parse the mandate.");
        return;
      }
      setMandateId(body.mandate.id);
      setFields(fieldsFromMandate(body.mandate));
      setStatus("draft");
    } catch {
      setError("Could not parse the mandate.");
    } finally {
      setPending(null);
    }
  }

  async function confirmMandate() {
    if (!mandateId) {
      return;
    }
    setPending("confirm");
    setError(null);
    try {
      const response = await fetch(`/api/mandates/${mandateId}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editsFromFields(fields)),
      });
      const body = (await response.json()) as { mandate?: Mandate; error?: string };
      if (!response.ok || !body.mandate) {
        setError(body.error ?? "Could not confirm the mandate.");
        return;
      }
      setStatus(body.mandate.status);
      setFields(fieldsFromMandate(body.mandate));
      onDone?.();
    } catch {
      setError("Could not confirm the mandate.");
    } finally {
      setPending(null);
    }
  }

  const ready = mandateId !== null && canConfirm(fields) && status !== "active";
  const exposure = usdLabel(fields.maxTotalCents);

  return (
    <div className="flex flex-col gap-6 pb-28">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Gavel className="size-5 text-primary" />
            <h1 className="text-lg font-semibold tracking-tight">Create New Mandate</h1>
            <span className="rounded bg-[#00402a]/15 px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-[#005137] uppercase">
              SEC-L2 Enforced
            </span>
          </div>
          <p className="text-sm text-[#404848]">
            Define natural language intent. The deterministic engine enforces the immutable spending bounds.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2">
          <ShieldCheck className="size-4 text-primary" />
          <div>
            <p className="text-[11px] font-bold tracking-[0.06em] text-[#545f73] uppercase">Execution invariant</p>
            <p className="font-mono text-[13px] font-semibold">You confirm the rules. The AI cannot change them.</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Step>1</Step>
              <h2 className="text-lg font-semibold tracking-tight">Agent Instruction</h2>
            </div>
            <span className="font-mono text-[11px] text-[#545f73]">PROMPT_PARSE_V2</span>
          </div>
          <label className="mb-2 block text-sm text-[#404848]" htmlFor="intent-input">
            Describe what the agent may buy, in plain English.
          </label>
          <textarea
            id="intent-input"
            className={`${control} min-h-28 text-base`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="e.g. Purchase office equipment..."
          />
          <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-[#545f73]">
            <span className="size-1.5 rounded-full bg-[#00402a]" />
            {text.length} chars
          </p>

          <p className="mt-5 mb-2 text-[11px] font-bold tracking-[0.06em] text-[#545f73] uppercase">
            Deterministic reference presets
          </p>
          <div className="flex flex-col gap-2">
            {presets.map((preset) => {
              const selected = text === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  className={`rounded-lg px-3 py-2 text-left font-mono text-[11px] ${selected ? "bg-[#dce9ff] font-semibold text-foreground" : "bg-[#eff4ff] text-[#404848] hover:bg-[#e5eeff]"}`}
                  onClick={() => setText(preset)}
                >
                  {selected ? <BadgeCheck className="mr-1 inline size-3.5 text-[#059669]" /> : null}
                  {preset}
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button type="button" className="h-10 rounded-lg px-4" onClick={() => void parseMandate()} disabled={pending !== null || text.trim().length === 0}>
              <Sparkles className="size-4" />
              {pending === "parse" ? "Parsing…" : "Parse intent with AI"}
            </Button>
            {mandateId ? (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#005137]">
                <BadgeCheck className="size-4" />
                Draft saved
              </span>
            ) : null}
          </div>
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

          <div className="mt-6 rounded-2xl bg-[#f1f5f9] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold tracking-[0.06em] text-[#545f73] uppercase">Semantic parse trace</p>
              <span className="font-mono text-[11px] text-[#404848]">{mandateId ? `draft ${mandateId.slice(0, 8)}` : "waiting for parse"}</span>
            </div>
            <dl className="space-y-1.5 font-mono text-[13px]">
              <Trace label="TARGET" value={fields.searchQuery || "—"} />
              <Trace label="CEILING" value={exposure ?? "—"} />
              <Trace label="DOMAIN" value={domainTrace(fields)} />
              <Trace label="MUTABILITY" value="Read-only to the model" />
            </dl>
            <div className="mt-4 flex items-start gap-2 text-[#404848]">
              <Shield className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="text-[11px] font-bold tracking-[0.06em] text-[#545f73] uppercase">Deterministic policy lock</p>
                <p className="text-xs">Rules are compiled into the policy engine. The model cannot spend past them.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Step>2</Step>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">The AI&apos;s reading and deterministic contract</h2>
                <p className="text-xs text-[#404848]">Verify or tighten the parameters before you confirm.</p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] font-bold text-primary">
              <Lock className="size-3.5" />
              Immutable on sign
            </span>
          </div>

          <Field label="Description">
            <textarea
              className={`${control} min-h-16`}
              value={fields.description}
              disabled={!mandateId}
              onChange={(event) => update(setFields, "description", event.target.value)}
            />
          </Field>
          <div className="mt-4">
          <Field label="Normalized catalog search query">
            <div className="flex items-center rounded-lg border border-transparent bg-[#eff4ff] px-3 focus-within:border-primary focus-within:bg-card">
              <Search className="size-4 text-[#545f73]" />
              <input
                className="w-full bg-transparent py-2 pl-2 font-mono text-[13px] outline-none"
                value={fields.searchQuery}
                onChange={(event) => update(setFields, "searchQuery", event.target.value)}
                disabled={!mandateId}
              />
            </div>
          </Field>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <UsdAmount label="Total budget cap" hint="Strict ceiling" cents={fields.maxTotalCents} disabled={!mandateId} onCents={(value) => update(setFields, "maxTotalCents", value)} />
            <UsdAmount label="Per-item unit cap" hint="No single SKU above this" cents={fields.maxPerItemCents} disabled={!mandateId} onCents={(value) => update(setFields, "maxPerItemCents", value)} />
            <UsdAmount label="Escalate above" hint="A person must approve" cents={fields.escalateAboveCents} disabled={!mandateId} onCents={(value) => update(setFields, "escalateAboveCents", value)} />
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold tracking-[0.06em] text-[#545f73] uppercase">Allowed categories</p>
              <label className="flex items-center gap-2 text-xs text-[#404848]">
                <input
                  type="checkbox"
                  checked={fields.anyCategory}
                  disabled={!mandateId}
                  onChange={(event) => update(setFields, "anyCategory", event.target.checked)}
                />
                Any category
              </label>
            </div>
            {fields.anyCategory ? (
              <p className="text-xs text-[#545f73]">No category restriction.</p>
            ) : (
              <ChipRow>
                {fields.allowedCategories.map((slug) => (
                  <Chip key={slug} onRemove={() => removeCategory(setFields, slug)}>
                    <FolderOpen className="size-3.5 text-[#545f73]" />
                    {slug}
                  </Chip>
                ))}
                <AddChip
                  label="Add category"
                  value={categoryDraft}
                  disabled={!mandateId}
                  onChange={setCategoryDraft}
                  onAdd={() => {
                    const slug = categoryDraft.trim();
                    if (!slug || fields.allowedCategories.includes(slug)) {
                      return;
                    }
                    setFields((current) => ({ ...current, allowedCategories: [...current.allowedCategories, slug] }));
                    setCategoryDraft("");
                  }}
                />
              </ChipRow>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <DomainList
              title="Allowed merchants"
              tone="allow"
              badge="Strict whitelist"
              values={splitList(fields.allowedMerchants)}
              draft={allowedDraft}
              disabled={!mandateId}
              addLabel="Add authorized domain"
              onDraft={setAllowedDraft}
              onAdd={() => {
                setFields((current) => ({ ...current, allowedMerchants: addToken(current.allowedMerchants, allowedDraft) }));
                setAllowedDraft("");
              }}
              onRemove={(value) => setFields((current) => ({ ...current, allowedMerchants: removeToken(current.allowedMerchants, value) }))}
            />
            <DomainList
              title="Blocked merchants"
              tone="block"
              badge="Auto veto"
              values={splitList(fields.blockedMerchants)}
              draft={blockedDraft}
              disabled={!mandateId}
              addLabel="Add blocked domain"
              onDraft={setBlockedDraft}
              onAdd={() => {
                setFields((current) => ({ ...current, blockedMerchants: addToken(current.blockedMerchants, blockedDraft) }));
                setBlockedDraft("");
              }}
              onRemove={(value) => setFields((current) => ({ ...current, blockedMerchants: removeToken(current.blockedMerchants, value) }))}
            />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-[#eff4ff] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Free returns verified only</p>
                  <p className="text-xs text-[#404848]">Reject items without a free-return flag.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="Free returns verified only"
                  aria-checked={fields.requireFreeReturns}
                  disabled={!mandateId}
                  className={`flex h-6 w-12 shrink-0 items-center rounded-full p-0.5 ${fields.requireFreeReturns ? "justify-end bg-primary" : "justify-start bg-[#cbd5e1]"}`}
                  onClick={() => update(setFields, "requireFreeReturns", !fields.requireFreeReturns)}
                >
                  <span className="size-5 rounded-full bg-card shadow-sm" />
                </button>
              </div>
            </div>
            <div className="rounded-2xl bg-[#eff4ff] p-4">
              <p className="text-sm font-semibold">Deliver-by deadline</p>
              <p className="mb-2 text-xs text-[#404848]">Empty means no delivery cutoff.</p>
              <label className="flex items-center gap-2">
                <Calendar className="size-4 text-primary" />
                <input
                  type="date"
                  aria-label="Deliver by"
                  className="w-full rounded bg-card px-2 py-1 font-mono text-[13px] outline-none"
                  value={fields.deliverBy}
                  disabled={!mandateId}
                  onChange={(event) => update(setFields, "deliverBy", event.target.value)}
                />
              </label>
            </div>
          </div>

          {mandateId ? (
            <div className={`mt-5 flex items-start gap-3 rounded-2xl p-4 ${ready ? "bg-[#ecfdf5]" : "bg-[#fffbeb]"}`} role="status">
              <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-primary-foreground ${ready ? "bg-primary" : "bg-[#d97706]"}`}>
                <BadgeCheck className="size-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{ready ? "Contract valid and constrained" : "This mandate still needs input"}</p>
                  <span className="rounded bg-[#00402a]/15 px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#005137] uppercase">
                    {ready ? "Ready to confirm" : status ?? "draft"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#404848]">
                  {ready
                    ? `Max exposure ${exposure}. Confirm locks these rules. The model cannot change them.`
                    : missingCopy(fields)}
                </p>
                {fields.expiresAt ? (
                  <p className="mt-1 font-mono text-[11px] text-[#545f73]">Expires {fields.expiresAt}. Confirm cannot change the expiry.</p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-5 text-sm text-[#545f73]">Parse an instruction to edit the contract.</p>
          )}
        </section>
      </div>

      <div className="sticky bottom-4 z-30 flex flex-col items-stretch justify-between gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-md backdrop-blur sm:flex-row sm:items-center">
        <p className="font-mono text-[13px] font-semibold">
          {mandateId ? "1 draft saved" : "No draft yet"}
          {exposure ? <> · Max exposure <span className="text-primary">{exposure}</span></> : null}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" className="h-10 rounded-lg bg-[#f1f5f9] px-4" onClick={() => onDone?.()}>
            Back to mandates
          </Button>
          <Button type="button" className="h-10 rounded-lg px-4" disabled={!ready || pending !== null} onClick={() => void confirmMandate()}>
            <BadgeCheck className="size-4" />
            {pending === "confirm" ? "Confirming…" : status === "active" ? "Confirmed" : "Confirm and activate mandate"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Step({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-[11px] font-bold text-primary-foreground">
      {children}
    </span>
  );
}

function Trace({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-[#545f73]">{label}</dt>
      <dd className="font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold tracking-[0.06em] text-[#545f73] uppercase">{label}</span>
      {children}
    </label>
  );
}

function UsdAmount({
  label,
  hint,
  cents,
  disabled,
  onCents,
}: {
  label: string;
  hint: string;
  cents: string;
  disabled: boolean;
  onCents: (value: string) => void;
}) {
  const [text, setText] = useState(displayCents(cents));
  useEffect(() => {
    setText(displayCents(cents));
  }, [cents]);

  return (
    <label className="rounded-2xl bg-[#eff4ff] p-3">
      <span className="text-[11px] font-bold tracking-[0.06em] text-[#545f73] uppercase">{label}</span>
      <span className="mt-2 flex items-baseline gap-1 font-mono text-lg font-semibold">
        <span className="text-[#545f73]">USD $</span>
        <input
          className="w-full bg-transparent outline-none"
          inputMode="decimal"
          disabled={disabled}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => {
            const next = dollarsToCentsField(text);
            if (next === null) {
              setText(displayCents(cents));
              return;
            }
            onCents(next);
            setText(displayCents(next));
          }}
        />
      </span>
      <span className="mt-1 block font-mono text-[11px] text-[#545f73]">{hint}</span>
    </label>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function Chip({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-[#f1f5f9] px-2.5 py-1 font-mono text-[11px]">
      {children}
      <button type="button" className="text-[#545f73] hover:text-destructive" onClick={onRemove}>
        <X className="size-3.5" />
        <span className="sr-only">Remove</span>
      </button>
    </span>
  );
}

function AddChip({
  label,
  value,
  disabled,
  onChange,
  onAdd,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onAdd: () => void;
}) {
  return (
    <form
      className="inline-flex items-center gap-1 rounded-lg bg-[#f1f5f9] px-2 py-1"
      onSubmit={(event) => {
        event.preventDefault();
        onAdd();
      }}
    >
      <Plus className="size-3.5" />
      <input
        className="w-28 bg-transparent font-mono text-[11px] outline-none"
        placeholder={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </form>
  );
}

function DomainList({
  title,
  tone,
  badge,
  values,
  draft,
  disabled,
  addLabel,
  onDraft,
  onAdd,
  onRemove,
}: {
  title: string;
  tone: "allow" | "block";
  badge: string;
  values: string[];
  draft: string;
  disabled: boolean;
  addLabel: string;
  onDraft: (value: string) => void;
  onAdd: () => void;
  onRemove: (value: string) => void;
}) {
  const blocked = tone === "block";
  return (
    <div className={`rounded-2xl p-3 ${blocked ? "bg-[#fef2f2]" : "bg-[#ecfdf5]"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={`flex items-center gap-1 text-[11px] font-bold tracking-[0.06em] uppercase ${blocked ? "text-[#991b1b]" : "text-[#065f46]"}`}>
          {blocked ? <Ban className="size-3.5" /> : <BadgeCheck className="size-3.5" />}
          {title}
        </p>
        <span className="font-mono text-[11px] text-[#545f73]">{badge}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {values.length === 0 ? <p className="font-mono text-[11px] text-[#545f73]">None</p> : null}
        {values.map((value) => (
          <span key={value} className="inline-flex items-center justify-between gap-2 font-mono text-[13px]">
            <span className={blocked ? "text-[#545f73] line-through" : "font-semibold"}>
              <Lock className="mr-1 inline size-3.5" />
              {value}
            </span>
            <button type="button" onClick={() => onRemove(value)} disabled={disabled}>
              <X className="size-3.5 text-[#545f73]" />
              <span className="sr-only">Remove {value}</span>
            </button>
          </span>
        ))}
        <AddChip label={addLabel} value={draft} disabled={disabled} onChange={onDraft} onAdd={onAdd} />
      </div>
    </div>
  );
}

function update<K extends keyof DraftFields>(
  setFields: (updater: (current: DraftFields) => DraftFields) => void,
  key: K,
  value: DraftFields[K],
) {
  setFields((current) => ({ ...current, [key]: value }));
}

function fieldsFromMandate(mandate: Mandate): DraftFields {
  return {
    description: mandate.description,
    maxTotalCents: String(mandate.maxTotalCents),
    maxPerItemCents: String(mandate.maxPerItemCents),
    anyCategory: mandate.allowedCategories === null,
    allowedCategories: mandate.allowedCategories ?? [],
    blockedMerchants: mandate.blockedMerchants.join(", "),
    allowedMerchants: (mandate.allowedMerchants ?? []).join(", "),
    requireFreeReturns: mandate.requireFreeReturns,
    deliverBy: mandate.deliverBy ?? "",
    escalateAboveCents: String(mandate.escalateAboveCents),
    expiresAt: mandate.expiresAt,
    searchQuery: mandate.searchQuery,
    needsInput: mandate.needsInput,
  };
}

function editsFromFields(fields: DraftFields) {
  return {
    description: fields.description,
    maxTotalCents: Number(fields.maxTotalCents),
    maxPerItemCents: Number(fields.maxPerItemCents),
    allowedCategories: fields.anyCategory ? null : fields.allowedCategories,
    blockedMerchants: splitList(fields.blockedMerchants),
    allowedMerchants: splitList(fields.allowedMerchants).length === 0 ? null : splitList(fields.allowedMerchants),
    requireFreeReturns: fields.requireFreeReturns,
    deliverBy: fields.deliverBy.trim() === "" ? null : fields.deliverBy.trim(),
    escalateAboveCents: Number(fields.escalateAboveCents),
    searchQuery: fields.searchQuery.trim(),
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function addToken(list: string, value: string): string {
  const next = splitList(list);
  const token = value.trim();
  if (token && !next.includes(token)) {
    next.push(token);
  }
  return next.join(", ");
}

function removeToken(list: string, value: string): string {
  return splitList(list)
    .filter((item) => item !== value)
    .join(", ");
}

function removeCategory(
  setFields: (updater: (current: DraftFields) => DraftFields) => void,
  slug: string,
) {
  setFields((current) => ({
    ...current,
    allowedCategories: current.allowedCategories.filter((item) => item !== slug),
  }));
}

function canConfirm(fields: DraftFields): boolean {
  const maxTotal = Number(fields.maxTotalCents);
  return Number.isInteger(maxTotal) && maxTotal > 0 && fields.searchQuery.trim().length > 0;
}

function visibleNeeds(fields: DraftFields): string[] {
  const maxTotal = Number(fields.maxTotalCents);
  const budgetFilled = Number.isInteger(maxTotal) && maxTotal > 0;
  return fields.needsInput.filter((need) => need !== "budget" || !budgetFilled);
}

function missingCopy(fields: DraftFields): string {
  const needs = visibleNeeds(fields);
  if (needs.length > 0) {
    return `Missing: ${needs.join(", ")}.`;
  }
  if (!canConfirm(fields)) {
    return "Enter a max total above 0 and a search query to confirm.";
  }
  return "Review the contract, then confirm.";
}

function usdLabel(cents: string): string | null {
  const amount = Number(cents);
  if (!Number.isInteger(amount) || amount < 0 || cents === "") {
    return null;
  }
  return `USD $${centsToUsd(amount)}`;
}

function displayCents(cents: string): string {
  return usdLabel(cents)?.replace("USD $", "") ?? "";
}

function dollarsToCentsField(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return "";
  }
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) {
    return null;
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) {
    return null;
  }
  return String(cents);
}

function domainTrace(fields: DraftFields): string {
  const allowed = splitList(fields.allowedMerchants);
  if (allowed.length > 0) {
    return allowed.join(", ");
  }
  const blocked = splitList(fields.blockedMerchants);
  if (blocked.length > 0) {
    return `any, except ${blocked.join(", ")}`;
  }
  return "any merchant";
}
