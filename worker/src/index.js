/**
 * taxid-demo-sign — Cloudflare Worker (dormant)
 * ---------------------------------------------
 * Relays one demo sale to the TaxID API (POST /v2/etims/sale) so a static page
 * never holds a credential. The landing page does not call this Worker today
 * and it is deployed separately, only by hand (see README.md).
 *
 * Environment: the Worker signs in whichever environment SANDBOX_API_KEY is
 * bound to. It does not verify that the key is a sandbox key; the `sandbox`
 * field in its response is a label, not evidence. SIGNED means a control-unit
 * receipt, not central KRA acceptance.
 *
 * Browser contract: { amount, band, attemptId, invoiceDate }. The page mints
 * attemptId (a UUID) and invoiceDate (yyyy-MM-dd, Africa/Nairobi) together when
 * an attempt starts and resends both unchanged on every retry. The Worker
 * recomputes the VAT split, fixes supplierPin and payment type, and sends one
 * itemised line (OSCU branches refuse a sale without items with 501):
 *   clientReference  demo-<attemptId>, stable for lookup by original reference
 *   Idempotency-Key  demo-<sha256(attemptId, invoiceDate, band, amount)>, so the
 *                    key always names the exact body, invoiceDate included
 * 409, 422 and 425 from the API mean the original attempt exists, is in
 * flight, or conflicts: the page must look up clientReference, not retry.
 *
 * Secrets / bindings (see wrangler.toml + README):
 *   SANDBOX_API_KEY  (secret)          — branch API key, sent as Authorization: Bearer
 *   SUPPLIER_PIN     (secret)          — the key's taxpayer PIN
 *   IP_LIMITER       (rate limit)      — per-IP burst limit
 *   DAILY_CAP        (Durable Object)  — global signings per day
 *   ALLOW_LOCALHOST  (var, dev only)    — "1" admits http://localhost origins
 *
 * Both limiters are required: the Worker refuses to sign without them.
 */

import { DurableObject } from "cloudflare:workers";

// KRA VSCU/OSCU Specification v2.0 §4.1 tax bands. B is the 16% standard band,
// NOT A. Do not "correct" this — it is the spec, and it is routinely inverted.
const RATES = { A: 0, B: 0.16, C: 0, D: 0, E: 0.08 };
const RATE_LABEL = { A: "0%", B: "16%", C: "0%", D: "0%", E: "8%" };

// The sandbox device the demo signs against is fixed server-side (env.SUPPLIER_PIN)
// so a client can never point the demo at a different taxpayer. It is NOT
// hardcoded here: a KRA PIN is identifying data and this repo is public. Set it
// with `wrangler secret put SUPPLIER_PIN`.
const PMT_TY_CD = "01"; // 01 = cash (KRA §4.7)

// One itemised demo line per band. A band is offered only with a commodity code
// shown valid for it: 5059690800 is the backend's own band-B default
// (PurchaseService etims.default.item-cls-cd, MockVscuController taxTyCd "B").
// No code is established for A, C, D or E (real VSDC master rows carry null
// taxTyCd), so those bands are refused locally rather than guessed.
const DEMO_ITEMS = {
  B: { sku: "TAXID-DEMO-B", itemNm: "TaxID live demo item", itemClsCd: "5059690800" },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Mirrors PurchaseService.validateInvoiceDate (etims.invoice.max-backdate-days=7).
const MAX_BACKDATE_DAYS = 7;
// The original attempt exists, conflicts or is still in flight: look it up.
const LOOK_UP_STATUSES = new Set([409, 422, 425]);

// Accepted by the middleware but not (yet) signed. PENDING_SYNC is queued and
// will sign on replay; the other two are ambiguous and held for reconciliation.
// None of them may be resubmitted as a new sale.
const QUEUED_MESSAGE = {
  PENDING_SYNC:
    "The sandbox control unit is busy, so this receipt is queued and will be signed automatically. No need to click again.",
  OUTCOME_UNKNOWN:
    "The sandbox did not confirm whether this receipt was signed. It is held for reconciliation and will not be signed twice. No need to click again.",
  RECONCILIATION_REQUIRED:
    "The sandbox did not confirm whether this receipt was signed. It is held for reconciliation and will not be signed twice. No need to click again.",
};

const MIDDLEWARE_URL = "https://api.taxid.co.ke/v2/etims/sale";
const UPSTREAM_TIMEOUT_MS = 20000;

// Bounds. Cap the amount so nobody can pollute the sandbox EJ / X-report with
// a billion-shilling receipt.
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 1_000_000;

// The per-IP limit itself lives on the IP_LIMITER binding in wrangler.toml.
const GLOBAL_PER_DAY = 500;

// Origins allowed to call this Worker; anything else is refused with 403.
// Origin is trivially forged outside a browser, so this only stops other
// websites from spending our quota — the limiters are the real abuse guard.
const ALLOWED_ORIGINS = new Set([
  "https://taxid.co.ke",
  "https://www.taxid.co.ke",
  "https://linkd-taxid.github.io",
]);

function originAllowed(origin, env) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return env.ALLOW_LOCALHOST === "1" && /^http:\/\/localhost(:\d+)?$/.test(origin);
}

