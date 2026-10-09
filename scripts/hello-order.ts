import { closeDb } from "../src/db/client";
import { appendLedgerEvent } from "../src/lib/ledger";
import { PayPalApiError, createPayPalClient } from "../src/lib/paypal/client";
import { readPayPalEnv } from "../src/lib/paypal/config";
import { captureOrder, confirmCardPayment, createOrder, getOrder, helloOrderBody } from "../src/lib/paypal/orders";
import { paypalRequestId } from "../src/lib/paypal/request-id";
import { approvalUrl, captureId, orderAmount, type PayPalOrder } from "../src/lib/paypal/schema";

const MANUAL_APPROVAL_EXIT = 2;

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Apply the migration with npm run db:migrate first.");
  }

  const paypal = readPayPalEnv();
  const client = createPayPalClient(paypal);
  const captureOrderId = readCaptureOrderId(process.argv.slice(2));

  try {
    if (captureOrderId) {
      await captureExistingOrder(client, captureOrderId);
      return;
    }

    await createConfirmAndCapture(client);
  } finally {
    await closeDb();
  }
}

async function createConfirmAndCapture(client: ReturnType<typeof createPayPalClient>) {
  let created: PayPalOrder;
  try {
    const body = helloOrderBody();
    created = await createOrder(client, body, `hello-order:create:${paypalRequestId(JSON.stringify(body))}`);
  } catch (error) {
    await recordFailure("create", null, error);
    throw error;
  }

  try {
    await appendLedgerEvent({
      type: "paypal.order.created",
      mandateId: null,
      payload: orderPayload(created),
    });
  } catch (error) {
    console.error(`Order ${created.id} was created, but the ledger write failed.`);
    throw error;
  }
  console.log(`Created order ${created.id} (${created.status}).`);

  if (created.status === "PAYER_ACTION_REQUIRED") {
    await appendLedgerEvent({
      type: "paypal.order.payer_action_required",
      mandateId: null,
      payload: orderPayload(created),
    });
    printManualApproval(created);
    process.exitCode = MANUAL_APPROVAL_EXIT;
    return;
  }

  let confirmed: PayPalOrder;
  try {
    confirmed = await confirmCardPayment(client, created.id, `hello-order:confirm:${created.id}`);
  } catch (error) {
    await recordFailure("confirm", created.id, error);
    if (!(error instanceof PayPalApiError)) {
      throw error;
    }
    printManualApproval(created, error);
    process.exitCode = MANUAL_APPROVAL_EXIT;
    return;
  }

  await appendLedgerEvent({
    type: confirmed.status === "PAYER_ACTION_REQUIRED" ? "paypal.order.payer_action_required" : "paypal.order.confirmed",
    mandateId: null,
    payload: orderPayload(confirmed),
  });

  if (confirmed.status !== "APPROVED") {
    printManualApproval(confirmed);
    process.exitCode = MANUAL_APPROVAL_EXIT;
    return;
  }

  console.log(`Confirmed order ${confirmed.id} (${confirmed.status}).`);
  await captureApprovedOrder(client, confirmed.id);
}

async function captureExistingOrder(client: ReturnType<typeof createPayPalClient>, orderId: string) {
  const order = await getOrder(client, orderId, `hello-order:get:${orderId}`);
  console.log(`Loaded order ${order.id} (${order.status}).`);

  if (order.status === "COMPLETED") {
    console.log(`Order ${order.id} is already completed. Capture id: ${captureId(order) ?? "unknown"}.`);
    return;
  }

  if (order.status !== "APPROVED") {
    printManualApproval(order);
    process.exitCode = MANUAL_APPROVAL_EXIT;
    return;
  }

  await captureApprovedOrder(client, order.id);
}

async function captureApprovedOrder(client: ReturnType<typeof createPayPalClient>, orderId: string) {
  try {
    const captured = await captureOrder(client, orderId, `hello-order:capture:${orderId}`);
    await appendLedgerEvent({
      type: "paypal.order.captured",
      mandateId: null,
      payload: {
        ...orderPayload(captured),
        captureId: captureId(captured) ?? null,
      },
    });
    console.log(`Captured order ${captured.id} (${captured.status}). Capture id: ${captureId(captured) ?? "unknown"}.`);
  } catch (error) {
    await recordFailure("capture", orderId, error);
    throw error;
  }
}

function orderPayload(order: PayPalOrder): Record<string, unknown> {
  return {
    orderId: order.id,
    status: order.status,
    amount: orderAmount(order),
    approvalUrl: approvalUrl(order) ?? null,
  };
}

async function recordFailure(step: string, orderId: string | null, error: unknown) {
  const payload = {
    step,
    orderId,
    message: error instanceof Error ? error.message : "Unknown PayPal error",
    status: error instanceof PayPalApiError ? error.status : null,
    issue: error instanceof PayPalApiError ? (error.issue ?? null) : null,
    debugId: error instanceof PayPalApiError ? (error.debugId ?? null) : null,
  };

  try {
    await appendLedgerEvent({
      type: "paypal.order.failed",
      mandateId: null,
      payload,
    });
  } catch (ledgerError) {
    console.error("Could not write the failure ledger event.");
    console.error(ledgerError);
  }
}

function printManualApproval(order: PayPalOrder, error?: unknown) {
  const url = approvalUrl(order);
  console.error("");
  console.error("Buyer approval was not finished automatically.");
  if (error instanceof Error) {
    console.error(`PayPal said: ${error.message}`);
  }
  console.error("");
  console.error("Manual step:");
  console.error(`1. Open this URL in a browser: ${url ?? "(no payer-action or approve link was returned)"}`);
  console.error("2. Sign in with a PayPal sandbox Personal account from https://developer.paypal.com/dashboard/accounts");
  console.error("   Use a Personal sandbox account, not the Business account that owns this REST app.");
  const amount = orderAmount(order);
  const amountLabel = amount ? `${amount.value} ${amount.currencyCode}` : "the payment";
  console.error(`3. Approve the ${amountLabel} payment. The last button should say Pay Now.`);
  console.error("   After approval the browser leaves PayPal and opens example.com. That means it worked.");
  console.error(`4. Capture it with: npm run hello-order -- --capture ${order.id}`);
  console.error("");
}

function readCaptureOrderId(args: string[]): string | undefined {
  const flagIndex = args.indexOf("--capture");
  if (flagIndex === -1) {
    return undefined;
  }

  const orderId = args[flagIndex + 1];
  if (!orderId || orderId.startsWith("--")) {
    throw new Error("Usage: npm run hello-order -- --capture ORDER_ID");
  }

  return orderId;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
