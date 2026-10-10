import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mandates } from "@/db/schema";
import { secretFingerprint } from "@/lib/paypal/fingerprint";
import { latestActivePaymentMethod } from "@/lib/paypal/payment-methods";
import { mandateSchema, type Mandate } from "@/lib/policy/schema";
import { SpendLookupError } from "@/lib/shopping/spend";

export type MandateBalance = Mandate & {
  spentCents: number;
  heldCents: number;
  reconciliationCount: number;
  remainingCents: number;
};

export type MandateBalanceSnapshot = {
  mandates: MandateBalance[];
  unlinkedCapturedCents: number;
  missingMandateCapturedCents: number;
  missingMandateHeldCents: number;
  missingMandateHoldCount: number;
  missingMandateReconciliationCount: number;
  wallet: { linked: boolean; fingerprint: string | null };
};

export function mandateBalance(): Promise<MandateBalanceSnapshot>;
export function mandateBalance(id: string): Promise<MandateBalance | null>;
export async function mandateBalance(id?: string): Promise<MandateBalanceSnapshot | MandateBalance | null> {
  if (id !== undefined) {
    const row = await getDb().select().from(mandates).where(sql`${mandates.id} = ${id}`).limit(1);
    if (!row[0]) return null;
    const totals = await aggregateMandateBalances(id);
    return balanceFor(mandateSchema.parse({
      ...row[0],
      expiresAt: row[0].expiresAt.toISOString(),
    }), totals[0]);
  }
  return loadBalanceSnapshot();
}

export async function listMandateBalances(): Promise<MandateBalance[]> {
  return (await mandateBalance()).mandates;
}

export async function walletStatusFromDatabase(): Promise<{ linked: boolean; fingerprint: string | null }> {
  const saved = await latestActivePaymentMethod();
  if (!saved) return { linked: false, fingerprint: null };
  return { linked: true, fingerprint: secretFingerprint(saved.vaultId) };
}

export async function unlinkedCapturedCents(): Promise<number> {
  const rows = await getDb().execute<{ cents: string | null }>(sql`
    WITH captures AS (
      SELECT DISTINCT ON (COALESCE(payload->>'orderId', id::text)) payload
      FROM ledger_events
      WHERE mandate_id IS NULL AND type = 'paypal.order.captured'
      ORDER BY COALESCE(payload->>'orderId', id::text), created_at
    )
    SELECT COALESCE(SUM(
      CASE WHEN (payload->'amount'->>'currencyCode') = 'USD'
        AND (payload->'amount'->>'value') ~ '^[0-9]+\\.[0-9]{2}$'
      THEN ((split_part(payload->'amount'->>'value', '.', 1)::numeric * 100)
        + split_part(payload->'amount'->>'value', '.', 2)::numeric)
      ELSE 0 END
    ), 0)::text AS cents FROM captures
  `);
  return Number(rows[0]?.cents ?? 0);
}

