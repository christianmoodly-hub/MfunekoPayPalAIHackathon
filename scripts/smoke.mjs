#!/usr/bin/env node

const args = process.argv.slice(2);
const runAgent = args.includes("--run");
const urls = args.filter((arg) => arg !== "--run");
const results = [];

function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function printResults() {
  const width = Math.max(...results.map((result) => result.name.length), 5);
  console.log(`\n${"CHECK".padEnd(width)}  RESULT  DETAILS`);
  for (const result of results) {
    console.log(`${result.name.padEnd(width)}  ${result.passed ? "PASS" : "FAIL"}    ${result.detail}`);
  }
  console.log(`\n${results.filter((result) => result.passed).length}/${results.length} checks passed.`);
}

if (urls.length !== 1) {
  console.error("Usage: npm run smoke -- <base-url> [--run]");
  process.exit(2);
}

let base;
try {
  base = new URL(urls[0]);
  if (!["http:", "https:"].includes(base.protocol)) throw new Error();
  base.pathname = base.pathname.replace(/\/$/, "");
  base.search = "";
  base.hash = "";
} catch {
  console.error("Provide a valid http(s) base URL.");
  process.exit(2);
}

async function request(path, init) {
  return fetch(new URL(path, base), { redirect: "manual", ...init });
}

async function main() {
  let gatePassed = false;
  try {
    const response = await request("/api/mandates");
    gatePassed = response.status === 401;
    check("Passcode gate", gatePassed, `unauthenticated GET /api/mandates returned HTTP ${response.status}; expected 401`);
  } catch {
    check("Passcode gate", false, "request failed");
  }

  try {
    const response = await request("/api/health");
    const body = response.ok ? await response.json() : null;
    const passed = response.status === 200 && body?.ok === true;
    check("Health route", passed, `HTTP ${response.status}`);
  } catch {
    check("Health route", false, "request failed");
  }

  let cookie = "";
  const passcode = process.env.DEMO_PASSCODE;
  if (!passcode) {
    check("Passcode login", false, "DEMO_PASSCODE is not set in this environment");
  } else {
    try {
      const response = await request("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const setCookie = response.headers.get("set-cookie") ?? "";
      const pair = setCookie.match(/(?:^|,\s*)mandate_demo=([^;,]+)/)?.[1];
      if (response.status === 200 && pair) cookie = `mandate_demo=${pair}`;
      check("Passcode login", Boolean(cookie), `HTTP ${response.status}${cookie ? "; session established" : "; no session cookie returned"}`);
    } catch {
      check("Passcode login", false, "request failed");
    }
  }

  if (cookie) {
    const headers = { cookie };
    try {
      const response = await request("/api/mandates", { headers });
      let body;
      try { body = await response.json(); } catch { body = null; }
      const passed = response.status === 200 && Array.isArray(body?.mandates) && body?.wallet !== undefined;
      check("Database and migrations", passed, `GET /api/mandates returned HTTP ${response.status}${passed ? `; ${body.mandates.length} mandate(s)` : ""}`);
    } catch {
      check("Database and migrations", false, "request failed");
    }

    try {
      const response = await request("/api/wallet", { headers });
      let body;
      try { body = await response.json(); } catch { body = null; }
      const passed = response.status === 200 && body?.linked === true;
      check("Wallet linked", passed, `GET /api/wallet returned HTTP ${response.status}${body?.linked === false ? "; no wallet is linked" : ""}`);
    } catch {
      check("Wallet linked", false, "request failed");
    }

    if (runAgent) await runThrowawayAgent(headers);
  } else if (runAgent) {
    check("Throwaway mandate and agent run", false, "requires a successful passcode login");
  }
  if (!cookie) {
    check("Database and migrations", false, "requires a successful passcode login");
    check("Wallet linked", false, "requires a successful passcode login");
  }

  printResults();
  process.exitCode = results.every((result) => result.passed) ? 0 : 1;
}

async function runThrowawayAgent(headers) {
  let mandateId;
  try {
    const parsedResponse = await request("/api/mandates/parse", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ text: "Smoke test: buy one ordinary office supply item, maximum total 3 dollars, maximum per item 3 dollars, escalate above 3 dollars." }),
    });
    const parsedBody = await parsedResponse.json();
    if (!parsedResponse.ok || !parsedBody?.mandate?.id) {
      check("Throwaway mandate and agent run", false, `mandate parse returned HTTP ${parsedResponse.status}`);
      return;
    }
    const mandate = parsedBody.mandate;
    mandateId = mandate.id;
    const edits = {
      description: mandate.description,
      searchQuery: mandate.searchQuery,
      maxTotalCents: 300,
      maxPerItemCents: 300,
      allowedCategories: mandate.allowedCategories,
      blockedMerchants: mandate.blockedMerchants,
      allowedMerchants: mandate.allowedMerchants,
      requireFreeReturns: false,
      deliverBy: null,
      escalateAboveCents: 300,
    };
    const confirm = await request(`/api/mandates/${mandateId}/confirm`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(edits),
    });
    if (!confirm.ok) {
      check("Throwaway mandate and agent run", false, `mandate confirmation returned HTTP ${confirm.status}`);
      return;
    }
    const start = await request("/api/runs", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ mandateId }),
    });
    const startBody = await start.json();
    if (start.status !== 202 || !startBody?.run?.id) {
      check("Throwaway mandate and agent run", false, `agent start returned HTTP ${start.status}`);
      return;
    }
    check("Throwaway mandate and agent run", true, `created ${mandateId}; started run ${startBody.run.id} (run may finish asynchronously)`);
  } catch {
    check("Throwaway mandate and agent run", false, "request failed; the throwaway mandate may have been created");
  }
}

await main();
