# Landing receipt relay

Optional Cloudflare Worker for the landing receipt sample. The landing currently
leaves `DEMO_SIGN_URL` empty and renders a labelled local sample. This relay is
not the invited developer workspace and is not enabled by this documentation.

The Worker forwards `POST /v2/etims/sale` to `https://api.taxid.co.ke`, holding
`SANDBOX_API_KEY` and `SUPPLIER_PIN` as server-side secret bindings. The browser
sends `{ amount, band, attemptId }`; the Worker computes the amount/VAT split.
The key fixes the taxpayer branch. Never place it in landing JavaScript.

## Configuration

| Binding | Purpose |
|---|---|
| `SANDBOX_API_KEY` | Branch application key, stored with Wrangler secrets |
| `SUPPLIER_PIN` | Assigned seller PIN, stored with Wrangler secrets |
| `IP_LIMITER` | Required per-location burst limiter: 6 requests/minute/IP |
| `DAILY_CAP` | Required Durable Object: global cap of 500 attempts/UTC day |
| `ALLOW_LOCALHOST=1` | Development-only permission for localhost origins |

`wrangler.toml` defines both limiters. Missing bindings return `not_configured`.
Amounts are limited to KES 1–1,000,000; supported bands are A–E. Fixed rate
values are sample defaults and require review against current classifications.
CORS restricts browser origins but does not authenticate arbitrary HTTP clients.

Local commands: `npm install`, then `npx wrangler dev`. Secret values belong in
ignored `.dev.vars`; production bindings use `npx wrangler secret put`.
Deployment uses `npx wrangler deploy` only after the release boundary below is
resolved. Rotation replaces the Worker secret and revokes the old branch key.

## Release boundary

This retained relay labels successful output `sandbox: true` without verifying
the upstream environment. It also lacks original-reference lookup and advises
retry after a transport timeout. Those behaviours must be corrected before
reactivating it: no fiscal request may be repeated blindly after uncertainty.
Do not treat its label as evidence of KRA sandbox submission or central acceptance.

Use the invited simulator workspace for the maintained submit, lookup and recovery
journey. `SIGNED` means a persisted control-unit receipt; central KRA acceptance
requires separate evidence. Current TaxID developer access issues simulated output.