async function loadBalanceSnapshot(): Promise<MandateBalanceSnapshot> {
  const rows = await getDb().execute<{
    mandate_id: string | null;
    description: string | null;
    max_total_cents: number | null;
    max_per_item_cents: number | null;
    allowed_categories: string[] | null;
    blocked_merchants: string[] | null;
    allowed_merchants: string[] | null;
    require_free_returns: boolean | null;
    deliver_by: string | null;
    escalate_above_cents: number | null;
    expires_at: Date | string | null;
    status: string | null;
    search_query: string | null;
    needs_input: string[] | null;
    spent_cents: string;
    held_cents: string;
    reconciliation_count: string;
    invalid_capture_count: string;
    unlinked_cents: string;
    missing_mandate_spent_cents: string;
    missing_mandate_held_cents: string;
    missing_mandate_hold_count: string;
    missing_mandate_reconciliation_count: string;
    missing_mandate_invalid_capture_count: string;
    wallet_vault_id: string | null;
  }>(sql`
    WITH captures AS (
      SELECT DISTINCT ON (mandate_id, COALESCE(payload->>'orderId', id::text)) mandate_id,
        payload->'amount'->>'value' AS amount,
        payload->'amount'->>'currencyCode' AS currency
      FROM ledger_events WHERE type = 'paypal.order.captured' AND mandate_id IS NOT NULL
      ORDER BY mandate_id, COALESCE(payload->>'orderId', id::text), created_at
    ), reservations AS (
      SELECT DISTINCT ON (mandate_id, COALESCE(payload->>'reservationId', id::text)) mandate_id,
        payload->>'reservationId' AS reservation_id,
        (payload->>'amountCents')::numeric AS amount_cents
      FROM ledger_events WHERE type = 'checkout.reserved' AND mandate_id IS NOT NULL
      ORDER BY mandate_id, COALESCE(payload->>'reservationId', id::text), created_at
    ), unlinked_captures AS (
      SELECT DISTINCT ON (COALESCE(payload->>'orderId', id::text)) payload
      FROM ledger_events WHERE mandate_id IS NULL AND type = 'paypal.order.captured'
      ORDER BY COALESCE(payload->>'orderId', id::text), created_at
    ), reconciliation AS (
      SELECT mandate_id, COUNT(*)::integer AS count
      FROM ledger_events WHERE type = 'checkout.needs_reconciliation' AND mandate_id IS NOT NULL
      GROUP BY mandate_id
    )
    SELECT m.id AS mandate_id, m.description, m.max_total_cents, m.max_per_item_cents,
      m.allowed_categories, m.blocked_merchants, m.allowed_merchants, m.require_free_returns,
      m.deliver_by, m.escalate_above_cents, m.expires_at, m.status, m.search_query, m.needs_input,
      COALESCE((SELECT SUM(CASE WHEN currency = 'USD' AND amount ~ '^[0-9]+\\.[0-9]{2}$'
        THEN split_part(amount, '.', 1)::numeric * 100 + split_part(amount, '.', 2)::numeric ELSE 0 END)
        FROM captures c WHERE c.mandate_id = m.id::text), 0)::text AS spent_cents,
      COALESCE((SELECT SUM(r.amount_cents) FROM reservations r WHERE r.mandate_id = m.id::text
        AND NOT EXISTS (SELECT 1 FROM ledger_events e WHERE e.mandate_id = m.id::text
          AND e.type IN ('checkout.released', 'paypal.order.captured')
          AND e.payload->>'reservationId' = r.reservation_id)), 0)::text AS held_cents,
      COALESCE((SELECT count FROM reconciliation x WHERE x.mandate_id = m.id::text), 0)::text AS reconciliation_count,
      (SELECT COUNT(*) FROM captures c WHERE c.mandate_id = m.id::text
        AND (c.currency IS DISTINCT FROM 'USD' OR c.amount IS NULL OR c.amount !~ '^[0-9]+\\.[0-9]{2}$'))::text AS invalid_capture_count,
      COALESCE((SELECT SUM(CASE WHEN payload->'amount'->>'currencyCode' = 'USD'
        AND payload->'amount'->>'value' ~ '^[0-9]+\\.[0-9]{2}$'
        THEN split_part(payload->'amount'->>'value', '.', 1)::numeric * 100
          + split_part(payload->'amount'->>'value', '.', 2)::numeric ELSE 0 END)
        FROM unlinked_captures), 0)::text AS unlinked_cents,
      COALESCE((SELECT SUM(CASE WHEN c.currency = 'USD' AND c.amount ~ '^[0-9]+\\.[0-9]{2}$'
        THEN split_part(c.amount, '.', 1)::numeric * 100 + split_part(c.amount, '.', 2)::numeric ELSE 0 END)
        FROM captures c WHERE NOT EXISTS (SELECT 1 FROM mandates old_m WHERE old_m.id::text = c.mandate_id)), 0)::text AS missing_mandate_spent_cents,
      COALESCE((SELECT SUM(r.amount_cents) FROM reservations r
        WHERE NOT EXISTS (SELECT 1 FROM mandates old_m WHERE old_m.id::text = r.mandate_id)
          AND NOT EXISTS (SELECT 1 FROM ledger_events e WHERE e.mandate_id = r.mandate_id
            AND e.type IN ('checkout.released', 'paypal.order.captured')
            AND e.payload->>'reservationId' = r.reservation_id)), 0)::text AS missing_mandate_held_cents,
      (SELECT COUNT(*) FROM reservations r
        WHERE NOT EXISTS (SELECT 1 FROM mandates old_m WHERE old_m.id::text = r.mandate_id)
          AND NOT EXISTS (SELECT 1 FROM ledger_events e WHERE e.mandate_id = r.mandate_id
            AND e.type IN ('checkout.released', 'paypal.order.captured')
            AND e.payload->>'reservationId' = r.reservation_id))::text AS missing_mandate_hold_count,
      (SELECT COUNT(*) FROM ledger_events x WHERE x.type = 'checkout.needs_reconciliation'
        AND x.mandate_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM mandates old_m WHERE old_m.id::text = x.mandate_id))::text AS missing_mandate_reconciliation_count,
      (SELECT COUNT(*) FROM captures c WHERE NOT EXISTS (SELECT 1 FROM mandates old_m WHERE old_m.id::text = c.mandate_id)
        AND (c.currency IS DISTINCT FROM 'USD' OR c.amount IS NULL OR c.amount !~ '^[0-9]+\\.[0-9]{2}$'))::text AS missing_mandate_invalid_capture_count,
      (SELECT paypal_vault_id FROM payment_methods WHERE status = 'active'
        ORDER BY created_at DESC LIMIT 1) AS wallet_vault_id
    FROM mandates m ORDER BY m.created_at DESC
  `);
  if (rows.length === 0) {
    const [unlinkedTotal, wallet] = await Promise.all([unlinkedCapturedCents(), walletStatusFromDatabase()]);
    return { mandates: [], unlinkedCapturedCents: unlinkedTotal, missingMandateCapturedCents: 0, missingMandateHeldCents: 0, missingMandateHoldCount: 0, missingMandateReconciliationCount: 0, wallet };
  }

  const first = rows[0];
  const balances = rows.map((row) => {
    if (!row.mandate_id || !row.description || !row.expires_at) {
      throw new SpendLookupError("A mandate row is incomplete.");
    }
    const mandate = mandateSchema.parse({
      id: row.mandate_id,
      description: row.description,
      maxTotalCents: row.max_total_cents,
      maxPerItemCents: row.max_per_item_cents,
      allowedCategories: row.allowed_categories,
      blockedMerchants: row.blocked_merchants,
      allowedMerchants: row.allowed_merchants,
      requireFreeReturns: row.require_free_returns,
      deliverBy: row.deliver_by,
      escalateAboveCents: row.escalate_above_cents,
      expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : new Date(row.expires_at).toISOString(),
      status: row.status,
      searchQuery: row.search_query,
      needsInput: row.needs_input,
    });
    return balanceFor(mandate, {
      mandateId: row.mandate_id,
      spentCents: Number(row.spent_cents),
      heldCents: Number(row.held_cents),
      reconciliationCount: Number(row.reconciliation_count),
      invalidCaptureCount: Number(row.invalid_capture_count),
    });
  });
  const unlinkedTotal = Number(first.unlinked_cents);
  const missingMandateCapturedCents = Number(first.missing_mandate_spent_cents);
  const missingMandateHeldCents = Number(first.missing_mandate_held_cents);
  const missingMandateHoldCount = Number(first.missing_mandate_hold_count);
  const missingMandateReconciliationCount = Number(first.missing_mandate_reconciliation_count);
  if (Number(first.missing_mandate_invalid_capture_count) > 0) {
    throw new SpendLookupError("A capture for a missing mandate has a missing, invalid, or non-USD amount.");
  }
  if (![unlinkedTotal, missingMandateCapturedCents, missingMandateHeldCents, missingMandateHoldCount, missingMandateReconciliationCount].every(Number.isSafeInteger)
    || unlinkedTotal < 0 || missingMandateCapturedCents < 0 || missingMandateHeldCents < 0 || missingMandateHoldCount < 0 || missingMandateReconciliationCount < 0) {
    throw new SpendLookupError("Unlinked sandbox captures exceed the safe integer range in cents.");
  }
  return {
    mandates: balances,
    unlinkedCapturedCents: unlinkedTotal,
    missingMandateCapturedCents,
    missingMandateHeldCents,
    missingMandateHoldCount,
    missingMandateReconciliationCount,
    wallet: first.wallet_vault_id
      ? { linked: true, fingerprint: secretFingerprint(first.wallet_vault_id) }
      : { linked: false, fingerprint: null },
  };
}

