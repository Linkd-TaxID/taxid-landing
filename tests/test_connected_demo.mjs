import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../connected-demo.js', import.meta.url), 'utf8');

function simulator() {
  const elements = new Map();
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
    fetch: () => { assert.fail('Local examples must not make API requests'); },
  });
  const content = element => [element.textContent, ...element.children.map(content)].filter(Boolean).join('\n');
  return {element, click: id => element('connected-' + id).listeners.click(),
    previews: () => element('connected-receipts').children.map(content),
    change: (id, value) => {
      element('connected-' + id).value = value;
      element('connected-' + id).listeners.change();
    },
    output: () => element('connected-results').children.flatMap(row =>
      row.children.map(cell => cell.textContent)).join('\n')};
}

test('creator local calculation and duplicate recovery retain the same sample receipt', () => {
  const app = simulator();
  app.click('run');
  assert.match(app.output(), /Simulated withholding estimate\nKES 58.00/);
  assert.match(app.output(), /Projected payout · not paid\nKES 967.44/);
  const originalReceipt = app.previews()[0];
  assert.match(originalReceipt, /See a sample receipt · Creator sale/);
  assert.match(originalReceipt, /Net\nKES 1000.00\nSample VAT\nKES 160.00\nTotal\nKES 1160.00/);
  assert.match(originalReceipt, /Placeholder · not signed/);
  app.click('duplicate');
  assert.equal(app.previews()[0], originalReceipt);
  assert.match(app.output(), /Recovered duplicate · same sample receipt/);
  assert.match(app.output(), /DEMO-0001-RECEIPT/);
  assert.doesNotMatch(app.output(), /DEMO-0002/);
  app.click('fee');
  assert.match(app.output(), /Separate platform fee invoice/);
  assert.match(app.output(), /KES 134.56 \/ KES 18.56/);
  assert.equal(app.element('connected-fee').disabled, true);
  assert.equal(app.previews().length, 2);
  assert.equal(app.previews()[0], originalReceipt);
  assert.match(app.previews()[1], /CU invoice no.\nDEMO-0001-FEE-RECEIPT/);
  assert.match(app.previews()[1], /Net\nKES 116.00\nSample VAT\nKES 18.56\nTotal\nKES 134.56/);
});

test('retail selection changes the workflow and returns one notebook at its original price and tax', () => {
  const app = simulator();
  assert.equal(app.element('connected-return').hidden, true);
  app.change('kind', 'retail');
  assert.equal(app.element('creator-example').hidden, true);
  assert.equal(app.element('retail-example').hidden, false);
  assert.equal(app.element('connected-fee').hidden, true);
  assert.match(app.element('connected-message').textContent, /Retail basket: KES 290.00/);
  app.click('run');
  assert.match(app.output(), /KES 290.00 \/ KES 40.00/);
  assert.match(app.previews()[0], /Synthetic notebook · 2 × KES 116.00\nKES 232.00/);
  assert.match(app.previews()[0], /Synthetic tote · 1 × KES 58.00\nKES 58.00/);
  app.click('return');
  assert.match(app.output(), /Partial return · one original notebook/);
  assert.match(app.output(), /KES 116.00 \/ KES 16.00/);
  assert.match(app.output(), /Return against original reference\nDEMO-0001/);
  const firstReturn = app.output();
  app.click('return');
  assert.equal(app.output(), firstReturn);
  assert.equal(app.element('connected-return').disabled, true);
  assert.equal(app.previews().length, 2);
  assert.match(app.previews()[1], /Original sale\nDEMO-0001/);
  assert.match(app.previews()[1], /Net\nKES 100.00\nSample VAT\nKES 16.00\nCredit amount\nKES 116.00/);
});

for (const scenario of ['AMBIGUOUS_TIMEOUT_AFTER_SIGN', 'HELD_BRANCH']) {
  test(scenario + ' illustrates lookup recovery without a replacement reference', () => {
    const app = simulator();
    app.change('scenario', scenario);
    assert.equal(app.element('connected-pending-note').hidden, scenario !== 'HELD_BRANCH');
    app.click('run');
    assert.match(app.output(), scenario === 'HELD_BRANCH' ? /PENDING_SYNC/ : /OUTCOME_UNKNOWN/);
    assert.deepEqual(app.previews(), []);
    assert.equal(app.element('connected-duplicate').disabled, true);
    assert.equal(app.element('connected-fee').disabled, true);
    assert.equal(app.element('connected-lookup').disabled, false);
    app.click('lookup');
    assert.match(app.output(), /Original lookup · same reference/);
    assert.match(app.output(), /SIGNED/);
    assert.match(app.output(), /DEMO-0001-RECEIPT/);
    assert.doesNotMatch(app.output(), /DEMO-0002/);
    assert.match(app.element('connected-message').textContent, /Local recovery illustration/);
    assert.equal(app.element('connected-duplicate').disabled, false);
    assert.equal(app.previews().length, 1);
    assert.match(app.previews()[0], /CU invoice no.\nDEMO-0001-RECEIPT/);
  });
}

test('changing residency clears stale figures and produces the selected withholding estimate', () => {
  const app = simulator();
  app.click('run');
  app.change('residency', 'nonresident');
  assert.equal(app.output(), '');
  assert.deepEqual(app.previews(), []);
  assert.match(app.element('connected-message').textContent, /20%/);
  assert.equal(app.element('connected-lookup').disabled, true);
  app.click('run');
  assert.match(app.output(), /Simulated withholding estimate\nKES 232.00/);
  assert.match(app.output(), /Projected payout · not paid\nKES 793.44/);
  assert.match(app.output(), /DEMO-0002/);
});

test('changing workflow or outcome clears old results and disables actions until run', () => {
  const app = simulator();
  for (const [selection, value] of [['kind', 'retail'], ['scenario', 'HELD_BRANCH']]) {
    app.click('run');
    app.change(selection, value);
    assert.equal(app.output(), '');
    assert.deepEqual(app.previews(), []);
    assert.equal(app.element('connected-lookup').disabled, true);
    assert.equal(app.element('connected-duplicate').disabled, true);
    assert.equal(app.element('connected-return').disabled, true);
    assert.equal(app.element('connected-fee').disabled, true);
  }
});
