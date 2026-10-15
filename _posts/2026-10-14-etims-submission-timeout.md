---
title: "What to do when an eTIMS submission times out"
description: "A timeout doesn't tell you whether the invoice was signed. Look up the original reference before you submit again."
category: Recovery
author: TaxID
# last_modified_at: 2026-11-01   # uncomment when you revise this post
faq:
  - q: "What happens after a timeout or outage?"
    a: "Eligible queued work can retry after recovery. If signing may already have happened, TaxID stops automatic replay so the original request can be investigated."
  - q: "Does SIGNED mean KRA has accepted the invoice?"
    a: "No. SIGNED records the control-unit signing outcome; it does not establish central KRA acceptance. In the simulator, it describes a test receipt only."
---

**Short answer:** don't resubmit. A timed-out request may already have been signed, so look up the sale by its original reference first. If lookup finds a receipt, reuse it. If the outcome is still uncertain, investigate before submitting another sale.

## Why a timeout is ambiguous

When a submission times out, your application knows the request left, but not what happened next. Signing may have completed and only the response was lost, or the request may never have reached the control unit. The response alone can't tell you which.

Sending the same invoice again on a guess risks a second fiscal record for one sale. That's why the original reference matters so much.

## Send a reference and idempotency key with every request

Every submission should carry your own invoice reference and an idempotency key, so the sale can be found again later:

```bash
curl -X POST "$TAXID_API_URL/v2/etims/sale" \
  -H "Authorization: Bearer $TAXID_API_KEY" \
  -H "Idempotency-Key: INV-2026-001" \
  -H "Content-Type: application/json" \
  --data @invoice.json
```

Store the reference with the invoice in your own database before you send the request, not after it succeeds.

## The recovery flow

1. **The submission times out.** Keep the original reference.
2. **Look up that reference.** Retrieve receipt fields and status for the same sale. The lookup endpoint is in the [docs](https://docs.taxid.co.ke).
3. **Reuse what you find.** If lookup returns a stored `SIGNED` receipt, use its fields without submitting another sale. If the outcome is still uncertain, investigate before resubmitting.

## What happens after a timeout or outage?

Eligible queued work can retry after recovery. If signing may already have happened, TaxID stops automatic replay so the original request can be investigated.

## Does SIGNED mean KRA has accepted the invoice?

No. SIGNED records the control-unit signing outcome; it does not establish central KRA acceptance. In the simulator, it describes a test receipt only.