type Totals = { mandateId: string; spentCents: number; heldCents: number; reconciliationCount: number; invalidCaptureCount: number };

async function aggregateMandateBalances(mandateId?: string): Promise<Totals[]> {
  const rows = await getDb().execute<{
    mandate_id: string; spent_cents: string; held_cents: string; reconciliation_count: string;
    invalid_capture_count: string;
  }>(sql`
    WITH captures AS (
      SELECT DISTINCT ON (mandate_id, COALESCE(payload->>'orderId', id::text)) mandate_id,
        payload->'amount'->>'value' AS amount,
        payload->'amount'->>'currencyCode' AS currency
      FROM ledger_events
      WHERE type = 'paypal.order.captured' AND mandate_id IS NOT NULL
      ORDER BY mandate_id, COALESCE(payload->>'orderId', id::text), created_at
    ), reservations AS (
      SELECT DISTINCT ON (mandate_id, COALESCE(payload->>'reservationId', id::text)) mandate_id,
        payload->>'reservationId' AS reservation_id,
        (payload->>'amountCents')::numeric AS amount_cents
      FROM ledger_events
      WHERE type = 'checkout.reserved' AND mandate_id IS NOT NULL
      ORDER BY mandate_id, COALESCE(payload->>'reservationId', id::text), created_at
    ), reconciliation AS (
      SELECT mandate_id, COUNT(*)::integer AS count
      FROM ledger_events WHERE type = 'checkout.needs_reconciliation'
        AND mandate_id IS NOT NULL GROUP BY mandate_id
    )
    SELECT m.id AS mandate_id,
      COALESCE((SELECT SUM(
        CASE WHEN currency = 'USD' AND amount ~ '^[0-9]+\\.[0-9]{2}$'
          THEN split_part(amount, '.', 1)::numeric * 100 + split_part(amount, '.', 2)::numeric
          ELSE 0 END
      ) FROM captures c WHERE c.mandate_id = m.id::text), 0)::text AS spent_cents,
      COALESCE((SELECT SUM(r.amount_cents) FROM reservations r
        WHERE r.mandate_id = m.id::text
          AND NOT EXISTS (SELECT 1 FROM ledger_events e WHERE e.mandate_id = m.id::text
            AND e.type IN ('checkout.released', 'paypal.order.captured')
            AND e.payload->>'reservationId' = r.reservation_id)), 0)::text AS held_cents,
      COALESCE((SELECT count FROM reconciliation x WHERE x.mandate_id = m.id::text), 0)::text AS reconciliation_count
      , (SELECT COUNT(*) FROM captures c WHERE c.mandate_id = m.id::text
        AND (c.currency IS DISTINCT FROM 'USD' OR c.amount IS NULL OR c.amount !~ '^[0-9]+\\.[0-9]{2}$'))::text AS invalid_capture_count
    FROM mandates m WHERE ${mandateId ? sql`m.id::text = ${mandateId}` : sql`TRUE`}
  `);
  return rows.map((row) => ({
    mandateId: row.mandate_id,
    spentCents: Number(row.spent_cents),
    heldCents: Number(row.held_cents),
    reconciliationCount: Number(row.reconciliation_count),
    invalidCaptureCount: Number(row.invalid_capture_count),
  }));
}

function balanceFor(mandate: Mandate, totals?: Totals): MandateBalance {
  if ((totals?.invalidCaptureCount ?? 0) > 0) {
    throw new SpendLookupError("A mandate capture has a missing, invalid, or non-USD amount.");
  }
  if (totals && totals.invalidCaptureCount === undefined) {
    throw new SpendLookupError("Mandate balance aggregate was incomplete.");
  }
  const spentCents = totals?.spentCents ?? 0;
  const heldCents = totals?.heldCents ?? 0;
  if (![spentCents, heldCents].every(Number.isSafeInteger)) {
    throw new SpendLookupError("Mandate balances exceed the safe integer range in cents.");
  }
  return {
    ...mandate,
    spentCents,
    heldCents,
    reconciliationCount: totals?.reconciliationCount ?? 0,
    remainingCents: mandate.maxTotalCents - spentCents - heldCents,
  };
}
