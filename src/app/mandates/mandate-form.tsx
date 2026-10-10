"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

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
};

type DraftFields = {
  description: string;
  maxTotalCents: string;
  maxPerItemCents: string;
  anyCategory: boolean;
  allowedCategories: string;
  blockedMerchants: string;
  allowedMerchants: string;
  requireFreeReturns: boolean;
  deliverBy: string;
  escalateAboveCents: string;
  expiresAt: string;
};

const emptyFields: DraftFields = {
  description: "",
  maxTotalCents: "",
  maxPerItemCents: "",
  anyCategory: true,
  allowedCategories: "",
  blockedMerchants: "",
  allowedMerchants: "",
  requireFreeReturns: false,
  deliverBy: "",
  escalateAboveCents: "",
  expiresAt: "",
};

export function MandateForm() {
  const [text, setText] = useState("");
  const [mandateId, setMandateId] = useState<string | null>(null);
  const [fields, setFields] = useState<DraftFields>(emptyFields);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"parse" | "confirm" | null>(null);

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
    } catch {
      setError("Could not confirm the mandate.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <label className="flex flex-col gap-2 text-sm">
        Spending rules
        <textarea
          className="min-h-32 rounded-lg border border-border bg-background px-3 py-2"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Buy office supplies under $50, free returns, deliver by next Friday."
        />
      </label>
      <div>
        <Button type="button" onClick={parseMandate} disabled={pending !== null || text.trim().length === 0}>
          {pending === "parse" ? "Parsing…" : "Parse"}
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {mandateId ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void confirmMandate();
          }}
        >
          <p className="text-sm text-muted-foreground">
            Draft {mandateId}
            {status ? ` · ${status}` : ""}
          </p>
          <Field label="Description">
            <textarea
              className="min-h-20 rounded-lg border border-border bg-background px-3 py-2"
              value={fields.description}
              onChange={(event) => update(setFields, "description", event.target.value)}
            />
          </Field>
          <Field label="Max total (USD cents)">
            <input
              className="rounded-lg border border-border bg-background px-3 py-2"
              inputMode="numeric"
              value={fields.maxTotalCents}
              onChange={(event) => update(setFields, "maxTotalCents", event.target.value)}
            />
          </Field>
          <Field label="Max per item (USD cents)">
            <input
              className="rounded-lg border border-border bg-background px-3 py-2"
              inputMode="numeric"
              value={fields.maxPerItemCents}
              onChange={(event) => update(setFields, "maxPerItemCents", event.target.value)}
            />
          </Field>
          <Field label="Escalate above (USD cents)">
            <input
              className="rounded-lg border border-border bg-background px-3 py-2"
              inputMode="numeric"
              value={fields.escalateAboveCents}
              onChange={(event) => update(setFields, "escalateAboveCents", event.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fields.anyCategory}
              onChange={(event) => update(setFields, "anyCategory", event.target.checked)}
            />
            Allow any category
          </label>
          {fields.anyCategory ? null : (
            <Field label="Allowed categories (comma-separated, empty means none)">
              <input
                className="rounded-lg border border-border bg-background px-3 py-2"
                value={fields.allowedCategories}
                onChange={(event) => update(setFields, "allowedCategories", event.target.value)}
              />
            </Field>
          )}
          <Field label="Blocked merchants (comma-separated)">
            <input
              className="rounded-lg border border-border bg-background px-3 py-2"
              value={fields.blockedMerchants}
              onChange={(event) => update(setFields, "blockedMerchants", event.target.value)}
            />
          </Field>
          <Field label="Allowed merchants (comma-separated, empty means any)">
            <input
              className="rounded-lg border border-border bg-background px-3 py-2"
              value={fields.allowedMerchants}
              onChange={(event) => update(setFields, "allowedMerchants", event.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fields.requireFreeReturns}
              onChange={(event) => update(setFields, "requireFreeReturns", event.target.checked)}
            />
            Require free returns
          </label>
          <Field label="Deliver by (YYYY-MM-DD, empty means none)">
            <input
              className="rounded-lg border border-border bg-background px-3 py-2"
              value={fields.deliverBy}
              onChange={(event) => update(setFields, "deliverBy", event.target.value)}
            />
          </Field>
          <p className="text-sm">
            Expires at {fields.expiresAt}. Confirm cannot change the expiry.
          </p>
          <div>
            <Button type="submit" disabled={pending !== null || status === "active"}>
              {pending === "confirm" ? "Confirming…" : status === "active" ? "Confirmed" : "Confirm"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      {label}
      {children}
    </label>
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
    allowedCategories: (mandate.allowedCategories ?? []).join(", "),
    blockedMerchants: mandate.blockedMerchants.join(", "),
    allowedMerchants: (mandate.allowedMerchants ?? []).join(", "),
    requireFreeReturns: mandate.requireFreeReturns,
    deliverBy: mandate.deliverBy ?? "",
    escalateAboveCents: String(mandate.escalateAboveCents),
    expiresAt: mandate.expiresAt,
  };
}

function editsFromFields(fields: DraftFields) {
  return {
    description: fields.description,
    maxTotalCents: Number(fields.maxTotalCents),
    maxPerItemCents: Number(fields.maxPerItemCents),
    allowedCategories: fields.anyCategory ? null : splitList(fields.allowedCategories),
    blockedMerchants: splitList(fields.blockedMerchants),
    allowedMerchants: splitList(fields.allowedMerchants).length === 0 ? null : splitList(fields.allowedMerchants),
    requireFreeReturns: fields.requireFreeReturns,
    deliverBy: fields.deliverBy.trim() === "" ? null : fields.deliverBy.trim(),
    escalateAboveCents: Number(fields.escalateAboveCents),
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
