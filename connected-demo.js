(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  // Mirrors the backend simulator's scenarios (SandboxScenarioService.Scenario),
  // plus EVIDENCE_PENDING: a signed receipt held while its evidence is stored.
  const outcomes = {
    SUCCESS: {status: 'SIGNED', hint: 'Run to show a signed sample receipt.'},
    TERMINAL_REJECTION: {status: 'FAILED',
      hint: 'Run to show the control unit rejecting the sale. Lookup keeps reporting FAILED.'},
    SERVICE_UNAVAILABLE_BEFORE_SIGN: {status: 'PENDING_SYNC',
      hint: 'Run to show a sale queued before it reached the control unit. Lookup finds it signed once the queue sends it.'},
    AMBIGUOUS_TIMEOUT_AFTER_SIGN: {status: 'OUTCOME_UNKNOWN',
      hint: 'Run to show a timeout after signing. Lookup keeps reporting OUTCOME_UNKNOWN until an operator resolves it.'},
    EVIDENCE_PENDING: {status: 'RECONCILIATION_REQUIRED', failureCode: 'EVIDENCE_PENDING',
      hint: 'Run to show a signed receipt held while its evidence is stored. A later lookup finds it SIGNED.'}
  };
  const waiting = {
    PENDING_SYNC: 'Queued · look up the original reference',
    OUTCOME_UNKNOWN: 'None · awaiting operator resolution',
    RECONCILIATION_REQUIRED: 'Held · look up the original reference later',
    NOT_SENT: 'None · operator recorded not sent',
    FAILED: 'None · not signed'
  };
  // Operator resolution REJECTED is reported as FAILED (ReconciliationService).
  const resolved = {SIGNED: 'SIGNED', NOT_SENT: 'NOT_SENT', REJECTED: 'FAILED'};
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
  function node(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function preview(record) {
    if (record.status !== 'SIGNED') return;
    const details = node('details', 'receipt-preview');
    details.append(node('summary', '', 'See a sample receipt · ' + record.title));
    const paper = node('div', 'demo-receipt');
    paper.append(node('div', 'rc-sample', 'ILLUSTRATIVE SAMPLE'));
    paper.append(node('div', 'rc-nm rc-c', record.merchant));
    paper.append(node('p', 'rc-c', record.title));
    paper.append(node('hr', ''));
    const line = (label, value, className = '') => {
      const item = node('div', 'rc-row ' + className);
      item.append(node('span', '', label));
      item.append(node('span', '', value));
      paper.append(item);
    };
    for (const item of record.items) {
      line(item.name + ' · ' + item.quantity + ' × ' + money(item.unitPrice), money(item.quantity * item.unitPrice));
    }
    paper.append(node('hr', ''));
    line('Net', money(record.total - record.vat));
    line('Sample VAT', money(record.vat));
    line(record.originalReference ? 'Credit amount' : 'Total', money(record.total), 'rc-tot');
    paper.append(node('hr', ''));
    const fields = node('dl', 'rc-kv');
    for (const [label, value] of [
      ['Reference', record.reference],
      ...(record.originalReference ? [['Original sale', record.originalReference]] : []),
      ['CU invoice no.', record.number],
      ['SCU ID', 'DEMO-CONTROL-UNIT'],
      ['Receipt signature', 'Placeholder · not signed'],
      ['Preview created', record.created]
    ]) {
      fields.append(node('dt', '', label));
      fields.append(node('dd', '', value));
    }
    paper.append(fields);
    paper.append(node('p', 'rc-mut', 'Browser-generated illustration. Control-unit fields are placeholders; no fiscal signing or KRA submission occurred.'));
    details.append(paper);
    $('connected-receipts').append(details);
  }
  function receipt(record, title) {
    row(title + ' · local illustration', record.status);
    row('Original reference', record.reference);
    if (record.failureCode) row('Failure code', record.failureCode);
    row('Sample receipt number', record.status === 'SIGNED' ? record.number : waiting[record.status]);
    row('Total / sample VAT', money(record.total) + ' / ' + money(record.vat));
  }
  function controls() {
    const retail = $('connected-kind').value === 'retail';
    $('creator-example').hidden = retail;
    $('retail-example').hidden = !retail;
    $('connected-return').hidden = !retail;
    $('connected-fee').hidden = retail;
    $('connected-scenario-note').hidden = $('connected-scenario').value !== 'EVIDENCE_PENDING';
    $('connected-lookup').disabled = !sale;
    const uncertain = !!sale && sale.status === 'OUTCOME_UNKNOWN';
    $('connected-operator').hidden = !uncertain;
    $('connected-resolve').hidden = !uncertain;
    $('connected-resolve').disabled = !uncertain || !!sale.decision;
    $('connected-duplicate').disabled = !sale || sale.status !== 'SIGNED';
    $('connected-return').disabled = !sale || sale.status !== 'SIGNED' || !!returned;
    $('connected-fee').disabled = !sale || sale.status !== 'SIGNED' || !!fee;
  }
  function ready() {
    sale = null; fee = null; returned = null;
    $('connected-results').replaceChildren();
    $('connected-receipts').replaceChildren();
    const retail = $('connected-kind').value === 'retail';
    const withholding = $('connected-residency').value === 'nonresident' ? '20%' : '5%';
    $('connected-message').textContent = 'Local simulation · ' + (retail
      ? 'Retail basket: KES 290.00 including KES 40.00 sample VAT. '
      : 'Creator sale: KES 1,160.00; illustrative withholding ' + withholding + '. ')
      + outcomes[$('connected-scenario').value].hint;
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
    $('connected-receipts').replaceChildren();
    receipt(sale, title);
    preview(sale);
    figures();
    if (fee) {
      receipt(fee, 'Separate platform fee invoice');
      preview(fee);
    }
    if (returned) {
      receipt(returned, 'Partial return · one original notebook');
      row('Return against original reference', sale.reference);
      preview(returned);
    }
    controls();
  }
  $('connected-run').addEventListener('click', () => {
    const kind = $('connected-kind').value;
    const scenario = $('connected-scenario').value;
    const reference = 'DEMO-' + String(++sequence).padStart(4, '0');
    sale = {kind, reference, number: reference + '-RECEIPT',
      title: kind === 'retail' ? 'Retail sale' : 'Creator sale',
      merchant: kind === 'retail' ? 'DEMO RETAIL MERCHANT' : 'DEMO CREATOR',
      created: new Date().toISOString(),
      items: kind === 'retail'
        ? [{name: 'Synthetic notebook', quantity: 2, unitPrice: 11600}, {name: 'Synthetic tote', quantity: 1, unitPrice: 5800}]
        : [{name: 'Synthetic creator content', quantity: 1, unitPrice: 116000}],
      total: kind === 'retail' ? 29000 : 116000,
      vat: kind === 'retail' ? 4000 : 16000,
      nonresident: $('connected-residency').value === 'nonresident',
      status: outcomes[scenario].status, failureCode: outcomes[scenario].failureCode, lookups: 0, decision: null};
    fee = null; returned = null;
    showSale('Sale');
    $('connected-message').textContent = {
      SIGNED: 'Local sample generated in your browser. No API request, fiscal signing or KRA submission occurred.',
      FAILED: 'Local illustration: the control unit rejected the sale. Correct the cause before creating a new sale; don\u2019t resend this one.',
      PENDING_SYNC: 'Local illustration: the sale was queued before it reached the control unit. Look up the original reference; don\u2019t send a replacement.',
      OUTCOME_UNKNOWN: 'Local illustration: the response was lost after signing, so the outcome is uncertain. Don\u2019t resend. Lookup reports OUTCOME_UNKNOWN until an operator resolves it.',
      RECONCILIATION_REQUIRED: 'Local illustration: the receipt is signed but held while its evidence is stored. Look up the original reference later; don\u2019t resend.'
    }[sale.status];
  });
  $('connected-lookup').addEventListener('click', () => {
    if (!sale) return;
    sale.lookups += 1;
    const before = sale.status;
    // Only recoverable states change by themselves: the queue sends PENDING_SYNC
    // work, and evidence storage retries until a held receipt completes. An
    // uncertain outcome changes only through a recorded operator resolution.
    if (before === 'PENDING_SYNC') sale.status = 'SIGNED';
    if (before === 'OUTCOME_UNKNOWN' && sale.decision) sale.status = resolved[sale.decision];
    if (before === 'RECONCILIATION_REQUIRED' && sale.failureCode === 'EVIDENCE_PENDING' && sale.lookups >= 2) {
      sale.status = 'SIGNED';
      sale.failureCode = undefined;
    }
    showSale('Original lookup · same reference');
    let message;
    if (sale.status === 'SIGNED' && before !== 'SIGNED') message = before === 'PENDING_SYNC'
      ? 'the queue sent the sale and lookup finds its sample receipt. '
      : before === 'OUTCOME_UNKNOWN' ? 'an operator resolved the sale as SIGNED, so lookup returns its sample receipt. '
      : 'evidence storage completed and lookup finds the signed sample receipt. ';
    else if (sale.status === 'RECONCILIATION_REQUIRED') message = 'evidence storage is still retrying. Look up again later. ';
    else if (sale.status === 'OUTCOME_UNKNOWN') message = 'the outcome is still uncertain. An operator must resolve it as SIGNED, NOT_SENT or REJECTED. ';
    else if (sale.status === 'NOT_SENT') message = 'an operator recorded that the control unit never applied the sale. Any replay needs operator approval. ';
    else if (sale.status === 'FAILED') message = 'the sale was not signed. Correct the cause before creating a new sale. ';
    else message = 'lookup returns the stored sample receipt. ';
    $('connected-message').textContent = 'Local lookup illustration: ' + message
      + 'The original reference is unchanged; no replacement sale was created.';
  });
  $('connected-resolve').addEventListener('click', () => {
    if (!sale || sale.status !== 'OUTCOME_UNKNOWN' || sale.decision) return;
    sale.decision = $('connected-resolution').value;
    $('connected-resolve').disabled = true;
    $('connected-message').textContent = 'Local operator illustration: resolution ' + sale.decision
      + ' recorded with its evidence. Look up the original reference to see the result.';
  });
  $('connected-duplicate').addEventListener('click', () => {
    if (!sale || sale.status !== 'SIGNED') return;
    showSale('Recovered duplicate · same sample receipt');
    $('connected-message').textContent = 'Local duplicate illustration: the same reference returns the same sample receipt. No second sale was created.';
  });
  $('connected-return').addEventListener('click', () => {
    if (!sale || sale.kind !== 'retail' || sale.status !== 'SIGNED' || returned) return;
    returned = {reference: sale.reference + '-RETURN', number: sale.reference + '-CREDIT', status: 'SIGNED', total: 11600, vat: 1600,
      title: 'Notebook return · sample credit note', merchant: sale.merchant, originalReference: sale.reference,
      created: new Date().toISOString(), items: [{name: 'Synthetic notebook', quantity: 1, unitPrice: 11600}]};
    showSale('Original retail sale');
    $('connected-message').textContent = 'Local return illustration: one notebook at its original KES 116.00 price, including KES 16.00 sample VAT. No actual credit note was issued.';
  });
  $('connected-fee').addEventListener('click', () => {
    if (!sale || sale.kind !== 'creator' || sale.status !== 'SIGNED' || fee) return;
    fee = {reference: sale.reference + '-FEE', number: sale.reference + '-FEE-RECEIPT', status: 'SIGNED', total: 13456, vat: 1856,
      title: 'Separate platform fee', merchant: 'DEMO PLATFORM',
      created: new Date().toISOString(), items: [{name: 'Synthetic platform fee', quantity: 1, unitPrice: 13456}]};
    showSale('Original creator sale');
    $('connected-message').textContent = 'Local fee illustration: a separate KES 134.56 sample invoice, including KES 18.56 sample VAT. No fiscal invoice was issued.';
  });
  ['kind', 'scenario', 'residency'].forEach(name => $('connected-' + name).addEventListener('change', ready));
  ready();
})();
