import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../connected-demo.js', import.meta.url), 'utf8');

function simulator(respond) {
  const elements = new Map();
  const requests = [];
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', disabled: false, hidden: false, children: [], listeners: {},
      textContent: '',
      addEventListener(event, callback) { this.listeners[event] = callback; },
      append(child) { this.children.push(child); },
      replaceChildren() { this.children = []; },
    });
    return elements.get(id);
  }
  element('connected-kind').value = 'creator';
  element('connected-scenario').value = 'SUCCESS';
  element('connected-residency').value = 'resident';
  vm.runInNewContext(source, {
    document: {getElementById: element, createElement: () => element(Symbol())},
    crypto: {randomUUID: () => 'original-sale'}, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      const request = {url, method: options.method,
        body: options.body ? JSON.parse(options.body) : undefined};
      requests.push(request);
      const result = await respond(request);
      return {ok: result.ok !== false, json: async () => result.body};
    },
  });
  return {element, requests, click: id => element('connected-' + id).listeners.click(),
    change: (id, value) => {
      element('connected-' + id).value = value;
      element('connected-' + id).listeners.change?.();
    },
    output: () => element('connected-results').children.flatMap(row =>
      row.children.map(cell => cell.textContent)).join('\n')};
}

function signed(request) {
  if (request.url.endsWith('/session')) return {body: {environment: 'SIMULATED', kraSubmission: false}};
  if (request.url.endsWith('/demo-calculation')) return {body: {
    calculatedWithholding: 58, netPayable: 967.44, platformFee: 116, platformFeeVat: 18.56,
  }};
  return {body: {status: 'SIGNED', clientReference: 'landing-original-sale', purchaseId: 42,
    cuInvoiceNumber: 'SIMULATED-42'}};
}

test('creator duplicate recovery reuses the original request and displays simulated figures', async () => {
  const app = simulator(signed);
  await app.click('run');
  assert.match(app.output(), /Simulated withholding estimate\nKES 58/);
  assert.match(app.output(), /Projected payout · not paid/);
  await app.click('duplicate');
  const sales = app.requests.filter(request => request.url.endsWith('/sample-sales'));
  assert.equal(sales.length, 2);
  assert.deepEqual(sales[0].body, sales[1].body);
  assert.match(app.output(), /Recovered duplicate · same identity/);
});

test('retail sends the itemised basket and returns against the original reference', async () => {
  const app = simulator(request => request.url.includes('/retail-sales/search')
    ? {body: {invoice: {amount: 290, taxAmount: 40}}} : signed(request));
  app.change('kind', 'retail');
  await app.click('run');
  const sale = app.requests.find(request => request.url.endsWith('/retail-sales'));
  assert.equal(sale.body.items.length, 2);
  assert.equal(sale.body.items[0].qty, 2);
  assert.equal(app.element('connected-return').disabled, false);
  await app.click('return');
  const returned = app.requests.find(request => request.url.endsWith('/demo-return'));
  assert.equal(returned.body.originalReference, sale.body.clientReference);
});

test('uncertain signing blocks replacement and duplicate submissions while allowing original lookup', async () => {
  let resolved = false;
  const app = simulator(request => request.url.endsWith('/sample-sales') || request.url.includes('/sales/search')
    ? {body: {status: resolved ? 'SIGNED' : 'OUTCOME_UNKNOWN', purchaseId: 42}} : signed(request));
  await app.click('run');
  assert.equal(app.element('connected-run').disabled, true);
  assert.equal(app.element('connected-duplicate').disabled, true);
  assert.equal(app.element('connected-lookup').disabled, false);
  resolved = true;
  await app.click('lookup');
  assert.match(app.requests.at(-1).url, /clientReference=landing-original-sale$/);
  assert.equal(app.element('connected-run').disabled, false);
});

test('unavailable simulator does not invent a receipt', async () => {
  const app = simulator(() => { throw new Error('Simulator unavailable'); });
  await app.click('run');
  assert.match(app.element('connected-message').textContent, /unavailable/);
  assert.equal(app.output(), '');
  assert.equal(app.element('connected-duplicate').disabled, true);
});

test('failed signing response retains the original reference for lookup', async () => {
  const app = simulator(request => request.url.endsWith('/sample-sales')
    ? {ok: false, body: {message: 'Connection lost'}} : signed(request));
  await app.click('run');
  assert.match(app.element('connected-message').textContent, /landing-original-sale/);
  assert.equal(app.element('connected-run').disabled, true);
  assert.equal(app.element('connected-lookup').disabled, false);
});
