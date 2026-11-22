# Landing receipt relay

The public creator/retail examples run locally in the browser. They make no API
requests and do not use this Worker. Their statuses, receipt numbers, lookup and
recovery outcomes are illustrations, not evidence of fiscal signing. Connected
integration testing belongs in the invited simulator workspace.

Retained Cloudflare Worker from the former standalone receipt sample. The
landing no longer contains its endpoint setting or calls this relay. It is not
the invited developer workspace and is not enabled by this documentation.

The Worker forwards `POST /v2/etims/sale` to `https://api.taxid.co.ke`, holding
`SANDBOX_API_KEY` and `SUPPLIER_PIN` as server-side secret bindings. The key is
sent as `Authorization: Bearer`; never place it in landing JavaScript.

The browser sends `{ amount, band, attemptId, invoiceDate }`. It mints the UUID
`attemptId` and the Nairobi `invoiceDate` together when an attempt starts and
resends both unchanged on every retry. The date must be today or up to 7 days
earlier (the API's back-dating limit). The Worker computes the amount/VAT split
and sends one itemised line (OSCU branches refuse a sale without items) with
`clientReference: demo-<attemptId>` and an `Idempotency-Key` derived from the
attempt, date, band and amount, so a changed body never reuses a key.
A 409, a 425 or a 422 `IDEMPOTENCY_KEY_REUSED` from the API is returned as
`look_up_original` (HTTP 409, `retry: false`): look up the original reference
instead of resending. Any other 422 is a refusal and is returned as `not_signed`
with the API's `code` and `message` (or ProblemDetail `detail`).

## Configuration

| Binding | Purpose |
|---|---|
| `SANDBOX_API_KEY` | Branch application key, stored with Wrangler secrets |
| `SUPPLIER_PIN` | Assigned seller PIN, stored with Wrangler secrets |
| `IP_LIMITER` | Required per-location burst limiter: 6 requests/minute/IP |
| `DAILY_CAP` | Required Durable Object: global cap of 500 attempts/UTC day |
| `ALLOW_LOCALHOST=1` | Development-only permission for localhost origins |

`wrangler.toml` defines both limiters. Missing bindings return `not_configured`.
Amounts are limited to KES 1–1,000,000. Only band B is signed, with item class
code `5059690800` (the backend's band-B default); no class code is established
for A, C, D or E, so those return `band_unavailable` without calling the API.
CORS restricts browser origins but does not authenticate arbitrary HTTP clients.

Local commands: `npm install`, then `npx wrangler dev`. Secret values belong in
ignored `.dev.vars`; production bindings use `npx wrangler secret put`.
Deployment uses `npx wrangler deploy` only after the release boundary below is
resolved. Rotation replaces the Worker secret and revokes the old branch key.

## Release boundary

A signed result is labelled `sandbox: true` only when the API's
`X-TaxID-Environment` response header is `SANDBOX`; otherwise `sandbox` is false
and `environment` carries the header value (or null). The relay has no lookup
route of its own: the caller
must look up `clientReference` through the application. After a transport
timeout it advises retrying the same attempt, which reuses its key and body.
Resolve these before reactivating it: no fiscal request may be repeated with a
new identity after uncertainty.
Do not treat its label as evidence of KRA sandbox submission or central acceptance.

Use the invited simulator workspace for the maintained submit, lookup and recovery
journey. `SIGNED` means a persisted control-unit receipt; central KRA acceptance
requires separate evidence. Current TaxID developer access issues simulated output.

The application selects VSCU or OSCU on separate synthetic backends; visitors do
not select a technical transport. The invited workspace uses itemised business
input in either mode. This Worker remains inactive. The application relay owns
session revocation, operation limits and recovery by the original reference.
