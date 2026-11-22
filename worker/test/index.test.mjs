// Run with: npm test (from worker/)
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';

// The Workers runtime module is unavailable in Node; stub the one export used.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') {
      return {shortCircuit: true, url: 'data:text/javascript,export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }'};
    }
    return next(specifier, context);
  },
});
const {default: worker} = await import('../src/index.js');

const ORIGIN = 'https://taxid.co.ke';
const ATTEMPT = '0f8fad5b-d9cb-469f-a165-70867728950e';
const env = {
  SANDBOX_API_KEY: 'synthetic-key',
  SUPPLIER_PIN: 'A000123456B',
  IP_LIMITER: {limit: async () => ({success: true})},
  DAILY_CAP: {idFromName: name => name, get: () => ({take: async () => true})},
};

function nairobiToday(offsetDays = 0) {
  return new Date(Date.now() + 3 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);
}

async function call(body, upstream = {status: 200, body: {status: 'SIGNED', cuInvoiceNumber: 'CU/1', sdcId: 'SDC', receiptSignature: 'SIG'}}) {
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push({url, init, payload: JSON.parse(init.body)});
    return new Response(JSON.stringify(upstream.body), {status: upstream.status, headers: {'Content-Type': 'application/json'}});
  };
  const response = await worker.fetch(new Request('https://worker.example/', {
    method: 'POST', headers: {Origin: ORIGIN, 'Content-Type': 'application/json'}, body: JSON.stringify(body),
  }), env);
  return {status: response.status, body: await response.json(), sent};
}

const attempt = (extra = {}) => ({amount: 116, band: 'B', attemptId: ATTEMPT, invoiceDate: nairobiToday(), ...extra});

test('uses the current Bearer and Idempotency-Key headers', async () => {
  const {sent} = await call(attempt());
  const headers = new Headers(sent[0].init.headers);
  assert.equal(headers.get('Authorization'), 'Bearer synthetic-key');
  assert.match(headers.get('Idempotency-Key'), /^demo-[0-9a-f]{64}$/);
  assert.equal(headers.get('X-API-Key'), null);
  assert.equal(headers.get('X-TIaaS-Idempotency-Key'), null);
});

test('sends a stable clientReference derived from the attempt', async () => {
  const {sent, body} = await call(attempt());
  assert.equal(sent[0].payload.clientReference, 'demo-' + ATTEMPT);
  assert.equal(body.clientReference, 'demo-' + ATTEMPT);
});

test('sends the attempt invoiceDate instead of recomputing it', async () => {
  const yesterday = nairobiToday(-1);
  const {sent} = await call(attempt({invoiceDate: yesterday}));
  assert.equal(sent[0].payload.invoiceDate, yesterday);
});

test('the idempotency key covers the full identity, including invoiceDate', async () => {
  const today = (await call(attempt())).sent[0];
  const again = (await call(attempt())).sent[0];
  const yesterday = (await call(attempt({invoiceDate: nairobiToday(-1)}))).sent[0];
  const key = sent => new Headers(sent.init.headers).get('Idempotency-Key');
  assert.equal(key(today), key(again));
  assert.notEqual(key(today), key(yesterday));
  assert.equal(today.payload.clientReference, yesterday.payload.clientReference);
});

test('rejects attempts without a fixed identity before calling upstream', async () => {
  for (const body of [attempt({attemptId: undefined}), attempt({attemptId: 'not-a-uuid'}),
    attempt({invoiceDate: undefined}), attempt({invoiceDate: '2026-13-01'}),
    attempt({invoiceDate: nairobiToday(-8)}), attempt({invoiceDate: nairobiToday(2)})]) {
    const {status, sent} = await call(body);
    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(sent.length, 0);
  }
});

for (const [upstreamStatus, code] of [[409, 'X'], [425, 'X'], [422, 'IDEMPOTENCY_KEY_REUSED']]) {
  test('upstream ' + upstreamStatus + ' ' + code + ' means look up the original, not retry', async () => {
    const {status, body} = await call(attempt(), {status: upstreamStatus, body: {status: upstreamStatus, code, message: 'm'}});
    assert.equal(status, 409);
    assert.equal(body.error, 'look_up_original');
    assert.equal(body.retry, false);
    assert.equal(body.clientReference, 'demo-' + ATTEMPT);
    assert.equal(body.upstreamStatus, upstreamStatus);
    assert.doesNotMatch(body.message, /try again/i);
  });
}

