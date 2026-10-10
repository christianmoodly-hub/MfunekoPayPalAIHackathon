const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//;

export function normalizeMerchant(value: string): string {
  let text = value.trim().toLowerCase();
  if (!text) {
    return "";
  }

  text = text.replace(SCHEME, "").replace(/^\/\//, "");
  const at = text.lastIndexOf("@");
  if (at !== -1) {
    text = text.slice(at + 1);
  }

  const cut = text.search(/[/?#]/);
  if (cut !== -1) {
    text = text.slice(0, cut);
  }

  text = text.replace(/:\d+$/, "");
  if (text.startsWith("www.")) {
    text = text.slice(4);
  }

  return text.replace(/\.$/, "");
}

export function merchantCoveredBy(rule: string, merchant: string): boolean {
  const base = normalizeMerchant(rule);
  const host = normalizeMerchant(merchant);
  if (!base || !host) {
    return false;
  }

  return host === base || host.endsWith(`.${base}`);
}
