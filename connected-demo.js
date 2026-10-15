(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let session = false, original = null, snapshot = null, uncertain = false;
  const buttons = ['run', 'lookup', 'duplicate', 'return', 'fee'];
  async function request(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/v2/preview' + path, {method: body ? 'POST' : 'GET', credentials:'same-origin',
        headers: body ? {'Content-Type':'application/json','X-Preview-Request':'1'} : {},
        body: body ? JSON.stringify(body) : undefined, signal:controller.signal});
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Simulator unavailable or request rejected.');
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Response timed out. Preserve the original reference and look it up before continuing.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  function row(label, value) {
    const line = document.createElement('div'); line.className = 'demo-split-row';
    for (const text of [label, value]) { const span=document.createElement('span'); span.textContent=String(text); line.append(span); }
    $('connected-results').append(line);
  }
  function receipt(sale, title) {
    row(title + ' · simulated', sale.status);
    row('Original reference', sale.clientReference || original);
    row('Receipt number', sale.cuInvoiceNumber || 'No signed receipt returned');
    row('Transaction identity', sale.purchaseId || sale.creditNoteId || 'Unavailable');
  }
  function controls(busy = false) {
    buttons.forEach(name => { $('connected-' + name).disabled = busy || (name !== 'run' && !snapshot); });
    $('connected-lookup').disabled = busy || !original;
    $('connected-duplicate').disabled = busy || !snapshot || uncertain;
    $('connected-return').disabled = busy || !snapshot || snapshot.status !== 'SIGNED';
    $('connected-fee').disabled = busy || !snapshot || uncertain;
    $('connected-run').disabled = busy || uncertain;
    ['kind','scenario','residency'].forEach(name => { $('connected-'+name).disabled=busy || uncertain; });
  }
  async function act(task) {
    controls(true); $('connected-message').textContent='Connecting to the bounded simulator…';
    try { await task(); $('connected-message').textContent='Simulator response received. All receipts and financial results are simulated.'; }
    catch(error) { $('connected-message').textContent=error.message + (original ? ' Original reference: '+original+'. Look up this reference; do not send a replacement.' : ' Connected examples are unavailable.'); }
    finally { controls(); }
  }
  function payload(reference) {
    const scenario=$('connected-scenario').value;
    return $('connected-kind').value === 'creator'
      ? {clientReference:reference,scenario,amount:1160,itemDescription:'Synthetic creator content sale'}
      : {clientReference:reference,scenario,items:[
        {sku:'DEMO-NOTEBOOK',itemNm:'Synthetic notebook',itemClsCd:'5059690800',taxTyCd:'B',qty:2,unitPrice:116},
        {sku:'DEMO-TOTE',itemNm:'Synthetic tote',itemClsCd:'5059690800',taxTyCd:'B',qty:1,unitPrice:58}]};
  }
  let originalBody, originalPath;
  $('connected-run').addEventListener('click',()=>act(async()=>{
    if(!session) {
      try { const existing=await request('/session'); if(existing.environment!=='SIMULATED' || existing.kraSubmission!==false) throw new Error('Unexpected environment'); }
      catch { const opened=await request('/public-demo',{}); if(opened.environment!=='SIMULATED'||opened.kraSubmission!==false) throw new Error('Simulator environment not confirmed.'); }
      session=true;
    }
    original='landing-'+crypto.randomUUID(); snapshot=null; uncertain=true;
    originalBody=payload(original); originalPath=$('connected-kind').value==='creator'?'/sample-sales':'/retail-sales';
    $('connected-results').replaceChildren(); row('Original reference',original);
    if($('connected-scenario').value==='HELD_BRANCH') {
      const predecessor=await request('/sample-sales',{clientReference:original+'-held',scenario:'AMBIGUOUS_TIMEOUT_AFTER_SIGN',amount:116});
      receipt(predecessor,'Uncertain synthetic predecessor');
      if(!['OUTCOME_UNKNOWN','RECONCILIATION_REQUIRED'].includes(predecessor.status)) throw new Error('The simulator did not establish a held branch.');
      originalBody.scenario='SUCCESS';
    }
    snapshot=await request(originalPath,originalBody);
    uncertain=['PENDING_SYNC','OUTCOME_UNKNOWN','RECONCILIATION_REQUIRED'].includes(snapshot.status);
    receipt(snapshot,'Sale');
    if($('connected-kind').value==='creator') {
      const calculation=await request('/demo-calculation',{reference:original,gross:1160,nonresident:$('connected-residency').value==='nonresident'});
      row('Simulated withholding estimate', 'KES '+calculation.calculatedWithholding);
      row('Projected payout · not paid', 'KES '+calculation.netPayable);
      row('Fee before VAT / supplied sample fee VAT','KES '+calculation.platformFee+' / '+calculation.platformFeeVat);
      row('Gifts','Unresolved · excluded from calculation');
      row('Remittance / payment verification / KRA approval','Unsupported · no execution or verification');
    } else {
      const recorded=await request('/retail-sales/search?clientReference='+encodeURIComponent(original));
      row('Recorded basket total / VAT','KES '+recorded.invoice.amount+' / '+recorded.invoice.taxAmount);
    }
  }));
  $('connected-lookup').addEventListener('click',()=>act(async()=>{
    snapshot=await request('/sales/search?clientReference='+encodeURIComponent(original));
    uncertain=['PENDING_SYNC','OUTCOME_UNKNOWN','RECONCILIATION_REQUIRED'].includes(snapshot.status);
    receipt(snapshot,'Original lookup');
  }));
  $('connected-duplicate').addEventListener('click',()=>act(async()=>{
    const recovered=await request(originalPath,originalBody);
    if(recovered.purchaseId!==snapshot.purchaseId) throw new Error('Duplicate recovery returned a different identity.');
    receipt(recovered,'Recovered duplicate · same identity');
  }));
  $('connected-return').addEventListener('click',()=>act(async()=>{
    receipt(await request('/demo-return',{originalReference:original}),'Partial return · one original notebook');
  }));
  $('connected-fee').addEventListener('click',()=>act(async()=>{
    receipt(await request('/sample-sales',{clientReference:original+'-fee',amount:134.56,itemDescription:'Synthetic separate platform fee invoice'}),'Separate platform fee invoice');
  }));
  $('connected-scenario').addEventListener('change',()=>{ $('connected-pending-note').hidden=$('connected-scenario').value!=='HELD_BRANCH'; });
  $('connected-kind').addEventListener('change',()=>{
    const retail=$('connected-kind').value==='retail';
    $('creator-example').hidden=retail; $('retail-example').hidden=!retail;
    $('connected-return').hidden=!retail; $('connected-fee').hidden=retail;
    snapshot=null; original=null; $('connected-results').replaceChildren(); controls();
  });
  controls();
})();