// --- P15: itemised sale and honest 422 handling ---

async function callWith(body, {status = 200, payload, headers = {}}) {
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push({url, init, payload: JSON.parse(init.body)});
    return new Response(JSON.stringify(payload), {status, headers: {'Content-Type': 'application/json', ...headers}});
  };
  const response = await worker.fetch(new Request('https://worker.example/', {
    method: 'POST', headers: {Origin: ORIGIN, 'Content-Type': 'application/json'}, body: JSON.stringify(body),
  }), env);
  return {status: response.status, body: await response.json(), sent};
}
const SIGNED = {status: 'SIGNED', cuInvoiceNumber: 'CU/1', sdcId: 'SDC', receiptSignature: 'SIG'};

test('sends an itemised sale: OSCU branches answer a flat taxBand sale with 501', async () => {
  const {sent} = await callWith(attempt({band: 'B', amount: 116}), {payload: SIGNED, headers: {'X-TaxID-Environment': 'SANDBOX'}});
  const payload = sent[0].payload;
  assert.equal(payload.taxBand, undefined, 'flat taxBand must not be sent');
  assert.deepEqual(payload.items, [{
    sku: 'TAXID-DEMO-B', itemNm: 'TaxID live demo item', itemClsCd: '5059690800',
    taxTyCd: 'B', qty: 1, unitPrice: '116.00', pkgUnitCd: 'NT', qtyUnitCd: 'U',
  }]);
  assert.equal(payload.amount, '116.00');
  assert.equal(payload.taxAmount, '16.00');
});

test('bands without an established item class code are refused before calling upstream', async () => {
  for (const band of ['A', 'C', 'D', 'E']) {
    const {status, body, sent} = await callWith(attempt({band}), {payload: SIGNED});
    assert.equal(status, 400, band);
    assert.equal(body.error, 'band_unavailable', band);
    assert.match(body.message, /item class code/);
    assert.equal(sent.length, 0, band);
  }
});

// Backend 422s that are NOT idempotency conflicts: the original was refused, there is nothing to look up.
const REFUSALS = [
  {name: 'VSCU_TERMINAL_ERROR (flat)', payload: {status: 'ERROR', code: 'VSCU_TERMINAL_ERROR', message: 'rejected'}},
  {name: 'INVALID_ITEM_CLASSIFICATION', payload: {status: 'ERROR', code: 'INVALID_ITEM_CLASSIFICATION', message: 'unknown', itemClsCd: '1'}},
  {name: 'PRECONDITION_FAILED', payload: {status: 'ERROR', code: 'PRECONDITION_FAILED', message: 'precondition'}},
  {name: 'VSCU ProblemDetail', payload: {title: 'VSCU Terminal Rejection', status: 422, detail: 'rejected', vscu_code: '910', transient: false}},
  {name: 'OSCU ProblemDetail', payload: {title: 'OSCU Terminal Rejection', status: 422, detail: 'rejected', oscu_code: '13', transient: false}},
];
for (const refusal of REFUSALS) {
  test('upstream 422 ' + refusal.name + ' is a refusal, not "look up the original"', async () => {
    const {status, body} = await callWith(attempt(), {status: 422, payload: refusal.payload});
    assert.equal(status, 502);
    assert.equal(body.error, 'not_signed');
    assert.equal(body.upstreamStatus, 422);
    assert.equal(body.message, refusal.payload.message || refusal.payload.detail);
  });
}

test('upstream 422 IDEMPOTENCY_KEY_REUSED still means look up the original', async () => {
  const {body} = await callWith(attempt(), {status: 422, payload: {status: 'ERROR', code: 'IDEMPOTENCY_KEY_REUSED', message: 'm'}});
  assert.equal(body.error, 'look_up_original');
});
