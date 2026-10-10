import { usdToCents } from "@/lib/money";
import type { PayPalOrder } from "@/lib/paypal/schema";

export class CheckoutAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutAmountError";
  }
}

export function assertPayPalCharge(order: PayPalOrder, approvedCents: number): void {
  if (order.status !== "COMPLETED") {
    throw new CheckoutAmountError(`PayPal order ${order.id} status is ${order.status}.`);
  }

  const unit = order.purchase_units?.[0];
  const orderCents = moneyCents(unit?.amount, "order", order.id);
  const capture = unit?.payments?.captures?.[0];
  if (!capture?.amount) {
    throw new CheckoutAmountError(`PayPal order ${order.id} is missing a capture amount.`);
  }
  const captureCents = moneyCents(capture.amount, "capture", order.id);
  if (orderCents !== approvedCents || captureCents !== approvedCents) {
    throw new CheckoutAmountError(
      `PayPal amounts do not match the approved total of ${approvedCents} cents. Order amount is ${orderCents} cents and capture amount is ${captureCents} cents.`,
    );
  }
}

function moneyCents(
  amount: { currency_code: string; value: string } | undefined,
  label: string,
  orderId: string,
): number {
  if (!amount) {
    throw new CheckoutAmountError(`PayPal order ${orderId} is missing an ${label} amount.`);
  }
  if (amount.currency_code !== "USD") {
    throw new CheckoutAmountError(`PayPal order ${orderId} ${label} currency is ${amount.currency_code}.`);
  }
  try {
    return usdToCents(amount.value);
  } catch {
    throw new CheckoutAmountError(`PayPal order ${orderId} ${label} amount "${amount.value}" is not integer cents.`);
  }
}
