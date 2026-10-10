import { PayPalApiError } from "@/lib/paypal/client";
import type { PayPalOrder } from "@/lib/paypal/schema";
import type { LedgerEventInput } from "@/lib/ledger/schema";

export function isDefinitivePayPalRejection(error: unknown): boolean {
  return error instanceof PayPalApiError && error.status >= 400 && error.status < 500;
}

export function reportedCaptureAmount(order: PayPalOrder | undefined): { currencyCode: string; value: string } | null {
  const amount = order?.purchase_units?.[0]?.payments?.captures?.[0]?.amount;
  if (!amount?.currency_code || !amount.value) {
    return null;
  }
  return { currencyCode: amount.currency_code, value: amount.value };
}

export async function settleUncertainCharge(input: {
  error: unknown;
  order?: PayPalOrder;
  mandateId: string;
  reservationId: string;
  requestKey: string;
  release: () => Promise<void>;
  appendLedger: (event: LedgerEventInput) => Promise<unknown>;
}): Promise<void> {
  const captureAmount = reportedCaptureAmount(input.order);
  const capture = input.order?.purchase_units?.[0]?.payments?.captures?.[0];
  if (captureAmount && input.order) {
    await input.appendLedger({
      type: "paypal.order.captured",
      mandateId: input.mandateId,
      payload: {
        reservationId: input.reservationId,
        orderId: input.order.id,
        status: input.order.status,
        captureId: capture?.id ?? null,
        amount: captureAmount,
        requestKey: input.requestKey,
      },
    });
  }

  const message = input.error instanceof Error ? input.error.message : "PayPal charge failed.";
  if (!captureAmount && isDefinitivePayPalRejection(input.error)) {
    await input.release();
    await input
      .appendLedger({
        type: "paypal.order.failed",
        mandateId: input.mandateId,
        payload: {
          reservationId: input.reservationId,
          orderId: input.order?.id ?? null,
          requestKey: input.requestKey,
          message,
        },
      })
      .catch(() => undefined);
    return;
  }

  await input
    .appendLedger({
      type: "checkout.needs_reconciliation",
      mandateId: input.mandateId,
      payload: {
        reservationId: input.reservationId,
        orderId: input.order?.id ?? null,
        requestKey: input.requestKey,
        message,
      },
    })
    .catch(() => undefined);
}
