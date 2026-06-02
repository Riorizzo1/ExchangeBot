async function getJson(url) {
  const res = await fetch(url);
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function deleteJson(url) {
  const res = await fetch(url, { method: 'DELETE' });
  return res.json();
}

function money(n) {
  const num = Number(n || 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
}

function retailValue(w, fallback = 0) {
  const explicit = Number(w?.retail_value || 0);
  return explicit > 0 ? explicit : Number(fallback || 0);
}

function dateShort(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function watchName(w = {}) {
  return w.display_name || [w.brand, w.model].filter(Boolean).join(' ') || 'Watch';
}

function ledgerRows(watches = [], transactions = []) {
  const rows = [];
  transactions.forEach(t => {
    rows.push({
      id: t.id,
      manual: true,
      date: t.date || t.created_at,
      type: t.type || 'Adjustment',
      watch: t.label || 'General ledger',
      detail: t.notes || '',
      cashOut: Number(t.cash_out || 0),
      cashIn: Number(t.cash_in || 0),
      tradeValue: Number(t.trade_value || 0),
      pl: Number(t.cash_in || 0) - Number(t.cash_out || 0) + Number(t.trade_value || 0),
      tone: Number(t.cash_in || 0) >= Number(t.cash_out || 0) ? 'positive' : 'cash-out'
    });
  });
  watches.forEach(w => {
    const name = watchName(w);
    const basis = Number(w.carried_basis ?? w.paid_value ?? 0);
    const paid = Number(w.paid_value || 0);
    const sold = Number(w.sold_value || 0);
    const tradeOut = Number(w.trade_out_value || 0);
    const tradeIn = Number(w.trade_in_value || 0);
    if (w.acquisition_type === 'monthly_payment') {
      rows.push({ date: w.created_at, type: 'Monthly comp', watch: name, detail: w.monthly_payment_period || 'Compensation watch received', cashOut: 0, cashIn: 0, tradeValue: paid, pl: Number(w.sale_delta || 0), tone: 'neutral' });
    } else if (w.acquisition_type === 'trade' && w.linked_trade_from_watch_id) {
      rows.push({ date: w.created_at, type: 'Trade acquired', watch: name, detail: `Incoming value ${money(tradeIn || paid)} • carried basis ${money(basis)}`, cashOut: 0, cashIn: 0, tradeValue: tradeIn || paid, pl: 0, tone: 'neutral' });
    } else if (paid) {
      const retail = retailValue(w, paid);
      const retailNote = retail && retail !== paid ? ` • retail ${money(retail)}` : '';
      rows.push({ date: w.created_at, type: 'Acquisition', watch: name, detail: `${w.factory || 'Factory n/a'}${w.reference ? ` • ${w.reference}` : ''}${retailNote}`, cashOut: paid, cashIn: 0, tradeValue: 0, pl: 0, tone: 'cash-out' });
    }
    const isIncomingTradeWatch = w.acquisition_type === 'trade' && !!w.linked_trade_from_watch_id;
    if (!isIncomingTradeWatch && (w.status === 'traded' || tradeOut || (w.traded_for_label && tradeIn))) {
      rows.push({ date: w.updated_at || w.created_at, type: 'Trade out', watch: name, detail: `${money(tradeOut || paid)} → ${money(tradeIn)}${w.traded_for_label ? ` • ${w.traded_for_label}` : ''}`, cashOut: 0, cashIn: 0, tradeValue: tradeIn - (tradeOut || paid), pl: Number(w.trade_delta || 0), tone: Number(w.trade_delta || 0) >= 0 ? 'positive' : 'negative' });
    }
    if (w.status === 'sold' && sold) {
      rows.push({ date: w.updated_at || w.created_at, type: 'Sale', watch: name, detail: `Basis ${money(basis)} → sold ${money(sold)}`, cashOut: 0, cashIn: sold, tradeValue: 0, pl: Number(w.sale_delta || 0), tone: Number(w.sale_delta || 0) >= 0 ? 'positive' : 'negative' });
    }
  });
  return rows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function renderAccounting(summary = {}, transactions = []) {
  const root = document.getElementById('accountingLedger');
  if (!root) return;
  const watches = summary.watches || [];
  const rows = ledgerRows(watches, transactions);
  const manualCashOut = transactions.reduce((sum, t) => sum + Number(t.cash_out || 0), 0);
  const manualCashIn = transactions.reduce((sum, t) => sum + Number(t.cash_in || 0), 0);
  const cashInvested = watches
    .filter(w => w.acquisition_type !== 'monthly_payment' && !w.linked_trade_from_watch_id)
    .reduce((sum, w) => sum + Number(w.paid_value || 0), 0) + manualCashOut;
  const salesRecovered = watches.reduce((sum, w) => sum + Number(w.sold_value || 0), 0) + manualCashIn;
  const outsideCashAdded = cashInvested - salesRecovered;
  const currentBasis = watches
    .filter(w => w.status === 'on_hand' || w.status === 'pending')
    .reduce((sum, w) => sum + Number(w.carried_basis || 0), 0);
  const onHandRetailValue = watches
    .filter(w => w.status === 'on_hand' || w.status === 'pending')
    .reduce((sum, w) => sum + retailValue(w, w.trade_in_value || w.paid_value || 0), 0);
  const compValue = watches
    .filter(w => w.acquisition_type === 'monthly_payment')
    .reduce((sum, w) => sum + Number(w.paid_value || 0), 0);
  const realized = Number(summary.totals?.realized_chain_total || 0);
  const tradeDelta = Number(summary.totals?.trade_delta || 0);
  const retailSpread = Number(summary.totals?.retail_spread_on_hand || Math.max(onHandRetailValue - currentBasis, 0));
  const cashPositionTone = outsideCashAdded <= 0 ? 'positive' : '';
  const recoveredPct = cashInvested > 0 ? Math.min(100, Math.round((salesRecovered / cashInvested) * 100)) : 0;
  root.innerHTML = `
    <div class="ledger-story-card">
      <div>
        <div class="section-kicker">Ledger story</div>
        <h2>${money(salesRecovered)} recycled. ${money(outsideCashAdded)} net added.</h2>
        <p>Because sale money gets rolled into the next watch, the key number is <strong>${money(outsideCashAdded)}</strong>: the net outside cash added after recycled proceeds. Monthly-comp sales count as recycled capital too — not money pulled out.</p>
      </div>
      <div class="ledger-story-meter" aria-label="Sales recovery progress">
        <span>${recoveredPct}% recovered</span>
        <div><i style="width:${recoveredPct}%"></i></div>
      </div>
    </div>

    <div class="ledger-flow-grid">
      <div class="ledger-flow-card ledger-flow-card-out">
        <span>Total purchases / costs</span>
        <strong>${money(cashInvested)}</strong>
        <p>All watch buys plus manual costs like shipping, fees, repairs, or adjustments — regardless of whether funded by recycled sale money.</p>
      </div>
      <div class="ledger-flow-arrow">−</div>
      <div class="ledger-flow-card ledger-flow-card-in">
        <span>Recycled sale proceeds</span>
        <strong>${money(salesRecovered)}</strong>
        <p>Money from sales that stayed in the watch ecosystem and helped fund the next unit.</p>
      </div>
      <div class="ledger-flow-arrow">=</div>
      <div class="ledger-flow-card ledger-flow-card-net ${cashPositionTone}">
        <span>Net outside cash added</span>
        <strong>${money(outsideCashAdded)}</strong>
        <p>What you personally had to add after recycled sales. If this hits zero, the hobby is self-funded.</p>
      </div>
    </div>

    <div class="ledger-explainer-grid">
      <details open>
        <summary><span>Current cash basis</span><strong>${money(currentBasis)}</strong></summary>
        <p>What the watches you still own are carrying as real cash basis. Trade-in watches carry the old basis forward instead of counting as brand-new outside cash.</p>
      </details>
      <details>
        <summary><span>On-hand retail value</span><strong>${money(onHandRetailValue)}</strong></summary>
        <p>The display/reference value of current inventory. When a retail value is set, it uses that; otherwise it falls back to the existing logged value.</p>
      </details>
      <details>
        <summary><span>Retail spread on hand</span><strong class="${retailSpread >= 0 ? 'ledger-positive' : 'ledger-negative'}">${retailSpread > 0 ? '+' : ''}${money(retailSpread)}</strong></summary>
        <p>Current retail/reference value minus real carried cash basis. This is unrealized value, not realized profit.</p>
      </details>
      <details>
        <summary><span>Realized P/L</span><strong class="${realized >= 0 ? 'ledger-positive' : 'ledger-negative'}">${realized > 0 ? '+' : ''}${money(realized)}</strong></summary>
        <p>Profit or loss only after a chain is actually closed by a sale. Open retail spread is kept separate so it doesn’t pretend to be final profit.</p>
      </details>
      <details>
        <summary><span>Trade value delta</span><strong class="${tradeDelta >= 0 ? 'ledger-positive' : 'ledger-negative'}">${tradeDelta > 0 ? '+' : ''}${money(tradeDelta)}</strong></summary>
        <p>Estimated value gained or lost from trades. Helpful context, but not cash in your pocket unless the chain later sells.</p>
      </details>
      <details>
        <summary><span>Monthly comp value</span><strong>${money(compValue)}</strong></summary>
        <p>Watches received as monthly compensation. They are not treated as cash you spent; if sold, that sale becomes recycled capital for future buys.</p>
      </details>
    </div>

    <div class="ledger-table-intro">
      <div>
        <div class="section-kicker">Event log</div>
        <h3>Every move underneath the summary</h3>
      </div>
      <p>Use this for the transaction trail: acquisitions, sales, trades, monthly-comp watches, and manual ledger adjustments.</p>
    </div>
    <div class="ledger-table-wrap">
      <div class="ledger-table-head"><span>Date</span><span>Event</span><span>Watch</span><span>Cash out</span><span>Cash in</span><span>Trade / P&L</span></div>
      ${rows.map(row => `
        <div class="ledger-row ledger-row-${row.tone}">
          <div class="ledger-date">${dateShort(row.date)}</div>
          <div><span class="ledger-type">${row.type}</span><small>${row.detail || ''}</small></div>
          <div class="ledger-watch">${row.watch}</div>
          <div class="ledger-money out">${row.cashOut ? money(row.cashOut) : '—'}</div>
          <div class="ledger-money in">${row.cashIn ? money(row.cashIn) : '—'}</div>
          <div class="ledger-money ${row.pl >= 0 ? 'ledger-positive' : 'ledger-negative'}">${row.tradeValue ? `${row.tradeValue > 0 ? '+' : ''}${money(row.tradeValue)}` : row.pl ? `${row.pl > 0 ? '+' : ''}${money(row.pl)}` : '—'}</div>
        </div>`).join('')}
    </div>
  `;
}

let latestWatches = [];
let currentEditWatchId = '';
let currentDisposeWatchId = '';
let editorMode = 'edit';
let tradeMode = 'sell';
let imagePreviewUrl = '';

function summaryValueClass(value) {
  const num = Number(value || 0);
  if (num > 0) return 'summary-value-positive';
  if (num < 0) return 'summary-value-negative';
  return '';
}

function realizedContributors(watches = []) {
  const byRoot = new Map();
  watches
    .filter(w => w.status === 'sold' && Number(w.sold_value || 0))
    .forEach(w => {
      const rootId = w.root_id || w.id;
      const chainMembers = watches.filter(candidate => (candidate.root_id || candidate.id) === rootId);
      const origin = chainMembers.find(candidate => candidate.id === rootId) || chainMembers[0] || w;
      const result = Number(w.chain_final_realized_pl ?? w.final_realized_pl ?? w.sale_delta ?? 0);
      byRoot.set(rootId, {
        id: rootId,
        soldWatch: watchName(w),
        originWatch: watchName(origin),
        soldValue: Number(w.sold_value || 0),
        originalBasis: Number(w.original_basis ?? w.carried_basis ?? w.paid_value ?? 0),
        carriedBasis: Number(w.carried_basis ?? w.paid_value ?? 0),
        result,
        closedAt: w.updated_at || w.created_at,
        steps: chainMembers
          .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
          .map(member => watchName(member))
      });
    });
  return Array.from(byRoot.values()).sort((a, b) => new Date(b.closedAt || 0) - new Date(a.closedAt || 0));
}

function renderSummary(summary) {
  const root = document.getElementById('summary');
  if (!root) return;
  const totalWatches = Number(summary.counts.total || 0);
  const onHand = Number(summary.counts.on_hand || 0);
  const outCount = Math.max(totalWatches - onHand, 0);
  const onHandRatio = totalWatches > 0 ? Math.max(0, Math.min(1, onHand / totalWatches)) : 0;
  const retailOnHand = Number(summary.totals.retail_on_hand || 0);
  const retailPaid = Number(summary.totals.retail_paid_value || 0);
  const retailTrade = Number(summary.totals.retail_trade_value || 0);
  const monthlyValue = Number(summary.totals.monthly_payment_value || 0);
  const lifetimeMonthlyValue = Number(summary.totals.lifetime_monthly_payment_value || 0);
  const chainTotal = Number(summary.totals.realized_chain_total || 0);
  const unrealizedChain = Number(summary.totals.unrealized_chain_total || 0);
  const retailSpread = Number(summary.totals.retail_spread_on_hand || 0);
  const totalUnrealizedRetail = Number(summary.totals.total_unrealized_retail || (retailSpread + unrealizedChain));
  const realizedRows = realizedContributors(summary.watches || []);
  root.innerHTML = `
    <div class="metric-card metric-card-dark metric-card-summary-combined">
      <div class="metric-summary-section">
        <div class="metric-summary-head">
          <div class="metric-label">Collection</div>
          <div class="metric-summary-icon">⌁</div>
        </div>
        <div class="metric-collection-row metric-collection-row-horizontal metric-collection-row-dark">
          <div class="metric-collection-total-wrap">
            <div class="metric-value metric-value-collection metric-value-collection-dark">${totalWatches}</div>
            <div class="metric-total-tag metric-total-tag-dark">TOTAL</div>
          </div>
          <div class="metric-collection-side-stats metric-collection-side-stats-dark">
            <div class="metric-collection-stat metric-collection-stat-on">● ${onHand} On Hand</div>
            <div class="metric-collection-stat">${outCount} Out</div>
          </div>
        </div>
        <div class="metric-progress-track metric-progress-track-dark"><div class="metric-progress-fill" style="width:${Math.round(onHandRatio * 100)}%"></div></div>
      </div>
      <div class="metric-summary-divider"></div>
      <div class="metric-summary-section">
        <div class="metric-summary-head">
          <div class="metric-label">Retail value</div>
          <div class="metric-summary-icon">◉</div>
        </div>
        <div class="metric-value metric-value-dark">${money(retailOnHand)}</div>
        <div class="metric-breakdown-list metric-breakdown-list-dark">
          <div class="metric-breakdown-row"><span><span class="metric-breakdown-dot paid"></span>Purchase watches</span><strong>${money(retailPaid)}</strong></div>
          <div class="metric-breakdown-row"><span><span class="metric-breakdown-dot trade"></span>Trade watches</span><strong>${money(retailTrade)}</strong></div>
          <div class="metric-breakdown-row"><span><span class="metric-breakdown-dot monthly"></span>Monthly comp watches</span><strong>${money(monthlyValue)}</strong></div>
        </div>
        <div class="metric-breakdown-bar">
          <span class="metric-breakdown-bar-seg paid" style="width:${retailOnHand ? (retailPaid / retailOnHand) * 100 : 0}%"></span>
          <span class="metric-breakdown-bar-seg trade" style="width:${retailOnHand ? (retailTrade / retailOnHand) * 100 : 0}%"></span>
          <span class="metric-breakdown-bar-seg monthly" style="width:${retailOnHand ? (monthlyValue / retailOnHand) * 100 : 0}%"></span>
        </div>
      </div>
    </div>
    <div class="metric-pill-row">
      <div class="metric-card metric-card-soft metric-card-pill metric-card-monthly-lifetime">
        <div class="metric-label">Lifetime monthly compensation</div>
        <div class="metric-value">${money(lifetimeMonthlyValue)}</div>
      </div>
      <div class="metric-card metric-card-soft metric-card-pill">
        <div class="metric-label">Unrealized retail spread</div>
        <div class="metric-value ${summaryValueClass(totalUnrealizedRetail)}">${totalUnrealizedRetail > 0 ? '+' : ''}${money(totalUnrealizedRetail)}</div>
        <div class="metric-subvalue">Retail/reference value minus carried basis${unrealizedChain ? ` • Trade context ${unrealizedChain > 0 ? '+' : ''}${money(unrealizedChain)}` : ''}</div>
      </div>
      <div class="metric-card metric-card-soft metric-card-pill metric-card-clickable" id="realizedSummaryCard" role="button" tabindex="0" aria-expanded="false" aria-controls="realizedDrilldown">
        <div class="metric-label">Realized</div>
        <div class="metric-value ${summaryValueClass(chainTotal)}">${chainTotal > 0 ? '+' : ''}${money(chainTotal)}</div>
        <div class="metric-subvalue">Tap to see closed sale contributors</div>
      </div>
    </div>
    <div class="realized-drilldown hidden" id="realizedDrilldown">
      <div class="realized-drilldown-head">
        <div>
          <div class="section-kicker">Realized profit detail</div>
          <h3>Closed chains behind ${chainTotal > 0 ? '+' : ''}${money(chainTotal)}</h3>
        </div>
        <span>${realizedRows.length} ${realizedRows.length === 1 ? 'sale' : 'sales'}</span>
      </div>
      ${realizedRows.length ? realizedRows.map(row => `
        <div class="realized-row">
          <div class="realized-row-main">
            <div class="realized-row-title">${row.soldWatch}</div>
            <div class="realized-row-meta">${row.originWatch !== row.soldWatch ? `Started as ${row.originWatch} • ` : ''}${dateShort(row.closedAt)}</div>
            ${row.steps.length > 1 ? `<div class="realized-row-chain">${row.steps.join(' → ')}</div>` : ''}
          </div>
          <div class="realized-row-numbers">
            <div><span>Sold</span><strong>${money(row.soldValue)}</strong></div>
            <div><span>Original basis</span><strong>${money(row.originalBasis)}</strong></div>
            <div><span>Carried basis</span><strong>${money(row.carriedBasis)}</strong></div>
            <div class="realized-row-result ${summaryValueClass(row.result)}"><span>Realized</span><strong>${row.result > 0 ? '+' : ''}${money(row.result)}</strong></div>
          </div>
        </div>`).join('') : `<div class="realized-empty">No closed sales yet.</div>`}
    </div>
  `;
  const realizedCard = document.getElementById('realizedSummaryCard');
  const realizedDrawer = document.getElementById('realizedDrilldown');
  const toggleRealized = () => {
    if (!realizedDrawer || !realizedCard) return;
    realizedDrawer.classList.toggle('hidden');
    realizedCard.setAttribute('aria-expanded', String(!realizedDrawer.classList.contains('hidden')));
  };
  realizedCard?.addEventListener('click', toggleRealized);
  realizedCard?.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleRealized();
    }
  });
}

function renderMonthlyLedger(monthly = {}) {
  const root = document.getElementById('monthlyLedger');
  if (!root) return;
  const watches = monthly.watches || [];
  if (!watches.length) {
    root.innerHTML = `<div class="monthly-empty">No monthly-payment watches logged yet.</div>`;
    return;
  }
  const total = watches.reduce((sum, w) => sum + Number(w.paid_value || 0), 0);
  const sold = watches.reduce((sum, w) => sum + Number(w.sold_value || 0), 0);
  const realized = watches.reduce((sum, w) => sum + Number(w.sale_delta || 0), 0);
  root.innerHTML = `
    <div class="monthly-ledger-summary">
      <div><span>Lifetime received</span><strong>${money(total)}</strong></div>
      <div><span>Entries</span><strong>${watches.length}</strong></div>
      <div><span>Sold proceeds</span><strong>${money(sold)}</strong></div>
      <div><span>Realized from sales</span><strong>${realized > 0 ? '+' : ''}${money(realized)}</strong></div>
    </div>
    <div class="monthly-ledger-table">
      ${watches.map((w, idx) => {
        const name = w.display_name || [w.brand, w.model].filter(Boolean).join(' ') || 'Watch';
        const status = String(w.status || '').replace('_', ' ');
        const outcome = w.status === 'sold'
          ? `Sold ${money(w.sold_value)} • Profit ${w.sale_delta > 0 ? '+' : ''}${money(w.sale_delta)}`
          : w.status === 'traded'
            ? `Traded • Retail logged ${money(w.paid_value)}`
            : `Still on hand • Cash basis ${money(w.carried_basis)}`;
        return `
          <div class="monthly-row" data-monthly-row="${idx}">
            <div class="monthly-row-main">
              <div class="monthly-row-title">${name}</div>
              <div class="monthly-row-meta">${w.monthly_payment_period || 'No period set'} • ${w.factory || 'Factory n/a'} • ${status}</div>
            </div>
            <div class="monthly-row-value">
              <span>Comp value</span>
              <strong>${money(w.paid_value)}</strong>
            </div>
            <div class="monthly-row-outcome">${outcome}</div>
          </div>
          <div class="monthly-drawer hidden" id="monthly-drawer-${idx}">
            <div>Retail/reference value: <strong>${money(w.paid_value)}</strong></div>
            <div>Actual cash basis: <strong>${money(w.carried_basis)}</strong></div>
            <div>Sale value: <strong>${money(w.sold_value)}</strong></div>
            <div>Notes: ${w.notes || '—'}</div>
          </div>`;
      }).join('')}
    </div>
  `;
  root.querySelectorAll('[data-monthly-row]').forEach(row => {
    row.addEventListener('click', () => {
      const drawer = document.getElementById(`monthly-drawer-${row.dataset.monthlyRow}`);
      if (drawer) drawer.classList.toggle('hidden');
    });
  });
}

function historyMarkup(w) {
  const blocks = [];
  if (w.acquisition_type === 'monthly_payment') {
    blocks.push(`<div class="event-block event-block-payment"><div class="event-title">Monthly payment watch</div><div class="event-detail">Counted in inventory value${w.monthly_payment_period ? ` • ${w.monthly_payment_period}` : ''}</div></div>`);
  }
  if (w.trade_result) {
    blocks.push(`<div class="event-block event-block-${w.trade_result}"><div class="event-title">Trade ${w.trade_result}</div><div class="event-detail">${money(w.trade_out_value || w.paid_value)} → ${money(w.trade_in_value || 0)}</div><div class="event-delta">${w.trade_delta > 0 ? '+' : ''}${money(w.trade_delta)} ${w.traded_for_label ? `• ${w.traded_for_label}` : ''}</div></div>`);
  }
  if (w.sale_result) {
    blocks.push(`<div class="event-block event-block-${w.sale_result}"><div class="event-title">Sale ${w.sale_result}</div><div class="event-detail">Basis ${money(w.carried_basis)} → ${money(w.sold_value)}</div><div class="event-delta">${w.sale_delta > 0 ? '+' : ''}${money(w.sale_delta)}</div></div>`);
  }
  if (w.linked_trade_from_watch_id || (w.lineage_path || []).length > 1) {
    const finalLine = w.chain_closed
      ? `Realized P/L ${w.chain_final_realized_pl > 0 ? '+' : ''}${money(w.chain_final_realized_pl)}`
      : `Unrealized ${w.chain_unrealized_delta > 0 ? '+' : ''}${money(w.chain_unrealized_delta)}`;
    blocks.push(`<div class="event-block"><div class="event-title">Chain provenance</div><div class="event-detail">${(w.lineage_path || []).join(' → ')}</div><div class="event-delta">Original basis ${money(w.original_basis)} • ${finalLine}</div></div>`);
  }
  return blocks.join('');
}

function tileMarkup(w, idx, kind = 'onhand') {
  const hasStructuredHistory = Boolean(w.trade_result || Number(w.sold_value || 0) || w.linked_trade_from_watch_id);
  const displayName = w.display_name || w.model || `${w.brand} ${w.model}`;
  const reference = w.reference || '';
  const explicitRetailValue = Number(w.retail_value || 0);
  const hasRetailValue = explicitRetailValue > 0;
  const fallbackFaceValue = Number(w.trade_in_value || 0) > 0 && w.status === 'on_hand' ? Number(w.trade_in_value) : Number(w.paid_value || 0);
  const faceValue = hasRetailValue ? explicitRetailValue : fallbackFaceValue;
  const paidValue = Number(w.paid_value || 0);
  const valueLabel = hasRetailValue
    ? 'Retail value'
    : w.acquisition_type === 'monthly_payment'
      ? 'Comp value'
      : w.acquisition_type === 'trade'
        ? 'Trade value'
        : 'Paid value';
  const paidLine = hasRetailValue && paidValue > 0 && faceValue !== paidValue
    ? `<div class="catalog-paid-value"><span>Paid</span><strong>${money(paidValue)}</strong></div>`
    : '';
  const statusPill = kind === 'onhand'
    ? `<div class="catalog-status-row"><span class="catalog-status-pill">● On hand</span></div>`
    : '';
  return `
    <div class="catalog-tile ${hasStructuredHistory ? 'catalog-tile-has-history' : ''}" data-card-index="${kind}-${idx}">
      <div class="catalog-frame ${hasStructuredHistory ? 'catalog-history-toggle' : ''}" ${hasStructuredHistory ? `data-history-card="${kind}-${idx}"` : ''}>
        ${statusPill}
        <div class="catalog-image-wrap">
          <div class="catalog-image-expand" data-expand-image="${w.web_image || ''}" data-expand-alt="${`${w.brand || ''} ${w.model || ''}`.trim()}">Expand</div>
          <div class="catalog-image">${w.web_image ? `<img src="${w.web_image}" alt="${w.brand} ${w.model}" loading="lazy" onerror="this.parentElement.classList.add('image-fallback'); this.remove();">` : ''}</div>
        </div>
      </div>
      <div class="catalog-topline">
        <div class="catalog-meta">${w.brand.toUpperCase()}${w.factory ? ` <span class="catalog-meta-sep">|</span> ${w.factory.toUpperCase()}` : ''}</div>
        <div class="catalog-reference">${reference}</div>
      </div>
      <div class="catalog-detail-row">
        <div class="catalog-name-block">
          <div class="catalog-title">${displayName}</div>
          ${w.acquisition_type === 'monthly_payment' ? '<div class="catalog-footnote">Monthly payment</div>' : ''}
          ${w.trade_result ? `<div class="catalog-footnote catalog-footnote-${w.trade_result}">${w.trade_result === 'win' ? `Trade surplus ${money(w.trade_delta)}` : w.trade_result === 'loss' ? `Trade loss ${money(Math.abs(w.trade_delta))}` : 'Even trade'}</div>` : ''}
          ${w.linked_trade_from_watch_id || (w.lineage_path || []).length > 1 ? `<div class="catalog-footnote catalog-footnote-stack"><span>Basis ${money(w.carried_basis)}</span><span>${w.chain_closed ? `Realized ${w.chain_final_realized_pl > 0 ? '+' : ''}${money(w.chain_final_realized_pl)}` : `Unrealized ${w.chain_unrealized_delta > 0 ? '+' : ''}${money(w.chain_unrealized_delta)}`}</span></div>` : ''}
        </div>
        <div class="catalog-price-block">
          <div class="catalog-value">${money(faceValue)}</div>
          <div class="catalog-value-label">${valueLabel}</div>
          ${paidLine}
        </div>
      </div>
      <div class="catalog-actions catalog-actions-reference ${hasStructuredHistory ? 'catalog-actions-has-details' : 'catalog-actions-no-details'}">
        <div class="catalog-action-group catalog-action-group-full">
          <button class="catalog-action-btn catalog-edit-btn" data-edit-card="${kind}-${idx}" type="button">Edit Details</button>
          ${kind === 'onhand'
            ? `<button class="catalog-action-btn" data-sell-card="${kind}-${idx}" type="button">Sell</button><button class="catalog-action-btn catalog-action-btn-primary" data-trade-card="${kind}-${idx}" type="button">Trade</button>`
            : hasStructuredHistory ? `<button class="catalog-action-btn" data-history-card="${kind}-${idx}" type="button">Details</button>` : ''}
        </div>
      </div>
      ${hasStructuredHistory ? `<div class="history-drawer hidden" id="history-${kind}-${idx}">${historyMarkup(w)}</div>` : ''}
    </div>
  `;
}

function openModal() {
  const modal = document.getElementById('editorModal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  const modal = document.getElementById('editorModal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.getElementById('formStatus').textContent = '';
  document.getElementById('uploadStatus').textContent = '';
  document.getElementById('deleteZone')?.classList.add('hidden');
  clearImagePreview();
  editorMode = 'edit';
}

function clearImagePreview() {
  const preview = document.getElementById('imagePreview');
  const img = document.getElementById('imagePreviewImg');
  const name = document.getElementById('imagePreviewName');
  if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
  imagePreviewUrl = '';
  if (img) img.src = '';
  if (name) name.textContent = 'Image selected';
  preview?.classList.add('hidden');
}

function showImagePreview(file) {
  clearImagePreview();
  if (!file) return;
  imagePreviewUrl = URL.createObjectURL(file);
  const preview = document.getElementById('imagePreview');
  const img = document.getElementById('imagePreviewImg');
  const name = document.getElementById('imagePreviewName');
  if (img) img.src = imagePreviewUrl;
  if (name) name.textContent = file.name || 'Image selected';
  preview?.classList.remove('hidden');
}

function openDisposeModal(watch, mode = 'sell') {
  currentDisposeWatchId = watch?.id || '';
  tradeMode = mode;
  const modal = document.getElementById('disposeModal');
  const title = document.getElementById('disposeTitle');
  const context = document.getElementById('disposeContext');
  const sellFields = document.getElementById('sellFields');
  const tradeFields = document.getElementById('tradeFields');
  const sellBtn = document.getElementById('sellModeBtn');
  const tradeBtn = document.getElementById('tradeModeBtn');
  const carriedBasis = watch?.carried_basis !== undefined && watch?.carried_basis !== null ? Number(watch.carried_basis) : Number(watch?.paid_value || 0);
  title.textContent = `${mode === 'sell' ? 'Sell' : 'Trade'} ${[watch?.brand, watch?.model].filter(Boolean).join(' ') || 'Watch'}`;
  context.innerHTML = `<div class="dispose-context-kicker">Current basis</div><div class="dispose-context-value">${money(carriedBasis)}</div><div class="dispose-context-note">${watch?.display_name || watch?.model || ''}</div>`;
  sellFields.classList.toggle('hidden', mode !== 'sell');
  tradeFields.classList.toggle('hidden', mode !== 'trade_new');
  sellBtn.classList.toggle('catalog-action-btn-primary', mode === 'sell');
  sellBtn.classList.toggle('catalog-edit-btn', mode !== 'sell');
  tradeBtn.classList.toggle('catalog-action-btn-primary', mode === 'trade_new');
  tradeBtn.classList.toggle('catalog-edit-btn', mode !== 'trade_new');
  document.getElementById('sellValueField').value = mode === 'sell' ? (watch?.sold_value || '') : '';
  document.getElementById('tradeOutFlow').value = watch?.trade_out_value || watch?.paid_value || '';
  document.getElementById('tradeInFlow').value = watch?.trade_in_value || '';
  document.getElementById('tradeNewBrand').value = '';
  document.getElementById('tradeNewModel').value = '';
  document.getElementById('tradeNewFactory').value = '';
  document.getElementById('tradeNewReference').value = '';
  document.getElementById('tradeNewNotes').value = '';
  document.getElementById('disposeStatus').textContent = '';
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeDisposeModal() {
  const modal = document.getElementById('disposeModal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.getElementById('disposeStatus').textContent = '';
  currentDisposeWatchId = '';
}

function fillEditor(watch, mode = 'edit') {
  const form = document.getElementById('watchForm');
  const safeWatch = watch || {};
  currentEditWatchId = safeWatch.id || '';
  editorMode = mode;
  form.elements.id.value = safeWatch.id || '';
  form.elements.brand.value = safeWatch.brand || '';
  form.elements.model.value = safeWatch.model || '';
  form.elements.factory.value = safeWatch.factory || '';
  form.elements.paid_value.value = safeWatch.paid_value || '';
  if (form.elements.retail_value) form.elements.retail_value.value = safeWatch.retail_value || '';
  form.elements.status.value = safeWatch.status || 'on_hand';
  form.elements.acquisition_type.value = safeWatch.acquisition_type || 'purchase';
  form.elements.display_name.value = safeWatch.display_name || '';
  form.elements.reference.value = safeWatch.reference || '';
  form.elements.notes.value = safeWatch.notes || '';
  const hasName = safeWatch.brand || safeWatch.model;
  document.getElementById('editorTitle').textContent = hasName ? `Edit ${[safeWatch.brand, safeWatch.model].filter(Boolean).join(' ')}` : 'Edit Details';
  document.getElementById('deleteZone')?.classList.toggle('hidden', !safeWatch.id);
  renderConditionalFields();
  if (form.elements.sold_value) form.elements.sold_value.value = safeWatch.sold_value || '';
  if (form.elements.traded_for_label) form.elements.traded_for_label.value = safeWatch.traded_for_label || '';
  if (form.elements.trade_out_value) form.elements.trade_out_value.value = safeWatch.trade_out_value || '';
  if (form.elements.trade_in_value) form.elements.trade_in_value.value = safeWatch.trade_in_value || '';
  if (form.elements.monthly_payment_period) form.elements.monthly_payment_period.value = safeWatch.monthly_payment_period || '';
  form.elements.cover_upload.value = '';
  openModal();
}

function openLightbox(src, alt = 'Expanded watch image') {
  if (!src) return;
  const lightbox = document.getElementById('imageLightbox');
  const image = document.getElementById('lightboxImage');
  if (!lightbox || !image) return;
  image.src = src;
  image.alt = alt;
  lightbox.classList.remove('hidden');
  lightbox.setAttribute('aria-hidden', 'false');
}

function closeLightbox() {
  const lightbox = document.getElementById('imageLightbox');
  const image = document.getElementById('lightboxImage');
  if (!lightbox || !image) return;
  lightbox.classList.add('hidden');
  lightbox.setAttribute('aria-hidden', 'true');
  image.src = '';
}

function bindCardActions(container) {
  container.querySelectorAll('.catalog-frame[data-history-card], button[data-history-card]').forEach(el => {
    el.addEventListener('click', event => {
      if (event.target.closest('[data-expand-image]')) return;
      event.stopPropagation();
      const idx = el.dataset.historyCard;
      const drawer = document.getElementById(`history-${idx}`);
      if (drawer) drawer.classList.toggle('hidden');
    });
  });
  container.querySelectorAll('[data-expand-image]').forEach(el => {
    el.addEventListener('click', event => {
      event.stopPropagation();
      openLightbox(el.dataset.expandImage, el.dataset.expandAlt || 'Expanded watch image');
    });
  });
  container.querySelectorAll('[data-edit-card]').forEach(el => {
    el.addEventListener('click', event => {
      event.stopPropagation();
      const watch = latestWatches.find(w => w._tileKey === el.dataset.editCard);
      if (watch) fillEditor(watch, 'edit');
    });
  });
  container.querySelectorAll('[data-sell-card]').forEach(el => {
    el.addEventListener('click', event => {
      event.stopPropagation();
      const watch = latestWatches.find(w => w._tileKey === el.dataset.sellCard);
      if (watch) openDisposeModal(watch, 'sell');
    });
  });
  container.querySelectorAll('[data-trade-card]').forEach(el => {
    el.addEventListener('click', event => {
      event.stopPropagation();
      const watch = latestWatches.find(w => w._tileKey === el.dataset.tradeCard);
      if (watch) openDisposeModal(watch, 'trade_new');
    });
  });
}

function renderInventory(onHand) {
  const list = document.getElementById('inventoryList');
  if (!list) return;
  if (!onHand.length) {
    list.innerHTML = `<div class="catalog-tile"><div class="catalog-image"></div><div class="catalog-meta">No watches yet</div><div class="catalog-title">Your current collection will appear here.</div></div>`;
    return;
  }
  list.innerHTML = onHand.map((w, idx) => tileMarkup(w, idx, 'onhand')).join('');
  bindCardActions(list);
}

function renderHistory(historical) {
  const list = document.getElementById('historyList');
  if (!list) return;
  if (!historical.length) {
    list.innerHTML = `<div class="catalog-tile"><div class="catalog-meta">No history yet</div><div class="catalog-title">Sold and traded watches will appear here.</div></div>`;
    return;
  }
  list.innerHTML = historical.map((w, idx) => tileMarkup(w, idx, 'history')).join('');
  bindCardActions(list);
}

function renderConditionalFields() {
  const status = document.getElementById('statusField').value;
  const acquisition = document.getElementById('acquisitionField').value;
  const watch = latestWatches.find(w => w.id === currentEditWatchId) || {};
  const root = document.getElementById('conditionalFields');
  const fields = [];
  if (status === 'sold') fields.push(`<label><span>Sold for</span><input name="sold_value" type="number" step="0.01" value="${watch.sold_value || ''}" /></label>`);
  if (status === 'traded' || acquisition === 'trade') {
    fields.push(`<label><span>Traded for</span><input name="traded_for_label" value="${watch.traded_for_label || ''}" /></label>`);
    fields.push(`<label><span>Trade out value</span><input name="trade_out_value" type="number" step="0.01" value="${watch.trade_out_value || ''}" /></label>`);
    fields.push(`<label><span>Trade in value</span><input name="trade_in_value" type="number" step="0.01" value="${watch.trade_in_value || ''}" /></label>`);
  }
  if (acquisition === 'monthly_payment') fields.push(`<label><span>Payment period</span><input name="monthly_payment_period" placeholder="Optional month or note" value="${watch.monthly_payment_period || ''}" /></label>`);
  root.innerHTML = fields.join('');
}

async function uploadImageIfNeeded(watchId) {
  const input = document.getElementById('imageUploadField');
  const uploadStatus = document.getElementById('uploadStatus');
  const file = input.files?.[0];
  if (!file || !watchId) return null;
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  uploadStatus.textContent = 'Uploading image...';
  const result = await postJson('/api/watch/upload-image', { id: watchId, filename: file.name, dataUrl });
  uploadStatus.textContent = result.error ? result.error : 'Image updated.';
  return result;
}

async function refresh() {
  const payload = await getJson('/api/inventory');
  const watches = payload.watches || [];
  const onHand = watches.filter(w => w.status === 'on_hand' || w.status === 'pending').map((w, idx) => ({ ...w, _tileKey: `onhand-${idx}` }));
  const history = watches.filter(w => w.status === 'sold' || w.status === 'traded').map((w, idx) => ({ ...w, _tileKey: `history-${idx}` }));
  latestWatches = [...onHand, ...history];
  renderSummary(payload.summary);
  renderMonthlyLedger(payload.summary?.monthly);
  renderAccounting(payload.summary, payload.transactions || []);
  renderInventory(onHand);
  renderHistory(history);
}

document.getElementById('refreshBtn').addEventListener('click', refresh);
document.getElementById('openCreateBtn')?.addEventListener('click', () => {
  fillEditor({ status: 'on_hand', acquisition_type: 'purchase' }, 'edit');
});
document.getElementById('statusField').addEventListener('change', renderConditionalFields);
document.getElementById('acquisitionField').addEventListener('change', renderConditionalFields);
document.getElementById('closeEditorBtn').addEventListener('click', closeModal);
document.getElementById('cancelEditorBtn')?.addEventListener('click', closeModal);
document.getElementById('deleteWatchBtn')?.addEventListener('click', async () => {
  if (!currentEditWatchId) return;
  const watch = latestWatches.find(w => w.id === currentEditWatchId) || {};
  const label = [watch.brand, watch.model].filter(Boolean).join(' ') || 'this watch';
  if (!confirm(`Delete ${label}? This removes it from inventory.`)) return;
  const status = document.getElementById('formStatus');
  const result = await deleteJson(`/api/watch/${encodeURIComponent(currentEditWatchId)}`);
  if (result.error) {
    status.textContent = result.error;
    return;
  }
  await refresh();
  closeModal();
});
document.getElementById('imageUploadField')?.addEventListener('change', event => {
  const file = event.currentTarget.files?.[0];
  const uploadStatus = document.getElementById('uploadStatus');
  if (uploadStatus) uploadStatus.textContent = file ? `Selected ${file.name}. Tap Save Changes to upload.` : '';
  showImagePreview(file);
});
document.querySelector('[data-close-modal="true"]').addEventListener('click', closeModal);
document.getElementById('closeDisposeBtn')?.addEventListener('click', closeDisposeModal);
document.getElementById('cancelDisposeBtn')?.addEventListener('click', closeDisposeModal);
document.querySelector('[data-close-dispose-modal="true"]')?.addEventListener('click', closeDisposeModal);
document.getElementById('sellModeBtn')?.addEventListener('click', () => {
  const watch = latestWatches.find(w => w.id === currentDisposeWatchId);
  if (watch) openDisposeModal(watch, 'sell');
});
document.getElementById('tradeModeBtn')?.addEventListener('click', () => {
  const watch = latestWatches.find(w => w.id === currentDisposeWatchId);
  if (watch) openDisposeModal(watch, 'trade_new');
});
document.getElementById('closeLightboxBtn')?.addEventListener('click', closeLightbox);
document.querySelector('[data-close-lightbox="true"]')?.addEventListener('click', closeLightbox);

document.getElementById('watchForm').addEventListener('submit', async event => {
  event.preventDefault();
  const formEl = event.currentTarget;
  const form = new FormData(formEl);
  const body = Object.fromEntries(form.entries());
  delete body.cover_upload;
  const status = document.getElementById('formStatus');
  const result = await postJson('/api/watch', body);
  if (result.error) {
    status.textContent = result.error;
    return;
  }
  await uploadImageIfNeeded(result.watch.id);
  status.textContent = 'Watch saved.';
  await refresh();
  closeModal();
});

document.getElementById('transactionForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const formEl = event.currentTarget;
  const body = Object.fromEntries(new FormData(formEl).entries());
  const status = document.getElementById('transactionStatus');
  const result = await postJson('/api/transaction', body);
  if (result.error) {
    if (status) status.textContent = result.error;
    return;
  }
  formEl.reset();
  if (status) status.textContent = 'Ledger entry added.';
  await refresh();
});

document.getElementById('disposeForm').addEventListener('submit', async event => {
  event.preventDefault();
  const status = document.getElementById('disposeStatus');
  const watch = latestWatches.find(w => w.id === currentDisposeWatchId);
  if (!watch) {
    status.textContent = 'Watch not found.';
    return;
  }

  if (tradeMode === 'sell') {
    const saleValue = document.getElementById('sellValueField')?.value || 0;
    const result = await postJson('/api/watch', {
      ...watch,
      status: 'sold',
      sold_value: saleValue,
    });
    if (result.error) {
      status.textContent = result.error;
      return;
    }
    await refresh();
    closeDisposeModal();
    return;
  }

  const result = await postJson('/api/trade', {
    outgoing_watch_id: watch.id,
    trade_out_value: document.getElementById('tradeOutFlow')?.value || watch.paid_value,
    trade_in_value: document.getElementById('tradeInFlow')?.value || 0,
    new_watch: {
      brand: document.getElementById('tradeNewBrand')?.value || '',
      model: document.getElementById('tradeNewModel')?.value || '',
      factory: document.getElementById('tradeNewFactory')?.value || '',
      reference: document.getElementById('tradeNewReference')?.value || '',
      notes: document.getElementById('tradeNewNotes')?.value || '',
      paid_value: document.getElementById('tradeInFlow')?.value || 0,
      retail_value: document.getElementById('tradeInFlow')?.value || 0,
    }
  });
  if (result.error) {
    status.textContent = result.error;
    return;
  }
  await refresh();
  closeDisposeModal();
});

refresh();