function corsHeaders(origin) {
  const h = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  // Callers only build CORS headers for an origin that passed originAllowed().
  if (origin) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

// Two-decimal string, ROUND_HALF_UP on positive values — matches the SDK's
// Decimal(...).quantize(Decimal("0.01"), ROUND_HALF_UP). Cent-integer math
// avoids binary-float drift that would make KRA reject the payload.
function money(cents) {
  return (cents / 100).toFixed(2);
}
function vatSplit(amount, band) {
  const rate = RATES[band];
  const grossCents = Math.round(amount * 100);
  // net = round_half_up(gross / (1 + rate)); vat = gross - net, so the parts
  // always reconcile to the cent regardless of rate.
  const netCents = rate === 0 ? grossCents : Math.round(grossCents / (1 + rate));
  const vatCents = grossCents - netCents;
  return { net: money(netCents), vat: money(vatCents), gross: money(grossCents) };
}

// A date in Africa/Nairobi (UTC+3, no DST) as yyyy-MM-dd, offset by whole days.
function nairobiDate(offsetDays = 0) {
  return new Date(Date.now() + 3 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);
}
function invoiceDateAllowed(value) {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  return value <= nairobiDate() && value >= nairobiDate(-MAX_BACKDATE_DAYS);
}
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

// Global daily signing cap. One named instance serialises every increment,
// so the count is exact under concurrency (unlike KV, which is eventually
// consistent and throttles writes to a single key to ~1/s).
export class DailyCap extends DurableObject {
  // Returns true and counts the signing if today is under the cap.
  async take(limit) {
    const day = Math.floor(Date.now() / 86400000);
    const state = (await this.ctx.storage.get("state")) || { day, count: 0 };
    if (state.day !== day) {
      state.day = day;
      state.count = 0;
    }
    if (state.count >= limit) return false;
    state.count += 1;
    await this.ctx.storage.put("state", state);
    return true;
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (!originAllowed(origin, env)) {
      return new Response(JSON.stringify({ ok: false, error: "forbidden_origin" }), {
        status: 403,
        headers: { "Content-Type": "application/json", Vary: "Origin" },
      });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "method_not_allowed" }, 405, origin);
    }

    // Parse + validate the (deliberately tiny) request body.
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "bad_json" }, 400, origin);
    }
    const band = String(body?.band || "").toUpperCase();
    const amount = Number(body?.amount);
    if (!(band in RATES)) {
      return json({ ok: false, error: "bad_band", message: "band must be A, B, C, D or E" }, 400, origin);
    }
    if (!(band in DEMO_ITEMS)) {
      return json(
        { ok: false, error: "band_unavailable",
          message: `The demo only signs band ${Object.keys(DEMO_ITEMS).join(", ")}: no item class code is established for band ${band}.` },
        400,
        origin,
      );
    }
    if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
      return json(
        { ok: false, error: "bad_amount", message: `amount must be between ${MIN_AMOUNT} and ${MAX_AMOUNT}` },
        400,
        origin,
      );
    }

    const attemptId = String(body?.attemptId || "");
    if (!UUID_RE.test(attemptId)) {
      return json({ ok: false, error: "bad_attempt", message: "attemptId must be a UUID kept for every retry" }, 400, origin);
    }
    const invoiceDate = String(body?.invoiceDate || "");
    if (!invoiceDateAllowed(invoiceDate)) {
      return json(
        { ok: false, error: "bad_invoice_date",
          message: `invoiceDate must be yyyy-MM-dd, today or up to ${MAX_BACKDATE_DAYS} days earlier, fixed for the attempt` },
        400,
        origin,
      );
    }

    if (!env.SANDBOX_API_KEY || !env.SUPPLIER_PIN || !env.IP_LIMITER || !env.DAILY_CAP) {
      return json({ ok: false, error: "not_configured", message: "demo signing is not fully configured" }, 500, origin);
    }
    const supplierPin = env.SUPPLIER_PIN;

    const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
    const { success: ipOk } = await env.IP_LIMITER.limit({ key: ip });
    if (!ipOk) {
      const message = "Too many demo receipts from your connection. Give it a minute.";
      return json({ ok: false, error: "rate_limited", scope: "ip", message }, 429, origin);
    }
    const cap = env.DAILY_CAP.get(env.DAILY_CAP.idFromName("global"));
    if (!(await cap.take(GLOBAL_PER_DAY))) {
      const message = "The live demo has hit its daily signing cap. Try the SDK, or come back tomorrow.";
      return json({ ok: false, error: "rate_limited", scope: "global", message }, 429, origin);
    }

    // Recompute the split server-side and build an itemised single-line sale.
    const split = vatSplit(amount, band);
    const clientReference = `demo-${attemptId.toLowerCase()}`;
    const payload = {
      supplierPin,
      clientReference,
      amount: split.gross,
      taxAmount: split.vat,
      invoiceDate,
      itemDescription: "TaxID live demo — sandbox receipt",
      pmtTyCd: PMT_TY_CD,
      items: [{
        ...DEMO_ITEMS[band],
        taxTyCd: band,
        qty: 1,
        unitPrice: split.gross,
        pkgUnitCd: "NT",
        qtyUnitCd: "U",
      }],
    };

    // The page keeps one attemptId and invoiceDate until the attempt resolves, so
    // a retry replays the same key and body. The key is derived from every input
    // that shapes the body; a changed date can never reuse an older key.
    const idem = "demo-" + await sha256Hex([attemptId.toLowerCase(), invoiceDate, band, split.gross].join("\n"));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    let upstream;
    try {
      upstream = await fetch(MIDDLEWARE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SANDBOX_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idem,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const timedOut = e && e.name === "AbortError";
      return json(
        {
          ok: false,
          error: timedOut ? "upstream_timeout" : "upstream_unreachable",
          clientReference,
          message: "Could not reach the signing service. Retry this same attempt; it reuses its reference and key.",
        },
        504,
        origin,
      );
    }
    clearTimeout(timer);

    let data;
    try {
      data = await upstream.json();
    } catch {
      return json({ ok: false, error: "upstream_bad_response" }, 502, origin);
    }

    if (LOOK_UP_STATUSES.has(upstream.status)) {
      return json(
        {
          ok: false,
          error: "look_up_original",
          retry: false,
          clientReference,
          upstreamStatus: upstream.status,
          code: data.code,
          message: "This attempt already exists, conflicts or is still being processed. Look up its original reference; don't send it again.",
        },
        409,
        origin,
      );
    }

    if (upstream.ok && data.status in QUEUED_MESSAGE) {
      return json(
        { ok: false, queued: true, status: data.status, purchaseId: data.purchaseId, clientReference, message: QUEUED_MESSAGE[data.status] },
        202,
        origin,
      );
    }

    // Anything the middleware itself rejected (SUSPENDED, validation, 429, …).
    if (!upstream.ok || data.status !== "SIGNED") {
      return json(
        {
          ok: false,
          error: "not_signed",
          upstreamStatus: upstream.status,
          message: data.message || "The signing service did not return a signed receipt.",
        },
        502,
        origin,
      );
    }

    // Success: return the split we computed + the real fiscal block. Nothing
    // here is a secret; the whole point is that these are genuine KRA-sandbox
    // control-unit values.
    return json(
      {
        ok: true,
        sandbox: true,
        band,
        rate: RATE_LABEL[band],
        net: split.net,
        vat: split.vat,
        gross: split.gross,
        supplierPin,
        clientReference,
        invoiceDate,
        status: data.status,
        cuInvoiceNumber: data.cuInvoiceNumber,
        sdcId: data.sdcId,
        receiptSignature: data.receiptSignature,
        vscuTimestamp: data.vscuTimestamp,
        kraQrPayload: data.kraQrPayload,
      },
      200,
      origin,
    );
  },
};
