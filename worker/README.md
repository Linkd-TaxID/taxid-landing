# taxid-demo-sign — live-receipt Worker

Signs **one live KRA-sandbox receipt** for the "Sign a test receipt" demo on
[taxid.co.ke](https://taxid.co.ke).

The landing page is static (GitHub Pages) and cannot safely hold a credential.
This Worker sits between the page and the TaxID middleware and holds the sandbox
`X-API-Key` as an encrypted secret, so the key never reaches the browser.

## What it does

```
browser ──{ amount, band }──▶ Worker ──POST /v2/etims/sale (X-API-Key)──▶ api.taxid.co.ke ──▶ KRA sandbox VSCU
        ◀── real signed fiscal block ◀────────────────────────────────────────────────────────────────
```

- The browser sends **only** `{ amount, band }` — never a key, never tax figures.
- The Worker recomputes the VAT split itself (same zero-math as the SDK), so a
  crafted client cannot forge an inconsistent net/VAT/gross.
- `supplierPin`, payment type and invoice date are fixed server-side.
- Guards: amount capped at 1,000,000; band whitelist (A–E); requests from any
  origin outside the allow-list are refused with 403; per-IP burst limit
  (`IP_LIMITER`, 6/min) and an exact global daily cap (`DAILY_CAP` Durable
  Object, 500/day). Both limiters are declared in `wrangler.toml` and are
  required — without them the Worker returns `not_configured` instead of
  signing unthrottled.

## Deploy

```bash
cd worker
npm install

# 1. Authenticate (opens a browser once)
npx wrangler login

# 2. Store the sandbox secrets (paste the value when prompted for each)
npx wrangler secret put SANDBOX_API_KEY   # the SANDBOX_SDK_KEY value
npx wrangler secret put SUPPLIER_PIN      # the sandbox device's KRA PIN (kept out of source)

# 3. Ship it (the rate limiter and daily-cap Durable Object deploy with it)
npx wrangler deploy
```

`wrangler deploy` prints the public URL, e.g.
`https://taxid-demo-sign.<your-subdomain>.workers.dev`.

## Wire the page to it

In `../index.html`, set the demo endpoint constant to the deployed URL:

```js
var DEMO_SIGN_URL = "https://taxid-demo-sign.<your-subdomain>.workers.dev";
```

While `DEMO_SIGN_URL` is empty (or the Worker is unreachable) the demo falls
back to a clearly-labelled client-side **sample**. Once it is set and reachable,
the demo signs a **real sandbox receipt** and shows the genuine SCU ID, CU
invoice number, receipt signature and timestamp.

## Local development

```bash
cp .dev.vars.example .dev.vars     # then fill in the real SANDBOX_SDK_KEY + SUPPLIER_PIN
npx wrangler dev                   # serves on http://localhost:8787
curl -s http://localhost:8787 -X POST -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:8000' \
  -d '{"amount":580,"band":"B"}' | python3 -m json.tool
```

`.dev.vars` is git-ignored — never commit it.

## Rotating / revoking the demo key

The key is sandbox-only and tenant-bound. To rotate: mint a new sandbox key,
`npx wrangler secret put SANDBOX_API_KEY` with the new value, then revoke the old
one on the middleware. No page redeploy is needed.
