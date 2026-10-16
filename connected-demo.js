(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const outcomes = {
    SUCCESS: 'Run to show a signed sample receipt.',
    HELD_BRANCH: 'Run to show a sale waiting behind an uncertain invoice. Look up the original reference to illustrate recovery.',
    AMBIGUOUS_TIMEOUT_AFTER_SIGN: 'Run to show an uncertain response after signing. Look up the original reference to recover the sample receipt.'
  };
  let sequence = 0, sale = null, fee = null, returned = null;

  function row(label, value) {
    const line = document.createElement('div');
    line.className = 'demo-split-row';
    for (const text of [label, value]) {
      const span = document.createElement('span');
      span.textContent = String(text);
      line.append(span);
    }
    $('connected-results').append(line);
  }
  function money(amount) { return 'KES ' + (amount / 100).toFixed(2); }
  function receipt(record, title) {
    row(title + ' · local illustration', record.status);
    row('Original reference', record.reference);
    row('Sample receipt number', record.status === 'SIGNED' ? record.number : 'Look up the original reference');
    row('Total / sample VAT', money(record.total) + ' / ' + money(record.vat));
  }
  function controls() {
    const retail = $('connected-kind').value === 'retail';
    $('creator-example').hidden = retail;
    $('retail-example').hidden = !retail;
    $('connected-return').hidden = !retail;
    $('connected-fee').hidden = retail;
    $('connected-pending-note').hidden = $('connected-scenario').value !== 'HELD_BRANCH';
    $('connected-lookup').disabled = !sale;
    $('connected-duplicate').disabled = !sale || sale.status !== 'SIGNED';
    $('connected-return').disabled = !sale || sale.status !== 'SIGNED' || !!returned;
    $('connected-fee').disabled = !sale || sale.status !== 'SIGNED' || !!fee;
  }
  function ready() {
    sale = null; fee = null; returned = null;
    $('connected-results').replaceChildren();
    const retail = $('connected-kind').value === 'retail';
    const withholding = $('connected-residency').value === 'nonresident' ? '20%' : '5%';
    $('connected-message').textContent = 'Local simulation · ' + (retail
      ? 'Retail basket: KES 290.00 including KES 40.00 sample VAT. '
      : 'Creator sale: KES 1,160.00; illustrative withholding ' + withholding + '. ')
      + outcomes[$('connected-scenario').value];
    controls();
  }
  function figures() {
    if (sale.kind === 'retail') return;
    const withholding = sale.nonresident ? 23200 : 5800;
    row('Simulated withholding estimate', money(withholding));
    row('Projected payout · not paid', money(sale.total - withholding - 13456));
    row('Fee before VAT / supplied sample fee VAT', money(11600) + ' / ' + money(1856));
    row('Gifts', 'Unresolved · excluded from calculation');
    row('Remittance / payment verification / KRA approval', 'Unsupported · no execution or verification');
  }
  function showSale(title) {
    $('connected-results').replaceChildren();
    receipt(sale, title);
    figures();
    if (fee) receipt(fee, 'Separate platform fee invoice');
    if (returned) {
      receipt(returned, 'Partial return · one original notebook');
      row('Return against original reference', sale.reference);
    }
    controls();
  }
  $('connected-run').addEventListener('click', () => {
    const kind = $('connected-kind').value;
    const scenario = $('connected-scenario').value;
    const reference = 'DEMO-' + String(++sequence).padStart(4, '0');
    sale = {kind, reference, number: reference + '-RECEIPT',
      total: kind === 'retail' ? 29000 : 116000,
      vat: kind === 'retail' ? 4000 : 16000,
      nonresident: $('connected-residency').value === 'nonresident',
      status: scenario === 'SUCCESS' ? 'SIGNED' : scenario === 'HELD_BRANCH' ? 'PENDING_SYNC' : 'OUTCOME_UNKNOWN'};
    fee = null; returned = null;
    showSale('Sale');
    if (scenario === 'HELD_BRANCH') row('Synthetic predecessor', reference + '-PREDECESSOR · OUTCOME_UNKNOWN');
    $('connected-message').textContent = sale.status === 'SIGNED'
      ? 'Local sample generated in your browser. No API request, fiscal signing or KRA submission occurred.'
      : 'Local illustration: ' + (scenario === 'HELD_BRANCH' ? 'the sale is pending behind an uncertain invoice. ' : 'the signing response is uncertain. ')
        + 'Look up the original reference to demonstrate recovery without submitting a replacement.';
  });
  $('connected-lookup').addEventListener('click', () => {
    if (!sale) return;
    const wasPending = sale.status === 'PENDING_SYNC';
    sale.status = 'SIGNED';
    showSale('Original lookup · same reference');
    $('connected-message').textContent = 'Local recovery illustration: ' + (wasPending
      ? 'the predecessor has resolved and the queued sale now has a sample receipt. '
      : 'lookup reveals the stored sample receipt. ')
      + 'The original reference is unchanged; no replacement sale was created.';
  });
  $('connected-duplicate').addEventListener('click', () => {
    if (!sale || sale.status !== 'SIGNED') return;
    showSale('Recovered duplicate · same sample receipt');
    $('connected-message').textContent = 'Local duplicate illustration: the same reference returns the same sample receipt. No second sale was created.';
  });
  $('connected-return').addEventListener('click', () => {
    if (!sale || sale.kind !== 'retail' || sale.status !== 'SIGNED' || returned) return;
    returned = {reference: sale.reference + '-RETURN', number: sale.reference + '-CREDIT', status: 'SIGNED', total: 11600, vat: 1600};
    showSale('Original retail sale');
    $('connected-message').textContent = 'Local return illustration: one notebook at its original KES 116.00 price, including KES 16.00 sample VAT. No actual credit note was issued.';
  });
  $('connected-fee').addEventListener('click', () => {
    if (!sale || sale.kind !== 'creator' || sale.status !== 'SIGNED' || fee) return;
    fee = {reference: sale.reference + '-FEE', number: sale.reference + '-FEE-RECEIPT', status: 'SIGNED', total: 13456, vat: 1856};
    showSale('Original creator sale');
    $('connected-message').textContent = 'Local fee illustration: a separate KES 134.56 sample invoice, including KES 18.56 sample VAT. No fiscal invoice was issued.';
  });
  ['kind', 'scenario', 'residency'].forEach(name => $('connected-' + name).addEventListener('change', ready));
  ready();
})();
