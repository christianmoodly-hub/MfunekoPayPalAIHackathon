const SANDBOX_API = "https://api-m.sandbox.paypal.com";

export function paypalBaseUrl(paypalEnv: string | undefined): string {
  if (paypalEnv !== "sandbox") {
    throw new Error("PayPal is sandbox only. Set PAYPAL_ENV=sandbox.");
  }

  return SANDBOX_API;
}

export function readPayPalEnv(env: NodeJS.ProcessEnv = process.env) {
  const clientId = env.PAYPAL_CLIENT_ID;
  const clientSecret = env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required.");
  }

  return {
    clientId,
    clientSecret,
    baseUrl: paypalBaseUrl(env.PAYPAL_ENV),
  };
}
