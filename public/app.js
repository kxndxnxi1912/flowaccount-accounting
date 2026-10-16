const state = {
  view: 'dashboard',
  company: { locked: false },
  accounts: [],
  journals: [],
  assets: [],
  journalBookFilter: 'ALL',
  journalSearch: '',
  selectedGlAccount: 'ALL',
  glCategoryFilter: 'ALL',
  reportTab: 'TB', // TB | PL | BS
  coaFilter: 'ALL',
  editingJournalId: null,
  autoForm: {
    txType: 'SALE', // SALE | EXPENSE
    date: '2026-10-16',
    contact: 'บจก. นวภัทร เอ็นเตอร์ไพรส์',
    description: 'ค่าบริการที่ปรึกษาและพัฒนาระบบ',
    refDoc: 'INV202610003',
    primaryAccount: '41120',
    amount: 50000,
    vatMode: 'EXCL', // NONE | EXCL | INCL
    whtRate: 3, // 0 | 1 | 2 | 3 | 5
    paymentMethod: 'BANK' // BANK | CASH | CREDIT
  },
  jvLines: []
};

const CATEGORY_LABELS = {
  ASSET: '1 - สินทรัพย์',
  LIABILITY: '2 - หนี้สิน',
  EQUITY: '3 - ส่วนของผู้ถือหุ้น',
  REVENUE: '4 - รายได้',
  EXPENSE: '5 - ค่าใช้จ่าย'
};

const BOOK_LABELS = {
  SV: 'สมุดรายวันขาย (SV)',
  RV: 'สมุดรายวันรับ (RV)',
  UV: 'สมุดรายวันซื้อ (UV)',
  PV: 'สมุดรายวันจ่าย (PV)',
  JV: 'สมุดรายวันทั่วไป (JV)'
};

function fmt(num) {
  const n = Number(num || 0);
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

function openMobileSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebar-backdrop')?.classList.add('open');
}

function closeMobileSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('open');
}

function getAccount(code) {
  return state.accounts.find((a) => a.code === code) || {
    code,
    name: `บัญชี (${code})`,
    category: 'EXPENSE',
    normalSide: 'DR'
  };
}

function downloadCsv(filename, headers, rows) {
  const escapeCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ==========================================
// Core Accounting Engine (GL, TB, P&L, BS)
// ==========================================
function computeAccounting() {
  const ledgerMap = {};
  state.accounts.forEach((acc) => {
    ledgerMap[acc.code] = {
      ...acc,
      totalDr: 0,
      totalCr: 0,
      netBalance: 0,
      drBalance: 0,
      crBalance: 0,
      entries: []
    };
  });

  const sortedJournals = [...state.journals].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.docNo.localeCompare(b.docNo);
  });

  sortedJournals.forEach((j) => {
    j.lines.forEach((line) => {
      if (!ledgerMap[line.accountCode]) {
        ledgerMap[line.accountCode] = {
          code: line.accountCode,
          name: `บัญชี ${line.accountCode}`,
          category: 'EXPENSE',
          normalSide: 'DR',
          totalDr: 0,
          totalCr: 0,
          netBalance: 0,
          drBalance: 0,
          crBalance: 0,
          entries: []
        };
      }
      const acc = ledgerMap[line.accountCode];
      const dr = round2(line.debit);
      const cr = round2(line.credit);
      acc.totalDr = round2(acc.totalDr + dr);
      acc.totalCr = round2(acc.totalCr + cr);

      if (acc.normalSide === 'DR') {
        acc.netBalance = round2(acc.totalDr - acc.totalCr);
      } else {
        acc.netBalance = round2(acc.totalCr - acc.totalDr);
      }

      acc.entries.push({
        journalId: j.id,
        date: j.date,
        docNo: j.docNo,
        book: j.book,
        contact: j.contact,
        description: line.description || j.description,
        debit: dr,
        credit: cr,
        runningBalance: acc.netBalance
      });
    });
  });

  const accountsWithBalances = Object.values(ledgerMap).map((acc) => {
    const rawDiff = round2(acc.totalDr - acc.totalCr);
    return {
      ...acc,
      drBalance: rawDiff > 0 ? rawDiff : 0,
      crBalance: rawDiff < 0 ? Math.abs(rawDiff) : 0
    };
  });

  const tbTotalMovementDr = round2(accountsWithBalances.reduce((s, a) => s + a.totalDr, 0));
  const tbTotalMovementCr = round2(accountsWithBalances.reduce((s, a) => s + a.totalCr, 0));
  const tbTotalEndingDr = round2(accountsWithBalances.reduce((s, a) => s + a.drBalance, 0));
  const tbTotalEndingCr = round2(accountsWithBalances.reduce((s, a) => s + a.crBalance, 0));

  const revenues = accountsWithBalances.filter((a) => a.category === 'REVENUE' && (a.totalDr > 0 || a.totalCr > 0));
  const expenses = accountsWithBalances.filter((a) => a.category === 'EXPENSE' && (a.totalDr > 0 || a.totalCr > 0));
  const totalRevenue = round2(revenues.reduce((s, a) => s + (a.totalCr - a.totalDr), 0));
  const totalExpense = round2(expenses.reduce((s, a) => s + (a.totalDr - a.totalCr), 0));
  const netProfit = round2(totalRevenue - totalExpense);

  const assets = accountsWithBalances.filter((a) => a.category === 'ASSET' && (a.totalDr > 0 || a.totalCr > 0));
  const liabilities = accountsWithBalances.filter((a) => a.category === 'LIABILITY' && (a.totalDr > 0 || a.totalCr > 0));
  const equities = accountsWithBalances.filter((a) => a.category === 'EQUITY' && (a.totalDr > 0 || a.totalCr > 0));

  const totalAsset = round2(assets.reduce((s, a) => s + (a.totalDr - a.totalCr), 0));
  const totalLiability = round2(liabilities.reduce((s, a) => s + (a.totalCr - a.totalDr), 0));
  const totalEquityBase = round2(equities.reduce((s, a) => s + (a.totalCr - a.totalDr), 0));
  const totalEquityWithProfit = round2(totalEquityBase + netProfit);

  const cashAndBank = round2(
    (ledgerMap['11110'] ? ledgerMap['11110'].netBalance : 0) +
    (ledgerMap['11120'] ? ledgerMap['11120'].netBalance : 0)
  );

  const outputVat = ledgerMap['21510'] ? ledgerMap['21510'].netBalance : 0;
  const inputVat = ledgerMap['11510'] ? ledgerMap['11510'].netBalance : 0;
  const netVatPayable = round2(outputVat - inputVat);
  const whtPayable = ledgerMap['21610'] ? ledgerMap['21610'].netBalance : 0;
  const whtAsset = ledgerMap['11540'] ? ledgerMap['11540'].netBalance : 0;

  return {
    ledgerMap,
    accountsWithBalances,
    tbTotalMovementDr,
    tbTotalMovementCr,
    tbTotalEndingDr,
    tbTotalEndingCr,
    revenues,
    expenses,
    totalRevenue,
    totalExpense,
    netProfit,
    assets,
    liabilities,
    equities,
    totalAsset,
    totalLiability,
    totalEquityBase,
    totalEquityWithProfit,
    cashAndBank,
    outputVat,
    inputVat,
    netVatPayable,
    whtPayable,
    whtAsset
  };
}

// ==========================================
// Auto-Post Formula (SV/RV for Sales, UV/PV for Expenses)
// ==========================================
function buildAutoPostPreview(form) {
  const rawAmount = round2(form.amount);
  let baseAmount = rawAmount;
  let vatAmount = 0;

  if (form.vatMode === 'EXCL') {
    baseAmount = rawAmount;
    vatAmount = round2(rawAmount * 0.07);
  } else if (form.vatMode === 'INCL') {
    baseAmount = round2((rawAmount * 100) / 107);
    vatAmount = round2(rawAmount - baseAmount);
  }

  const invoiceTotal = round2(baseAmount + vatAmount);
  const whtRate = Number(form.whtRate || 0);
  const whtAmount = round2(baseAmount * (whtRate / 100));
  const netCash = round2(invoiceTotal - whtAmount);

  const lines = [];
  let book = 'JV';

  if (form.txType === 'SALE') {
    if (form.paymentMethod === 'CREDIT') {
      book = 'SV';
      lines.push({
        accountCode: '11310',
        description: `ลูกหนี้การค้า - ${form.contact}`,
        debit: invoiceTotal,
        credit: 0
      });
    } else {
      book = 'RV';
      const cashCode = form.paymentMethod === 'CASH' ? '11110' : '11120';
      lines.push({
        accountCode: cashCode,
        description: `รับเงินสุทธิ (${form.paymentMethod === 'CASH' ? 'เงินสด' : 'ธ.กสิกรไทย'})`,
        debit: netCash,
        credit: 0
      });
      if (whtAmount > 0) {
        lines.push({
          accountCode: '11540',
          description: `ภาษีเงินได้ถูกหัก ณ ที่จ่าย ${whtRate}%`,
          debit: whtAmount,
          credit: 0
        });
      }
    }

    lines.push({
      accountCode: form.primaryAccount || '41120',
      description: form.description,
      debit: 0,
      credit: baseAmount
    });

    if (vatAmount > 0) {
      lines.push({
        accountCode: '21510',
        description: 'ภาษีขาย 7%',
        debit: 0,
        credit: vatAmount
      });
    }
  } else {
    lines.push({
      accountCode: form.primaryAccount || '53130',
      description: form.description,
      debit: baseAmount,
      credit: 0
    });

    if (vatAmount > 0) {
      lines.push({
        accountCode: '11510',
        description: 'ภาษีซื้อ 7%',
        debit: vatAmount,
        credit: 0
      });
    }

    if (form.paymentMethod === 'CREDIT') {
      book = 'UV';
      lines.push({
        accountCode: '21210',
        description: `เจ้าหนี้การค้า - ${form.contact}`,
        debit: 0,
        credit: invoiceTotal
      });
    } else {
      book = 'PV';
      const cashCode = form.paymentMethod === 'CASH' ? '11110' : '11120';
      if (whtAmount > 0) {
        lines.push({
          accountCode: '21610',
          description: `ภาษีหัก ณ ที่จ่ายค้างจ่าย ${whtRate}%`,
          debit: 0,
          credit: whtAmount
        });
      }
      lines.push({
        accountCode: cashCode,
        description: `จ่ายเงินสุทธิ (${form.paymentMethod === 'CASH' ? 'เงินสด' : 'ธ.กสิกรไทย'})`,
        debit: 0,
        credit: netCash
      });
    }
  }

  const totalDr = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCr = round2(lines.reduce((s, l) => s + l.credit, 0));

  return {
    book,
    baseAmount,
    vatAmount,
    invoiceTotal,
    whtRate,
    whtAmount,
    netCash,
    lines,
    totalDr,
    totalCr
  };
}

// ==========================================
// View Renderers
// ==========================================
function render() {
  document.getElementById('nav-journal-count').textContent = state.journals.length;
  document.getElementById('nav-coa-count').textContent = state.accounts.length;

  const lockBtn = document.getElementById('btn-toggle-lock');
  const lockInfo = document.getElementById('period-lock-indicator');
  if (state.company.locked) {
    lockBtn.textContent = '🔒 ปลดล็อกงวด';
    lockBtn.style.borderColor = '#dc2626';
    lockBtn.style.color = '#dc2626';
    lockInfo.innerHTML = 'สถานะงวด: <strong style="color:#f87171;">ล็อกงวดแล้ว</strong>';
  } else {
    lockBtn.textContent = '🔓 ล็อกงวดบัญชี';
    lockBtn.style.borderColor = '';
    lockBtn.style.color = '';
    lockInfo.innerHTML = 'สถานะงวด: <strong style="color:#34d399;">เปิดใช้งาน</strong>';
  }

  document.querySelectorAll('.nav-btn, .mq-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === state.view);
  });

  const calc = computeAccounting();
  const container = document.getElementById('app-view');

  if (state.view === 'dashboard') {
    container.innerHTML = renderDashboard(calc);
  } else if (state.view === 'autopost') {
    container.innerHTML = renderAutoPost(calc);
    bindAutoPostEvents();
  } else if (state.view === 'journals') {
    container.innerHTML = renderJournals(calc);
    bindJournalsEvents();
  } else if (state.view === 'assets') {
    container.innerHTML = renderAssets(calc);
    bindAssetsEvents();
  } else if (state.view === 'ledger') {
    container.innerHTML = renderLedger(calc);
    bindLedgerEvents();
  } else if (state.view === 'reports') {
    container.innerHTML = renderReports(calc);
    bindReportsEvents();
  } else if (state.view === 'tax') {
    container.innerHTML = renderTax(calc);
    bindTaxEvents(calc);
  } else if (state.view === 'coa') {
    container.innerHTML = renderCoa(calc);
    bindCoaEvents();
  }
}

function renderDashboard(calc) {
  const profitMargin = calc.totalRevenue > 0 ? ((calc.netProfit / calc.totalRevenue) * 100).toFixed(1) : '0.0';

  const recentRows = state.journals.slice(0, 6).map((j) => {
    const drSum = j.lines.reduce((s, l) => s + l.debit, 0);
    return `
      <tr>
        <td><a class="drill-link" onclick="switchViewAndInspect('${j.id}')">${j.docNo}</a><div style="font-size:11.5px;color:var(--text-muted);">${j.date}</div></td>
        <td><span class="badge badge-${j.book.toLowerCase()}">${j.book}</span></td>
        <td>
          <div style="font-weight:600;">${j.description}</div>
          <div style="font-size:12px;color:var(--text-muted);">${j.contact} ${j.refDoc ? `· อ้างอิง ${j.refDoc}` : ''}</div>
        </td>
        <td class="num"><strong>${fmt(drSum)}</strong></td>
      </tr>
    `;
  }).join('');

  const activeBalances = calc.accountsWithBalances
    .filter((a) => a.totalDr > 0 || a.totalCr > 0)
    .slice(0, 8)
    .map((a) => `
      <tr>
        <td><span class="acc-code">${a.code}</span></td>
        <td><a class="drill-link" onclick="drillToGl('${a.code}')">${a.name}</a></td>
        <td><span class="badge ${a.normalSide === 'DR' ? 'badge-dr' : 'badge-cr'}">${a.normalSide}</span></td>
        <td class="num"><strong>${fmt(a.netBalance)}</strong></td>
      </tr>
    `).join('');

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">ภาพรวมบัญชี (Accounting Overview)</h1>
        <p class="page-desc">คลิกที่เลขที่เอกสารหรือชื่อบัญชีเพื่อเจาะลึก (Drill-down) ไปยังสมุดรายวันและบัญชีแยกประเภท</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline" onclick="switchView('reports')">งบทดลอง & งบการเงิน</button>
        <button class="btn btn-primary" onclick="switchView('autopost')">+ เปิดบิลลงบัญชีอัตโนมัติ</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label"><span>รายได้รวม (หมวด 4)</span><span class="badge badge-cr">Cr.</span></div>
        <div class="kpi-value" style="color:#059669;">฿${fmt(calc.totalRevenue)}</div>
        <div class="kpi-sub">สมุดรายวันขาย (SV) และรับ (RV)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label"><span>ค่าใช้จ่ายรวม (หมวด 5)</span><span class="badge badge-dr">Dr.</span></div>
        <div class="kpi-value" style="color:#dc2626;">฿${fmt(calc.totalExpense)}</div>
        <div class="kpi-sub">สมุดรายวันซื้อ (UV), จ่าย (PV), ทั่วไป (JV)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label"><span>กำไรสุทธิ</span><span class="badge badge-ok">${profitMargin}%</span></div>
        <div class="kpi-value" style="color:${calc.netProfit >= 0 ? '#0284c7' : '#dc2626'};">฿${fmt(calc.netProfit)}</div>
        <div class="kpi-sub">รายได้ หัก ค่าใช้จ่าย</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label"><span>เงินสดและธนาคาร</span><span class="acc-code">11110/11120</span></div>
        <div class="kpi-value">฿${fmt(calc.cashAndBank)}</div>
        <div class="kpi-sub">ลูกหนี้: ฿${fmt(calc.ledgerMap['11310']?.netBalance || 0)} · เจ้าหนี้: ฿${fmt(calc.ledgerMap['21210']?.netBalance || 0)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label"><span>ภ.พ.30 สุทธิ</span><span class="acc-code">21510 - 11510</span></div>
        <div class="kpi-value" style="color:${calc.netVatPayable >= 0 ? '#d97706' : '#059669'};">฿${fmt(Math.abs(calc.netVatPayable))}</div>
        <div class="kpi-sub">${calc.netVatPayable >= 0 ? 'ภาษีมูลค่าเพิ่มค้างจ่าย' : 'เครดิตภาษีซื้อยกไป'}</div>
      </div>
    </div>

    <div class="split-grid">
      <div class="card">
        <div class="card-header">
          <span class="card-title">สมุดรายวันล่าสุด (คลิกเลขที่เพื่อดูใบสำคัญ)</span>
          <button class="btn btn-outline btn-sm" onclick="switchView('journals')">ดูทั้งหมด (${state.journals.length})</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>เลขที่เอกสาร</th>
                <th>สมุด</th>
                <th>คำอธิบายรายการ</th>
                <th class="num">ยอดรวม (บาท)</th>
              </tr>
            </thead>
            <tbody>${recentRows}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">ยอดคงเหลือรายบัญชี (คลิกชื่อเพื่อดู GL)</span>
          <button class="btn btn-outline btn-sm" onclick="switchView('ledger')">ดู GL ทั้งหมด</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>ชื่อบัญชี</th>
                <th>ฝั่ง</th>
                <th class="num">ยอดคงเหลือสุทธิ</th>
              </tr>
            </thead>
            <tbody>${activeBalances}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ==========================================
// 2. Auto-Post View (เปิดบิลลงบัญชีอัตโนมัติ)
// ==========================================
function renderAutoPost() {
  const f = state.autoForm;
  const preview = buildAutoPostPreview(f);

  const primaryChoices = state.accounts.filter((a) =>
    f.txType === 'SALE' ? a.category === 'REVENUE' : a.category === 'EXPENSE' || a.category === 'ASSET'
  );

  const previewRows = preview.lines.map((line) => {
    const acc = getAccount(line.accountCode);
    return `
      <tr>
        <td><span class="acc-code">${acc.code}</span> ${acc.name}</td>
        <td style="font-size:12.5px;color:#cbd5e1;">${line.description}</td>
        <td class="num" style="color:#38bdf8;">${line.debit > 0 ? fmt(line.debit) : '-'}</td>
        <td class="num" style="color:#34d399;">${line.credit > 0 ? fmt(line.credit) : '-'}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">เปิดบิลลงบัญชีอัตโนมัติ (Auto-Post to GL)</h1>
        <p class="page-desc">บันทึกบิลขายหรือค่าใช้จ่าย ระบบแยก VAT 7% และหัก ณ ที่จ่ายเข้าสมุดรายวัน (SV, RV, UV, PV) อัตโนมัติ</p>
      </div>
    </div>

    <div class="split-grid">
      <div class="card">
        <div class="card-header">
          <span class="card-title">รายละเอียดบิล</span>
          <div class="tab-group">
            <button type="button" class="tab-pill ${f.txType === 'SALE' ? 'active' : ''}" data-tx="SALE">รายรับ (SV / RV)</button>
            <button type="button" class="tab-pill ${f.txType === 'EXPENSE' ? 'active' : ''}" data-tx="EXPENSE">รายจ่าย (UV / PV)</button>
          </div>
        </div>
        <div class="card-body">
          <div class="form-grid">
            <div class="field">
              <label>วันที่เอกสาร</label>
              <input type="date" class="input" id="ap-date" value="${f.date}" />
            </div>
            <div class="field">
              <label>เลขที่เอกสารอ้างอิง</label>
              <input type="text" class="input" id="ap-ref" value="${f.refDoc}" />
            </div>
          </div>

          <div class="form-grid">
            <div class="field">
              <label>${f.txType === 'SALE' ? 'ลูกค้า' : 'ผู้ขาย / ผู้รับเงิน'}</label>
              <input type="text" class="input" id="ap-contact" value="${f.contact}" />
            </div>
            <div class="field">
              <label>${f.txType === 'SALE' ? 'บัญชีรายได้' : 'บัญชีค่าใช้จ่าย/สินทรัพย์'}</label>
              <select id="ap-account">
                ${primaryChoices.map((a) => `<option value="${a.code}" ${a.code === f.primaryAccount ? 'selected' : ''}>${a.code} - ${a.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="field" style="margin-bottom:14px;">
            <label>คำอธิบายรายการ</label>
            <input type="text" class="input" id="ap-desc" value="${f.description}" />
          </div>

          <div class="form-grid">
            <div class="field">
              <label>จำนวนเงิน (บาท)</label>
              <input type="number" step="0.01" class="input" id="ap-amount" value="${f.amount}" />
            </div>
            <div class="field">
              <label>ภาษีมูลค่าเพิ่ม (VAT 7%)</label>
              <select id="ap-vat">
                <option value="EXCL" ${f.vatMode === 'EXCL' ? 'selected' : ''}>แยกนอก (VAT 7%)</option>
                <option value="INCL" ${f.vatMode === 'INCL' ? 'selected' : ''}>รวมใน (Included VAT 7%)</option>
                <option value="NONE" ${f.vatMode === 'NONE' ? 'selected' : ''}>ไม่มี VAT (0%)</option>
              </select>
            </div>
          </div>

          <div class="form-grid">
            <div class="field">
              <label>หัก ณ ที่จ่าย (WHT)</label>
              <select id="ap-wht">
                <option value="0" ${Number(f.whtRate) === 0 ? 'selected' : ''}>ไม่หัก (0%)</option>
                <option value="1" ${Number(f.whtRate) === 1 ? 'selected' : ''}>1% (ค่าขนส่ง)</option>
                <option value="2" ${Number(f.whtRate) === 2 ? 'selected' : ''}>2% (ค่าโฆษณา)</option>
                <option value="3" ${Number(f.whtRate) === 3 ? 'selected' : ''}>3% (ค่าบริการ/จ้างทำของ)</option>
                <option value="5" ${Number(f.whtRate) === 5 ? 'selected' : ''}>5% (ค่าเช่า)</option>
              </select>
            </div>
            <div class="field">
              <label>การชำระเงิน</label>
              <select id="ap-payment">
                <option value="BANK" ${f.paymentMethod === 'BANK' ? 'selected' : ''}>โอน ธ.กสิกรไทย (11120) -> ลง ${f.txType === 'SALE' ? 'RV' : 'PV'}</option>
                <option value="CASH" ${f.paymentMethod === 'CASH' ? 'selected' : ''}>เงินสด (11110) -> ลง ${f.txType === 'SALE' ? 'RV' : 'PV'}</option>
                <option value="CREDIT" ${f.paymentMethod === 'CREDIT' ? 'selected' : ''}>ตั้งหนี้ (${f.txType === 'SALE' ? 'ลูกหนี้ 11310 -> ลง SV' : 'เจ้าหนี้ 21210 -> ลง UV'})</option>
              </select>
            </div>
          </div>

          <div style="display:flex;justify-content:flex-end;margin-top:10px;">
            <button class="btn btn-primary" id="btn-submit-autopost" style="width:100%;">
              บันทึกและโพสต์ลง ${BOOK_LABELS[preview.book]}
            </button>
          </div>
        </div>
      </div>

      <div class="gl-preview-box">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:8px;flex-wrap:wrap;">
          <div>
            <div style="font-size:15px;font-weight:700;">คู่บัญชีที่จะบันทึก (GL Preview)</div>
            <div style="font-size:12px;color:#94a3b8;">สมุดรายวัน: <strong>${BOOK_LABELS[preview.book]}</strong></div>
          </div>
          <span class="badge badge-ok">Dr. = Cr.</span>
        </div>

        <div class="preview-metrics-grid">
          <div>
            <div style="color:#94a3b8;">มูลค่าก่อนภาษี</div>
            <div style="font-weight:700;font-size:14px;margin-top:2px;">฿${fmt(preview.baseAmount)}</div>
          </div>
          <div>
            <div style="color:#94a3b8;">VAT 7%</div>
            <div style="font-weight:700;font-size:14px;margin-top:2px;">฿${fmt(preview.vatAmount)}</div>
          </div>
          <div>
            <div style="color:#94a3b8;">หัก ณ ที่จ่าย (${preview.whtRate}%)</div>
            <div style="font-weight:700;font-size:14px;margin-top:2px;">฿${fmt(preview.whtAmount)}</div>
          </div>
          <div>
            <div style="color:#94a3b8;">${f.paymentMethod === 'CREDIT' ? 'ยอดตั้งหนี้' : 'รับ/จ่ายสุทธิ'}</div>
            <div style="font-weight:700;font-size:14px;color:#38bdf8;margin-top:2px;">฿${fmt(f.paymentMethod === 'CREDIT' ? preview.invoiceTotal : preview.netCash)}</div>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>บัญชี</th>
                <th>คำอธิบาย</th>
                <th class="num">เดบิต (Dr.)</th>
                <th class="num">เครดิต (Cr.)</th>
              </tr>
            </thead>
            <tbody>${previewRows}</tbody>
            <tfoot>
              <tr style="font-weight:700;border-top:1px solid rgba(255,255,255,0.2);">
                <td colspan="2">รวม</td>
                <td class="num" style="color:#38bdf8;">${fmt(preview.totalDr)}</td>
                <td class="num" style="color:#34d399;">${fmt(preview.totalCr)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  `;
}

function bindAutoPostEvents() {
  document.querySelectorAll('[data-tx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const txType = btn.dataset.tx;
      state.autoForm.txType = txType;
      if (txType === 'SALE') {
        state.autoForm.primaryAccount = '41120';
        state.autoForm.contact = 'บจก. นวภัทร เอ็นเตอร์ไพรส์';
        state.autoForm.description = 'ค่าบริการที่ปรึกษาและพัฒนาระบบ';
        state.autoForm.refDoc = 'INV202610003';
      } else {
        state.autoForm.primaryAccount = '53130';
        state.autoForm.contact = 'บจก. ครีเอทีฟ สตูดิโอ';
        state.autoForm.description = 'ค่าจ้างดูแลระบบและออกแบบสื่อ';
        state.autoForm.refDoc = 'EXP202610003';
      }
      render();
    });
  });

  const syncForm = () => {
    state.autoForm.date = document.getElementById('ap-date').value;
    state.autoForm.refDoc = document.getElementById('ap-ref').value;
    state.autoForm.contact = document.getElementById('ap-contact').value;
    state.autoForm.primaryAccount = document.getElementById('ap-account').value;
    state.autoForm.description = document.getElementById('ap-desc').value;
    state.autoForm.amount = parseFloat(document.getElementById('ap-amount').value || 0);
    state.autoForm.vatMode = document.getElementById('ap-vat').value;
    state.autoForm.whtRate = parseFloat(document.getElementById('ap-wht').value || 0);
    state.autoForm.paymentMethod = document.getElementById('ap-payment').value;
    render();
  };

  ['ap-date', 'ap-ref', 'ap-contact', 'ap-account', 'ap-desc', 'ap-amount', 'ap-vat', 'ap-wht', 'ap-payment'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', syncForm);
  });

  document.getElementById('btn-submit-autopost').addEventListener('click', async () => {
    const preview = buildAutoPostPreview(state.autoForm);
    const res = await fetch('/api/journals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        book: preview.book,
        date: state.autoForm.date,
        contact: state.autoForm.contact,
        description: state.autoForm.description,
        refDoc: state.autoForm.refDoc,
        meta: {
          subTotal: preview.baseAmount,
          vatRate: state.autoForm.vatMode === 'NONE' ? 0 : 7,
          vatAmount: preview.vatAmount,
          whtRate: preview.whtRate,
          whtAmount: preview.whtAmount,
          source: state.autoForm.txType === 'SALE' ? 'AUTO_SALES' : 'AUTO_EXPENSE'
        },
        lines: preview.lines
      })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'เกิดข้อผิดพลาด');

    state.journals = data.journals;
    showToast(`โพสต์ใบสำคัญ ${data.journal.docNo} เรียบร้อย`);
    state.view = 'journals';
    render();
  });
}

// ==========================================
// 3. Journals View (สมุดรายวัน 5 เล่ม: SV, RV, UV, PV, JV)
// ==========================================
function renderJournals() {
  const filtered = state.journals.filter((j) => {
    const bookOk = state.journalBookFilter === 'ALL' || j.book === state.journalBookFilter;
    const q = state.journalSearch.trim().toLowerCase();
    const searchOk =
      !q ||
      j.docNo.toLowerCase().includes(q) ||
      j.description.toLowerCase().includes(q) ||
      j.contact.toLowerCase().includes(q) ||
      (j.refDoc || '').toLowerCase().includes(q);
    return bookOk && searchOk;
  });

  const cardsHtml = filtered.map((j) => {
    const totalDr = j.lines.reduce((s, l) => s + l.debit, 0);
    const totalCr = j.lines.reduce((s, l) => s + l.credit, 0);
    const linesHtml = j.lines.map((l) => {
      const acc = getAccount(l.accountCode);
      return `
        <tr>
          <td style="width:34%;"><span class="acc-code">${acc.code}</span> <a class="drill-link" onclick="drillToGl('${acc.code}')">${acc.name}</a></td>
          <td style="width:36%;color:var(--text-muted);">${l.description || '-'}</td>
          <td class="num" style="width:15%;color:var(--dr-color);font-weight:${l.debit > 0 ? '600' : '400'};">${l.debit > 0 ? fmt(l.debit) : '-'}</td>
          <td class="num" style="width:15%;color:var(--cr-color);font-weight:${l.credit > 0 ? '600' : '400'};">${l.credit > 0 ? fmt(l.credit) : '-'}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="card" id="voucher-${j.id}">
        <div class="card-header">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="badge badge-${j.book.toLowerCase()}">${j.book}</span>
            <strong style="font-size:14.5px;">${j.docNo}</strong>
            <span style="color:var(--text-muted);font-size:13px;">${j.date}</span>
            <span style="color:var(--text-muted);font-size:13px;">· <strong>${j.contact}</strong></span>
            ${j.refDoc ? `<span class="acc-code">${j.refDoc}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <button class="btn btn-outline btn-sm" data-edit-journal="${j.id}">แก้ไข</button>
            <button class="btn btn-danger-ghost" data-del-journal="${j.id}">ลบ</button>
          </div>
        </div>
        <div style="padding:8px 16px;background:#fcfdfe;border-bottom:1px solid var(--border);font-size:13px;">
          <strong>คำอธิบาย:</strong> ${j.description}
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>รหัสบัญชี / ชื่อบัญชี</th>
                <th>คำอธิบายบรรทัด</th>
                <th class="num">เดบิต (Dr.)</th>
                <th class="num">เครดิต (Cr.)</th>
              </tr>
            </thead>
            <tbody>${linesHtml}</tbody>
            <tfoot>
              <tr class="row-total">
                <td colspan="2">รวม ${j.docNo}</td>
                <td class="num">${fmt(totalDr)}</td>
                <td class="num">${fmt(totalCr)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">สมุดรายวัน 5 เล่ม (SV / RV / UV / PV / JV)</h1>
        <p class="page-desc">SV ขาย · RV รับ · UV ซื้อ · PV จ่าย · JV ทั่วไป (คลิกชื่อบัญชีเพื่อเจาะลึกไปหน้า GL)</p>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" id="btn-preset-opening">+ ยอดยกมา</button>
        <button class="btn btn-outline btn-sm" id="btn-preset-salary">+ เงินเดือน</button>
        <button class="btn btn-outline btn-sm" id="btn-preset-closing">+ ปิดงวดเข้ากำไรสะสม</button>
        <button class="btn btn-primary btn-sm" id="btn-new-jv-page">+ สร้างใบสำคัญใหม่</button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="tab-group">
        ${['ALL', 'SV', 'RV', 'UV', 'PV', 'JV'].map((b) => `
          <button class="tab-pill ${state.journalBookFilter === b ? 'active' : ''}" data-book="${b}">
            ${b === 'ALL' ? 'ทั้งหมด' : BOOK_LABELS[b]}
          </button>
        `).join('')}
      </div>
      <input type="text" class="input" id="journal-search" placeholder="ค้นหาเลขที่เอกสาร, คู่ค้า, คำอธิบาย..." value="${state.journalSearch}" style="width:260px;" />
    </div>

    ${cardsHtml || `<div class="card"><div class="card-body" style="text-align:center;color:var(--text-muted);">ไม่พบรายการสมุดรายวัน</div></div>`}
  `;
}

function bindJournalsEvents() {
  document.querySelectorAll('[data-book]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.journalBookFilter = btn.dataset.book;
      render();
    });
  });

  const searchEl = document.getElementById('journal-search');
  if (searchEl) {
    searchEl.addEventListener('input', (e) => {
      state.journalSearch = e.target.value;
      render();
      const inputAfter = document.getElementById('journal-search');
      if (inputAfter) {
        inputAfter.focus();
        inputAfter.setSelectionRange(inputAfter.value.length, inputAfter.value.length);
      }
    });
  }

  document.getElementById('btn-new-jv-page')?.addEventListener('click', () => openJvModal());

  document.getElementById('btn-preset-opening')?.addEventListener('click', () => {
    openJvModal({
      book: 'JV',
      date: '2026-10-01',
      contact: 'ยอดยกมาต้นงวด',
      refDoc: 'OPEN-BAL',
      description: 'บันทึกยอดยกมาต้นงวดจากงบแสดงฐานะการเงินปีก่อน',
      lines: [
        { accountCode: '11110', description: 'เงินสดยกมา', debit: 20000, credit: 0 },
        { accountCode: '32110', description: 'กำไรสะสมยกมา', debit: 0, credit: 20000 }
      ]
    });
  });

  document.getElementById('btn-preset-salary')?.addEventListener('click', () => {
    openJvModal({
      book: 'PV',
      date: '2026-10-31',
      contact: 'พนักงานบริษัท',
      refDoc: 'PAY-202610',
      description: 'จ่ายเงินเดือนพนักงาน ต.ค. และหักภาษี ณ ที่จ่าย (ภ.ง.ด.1)',
      lines: [
        { accountCode: '52110', description: 'เงินเดือนและค่าจ้าง ต.ค.', debit: 45000, credit: 0 },
        { accountCode: '21610', description: 'ภาษีหัก ณ ที่จ่ายค้างจ่าย (ภ.ง.ด.1)', debit: 0, credit: 1500 },
        { accountCode: '11120', description: 'โอนเงินเดือนสุทธิจาก ธ.กสิกรไทย', debit: 0, credit: 43500 }
      ]
    });
  });

  document.getElementById('btn-preset-closing')?.addEventListener('click', () => {
    const calc = computeAccounting();
    const lines = [];
    calc.revenues.forEach((r) => {
      const bal = round2(r.totalCr - r.totalDr);
      if (bal > 0) lines.push({ accountCode: r.code, description: `ปิดบัญชีรายได้ ${r.name}`, debit: bal, credit: 0 });
    });
    calc.expenses.forEach((e) => {
      const bal = round2(e.totalDr - e.totalCr);
      if (bal > 0) lines.push({ accountCode: e.code, description: `ปิดบัญชีค่าใช้จ่าย ${e.name}`, debit: 0, credit: bal });
    });
    if (calc.netProfit >= 0) {
      lines.push({ accountCode: '32110', description: 'โอนกำไรสุทธิเข้ากำไรสะสม', debit: 0, credit: calc.netProfit });
    } else {
      lines.push({ accountCode: '32110', description: 'โอนขาดทุนสุทธิเข้ากำไรสะสม', debit: Math.abs(calc.netProfit), credit: 0 });
    }
    if (lines.length < 2) return alert('บัญชีรายได้และค่าใช้จ่ายถูกปิดหมดแล้ว');

    openJvModal({
      book: 'JV',
      date: '2026-10-31',
      contact: 'รายการปิดงวดบัญชี',
      refDoc: 'CLOSE-202610',
      description: 'ปิดบัญชีหมวดรายได้ (หมวด 4) และค่าใช้จ่าย (หมวด 5) เข้ากำไรสะสม (32110)',
      lines
    });
  });

  document.querySelectorAll('[data-edit-journal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const j = state.journals.find((x) => x.id === btn.dataset.editJournal);
      if (j) openJvModal(j, j.id);
    });
  });

  document.querySelectorAll('[data-del-journal]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.delJournal;
      if (!confirm('ต้องการลบใบสำคัญนี้ใช่หรือไม่?')) return;
      const res = await fetch(`/api/journals/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return alert(data.error || 'ลบไม่สำเร็จ');
      state.journals = data.journals;
      showToast('ลบใบสำคัญเรียบร้อย');
      render();
    });
  });
}

// ==========================================
// 4. Fixed Assets & Depreciation
// ==========================================
function renderAssets(calc) {
  const accumPosted = calc.ledgerMap['12120']?.netBalance || 0;

  const assetRows = state.assets.map((ast) => {
    const depreciable = Math.max(0, ast.cost - ast.salvage);
    const annualDepr = round2(depreciable / ast.usefulLifeYears);
    const monthlyDepr = round2(annualDepr / 12);
    const netBookValue = round2(ast.cost - ast.accumDeprPrior - accumPosted);
    return `
      <tr>
        <td><span class="acc-code">${ast.code}</span></td>
        <td><strong>${ast.name}</strong><div style="font-size:12px;color:var(--text-muted);">วันที่ซื้อ: ${ast.purchaseDate} · อายุใช้งาน ${ast.usefulLifeYears} ปี</div></td>
        <td class="num">${fmt(ast.cost)}</td>
        <td class="num">${fmt(ast.salvage)}</td>
        <td class="num" style="color:var(--dr-color);font-weight:600;">${fmt(monthlyDepr)}</td>
        <td class="num"><strong>${fmt(Math.max(0, netBookValue))}</strong></td>
        <td style="text-align:right;">
          <button class="btn btn-primary btn-sm" data-post-depr="${ast.id}" data-amt="${monthlyDepr}" data-name="${ast.name}">
            โพสต์ค่าเสื่อมลง JV
          </button>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">จัดการสินทรัพย์และค่าเสื่อมราคา (Asset Management)</h1>
        <p class="page-desc">คำนวณค่าเสื่อมราคาวิธีเส้นตรง (Straight-Line) และโพสต์คู่บัญชี Dr. ค่าเสื่อมราคา (53210) / Cr. ค่าเสื่อมราคาสะสม (12120)</p>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">เพิ่มทะเบียนสินทรัพย์ถาวร / สินทรัพย์ยกมา</span>
      </div>
      <div class="card-body">
        <div class="form-grid" style="margin-bottom:0;">
          <div class="field">
            <label>ชื่อสินทรัพย์</label>
            <input type="text" class="input" id="ast-name" placeholder="เช่น เครื่องพิมพ์เลเซอร์ / โต๊ะทำงาน" />
          </div>
          <div class="field">
            <label>วันที่เริ่มใช้งาน</label>
            <input type="date" class="input" id="ast-date" value="2026-10-01" />
          </div>
          <div class="field">
            <label>ราคาทุน (บาท)</label>
            <input type="number" class="input" id="ast-cost" value="36000" />
          </div>
          <div class="field">
            <label>อายุการใช้งาน (ปี)</label>
            <input type="number" class="input" id="ast-life" value="5" min="1" max="20" />
          </div>
          <div class="field" style="justify-content:flex-end;">
            <button class="btn btn-primary" id="btn-add-asset">+ เพิ่มสินทรัพย์</button>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">รายการสินทรัพย์และตารางคำนวณค่าเสื่อมราคา</span>
        <span style="font-size:12.5px;color:var(--text-muted);">ค่าเสื่อมราคาสะสมใน GL (12120) ปัจจุบัน: <strong>฿${fmt(accumPosted)}</strong></span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>รหัส</th>
              <th>ชื่อสินทรัพย์</th>
              <th class="num">ราคาทุน</th>
              <th class="num">ราคาซาก</th>
              <th class="num">ค่าเสื่อมต่อเดือน</th>
              <th class="num">มูลค่าตามบัญชีสุทธิ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${assetRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function bindAssetsEvents() {
  document.getElementById('btn-add-asset')?.addEventListener('click', async () => {
    const name = document.getElementById('ast-name').value.trim();
    const purchaseDate = document.getElementById('ast-date').value;
    const cost = parseFloat(document.getElementById('ast-cost').value || 0);
    const usefulLifeYears = parseInt(document.getElementById('ast-life').value || 5, 10);

    const res = await fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, purchaseDate, cost, usefulLifeYears, salvage: 0 })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'ไม่สามารถเพิ่มสินทรัพย์ได้');
    state.assets = data.assets;
    showToast(`เพิ่มสินทรัพย์ ${data.asset.code} เรียบร้อย`);
    render();
  });

  document.querySelectorAll('[data-post-depr]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const amt = parseFloat(btn.dataset.amt);
      const name = btn.dataset.name;
      const res = await fetch('/api/journals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book: 'JV',
          date: '2026-10-31',
          contact: 'ค่าเสื่อมราคาสินทรัพย์',
          refDoc: 'DEPR-202610',
          description: `บันทึกค่าเสื่อมราคาประจำเดือน: ${name}`,
          lines: [
            { accountCode: '53210', description: `ค่าเสื่อมราคา - ${name}`, debit: amt, credit: 0 },
            { accountCode: '12120', description: `ค่าเสื่อมราคาสะสม - ${name}`, debit: 0, credit: amt }
          ]
        })
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error || 'บันทึกไม่สำเร็จ');
      state.journals = data.journals;
      showToast(`โพสต์ค่าเสื่อมราคา ฿${fmt(amt)} ลงสมุดรายวัน ${data.journal.docNo} แล้ว`);
      render();
    });
  });
}

// ==========================================
// 5. General Ledger View (บัญชีแยกประเภท - GL)
// ==========================================
function renderLedger(calc) {
  const activeAccounts = calc.accountsWithBalances.filter(
    (a) =>
      (state.glCategoryFilter === 'ALL' || a.category === state.glCategoryFilter) &&
      (a.entries.length > 0 || a.code === state.selectedGlAccount)
  );

  const displayedAccounts =
    state.selectedGlAccount === 'ALL'
      ? activeAccounts
      : calc.accountsWithBalances.filter((a) => a.code === state.selectedGlAccount);

  const glCards = displayedAccounts.map((acc) => {
    const rows = acc.entries.map((e) => `
      <tr>
        <td>${e.date}</td>
        <td><span class="badge badge-${e.book.toLowerCase()}">${e.book}</span> <a class="drill-link" onclick="switchViewAndInspect('${e.journalId}')">${e.docNo}</a></td>
        <td>${e.description} <span style="color:var(--text-muted);font-size:12px;">(${e.contact})</span></td>
        <td class="num" style="color:var(--dr-color);">${e.debit > 0 ? fmt(e.debit) : '-'}</td>
        <td class="num" style="color:var(--cr-color);">${e.credit > 0 ? fmt(e.credit) : '-'}</td>
        <td class="num"><strong>${fmt(e.runningBalance)}</strong> <span style="font-size:11px;color:var(--text-muted);">(${acc.normalSide})</span></td>
      </tr>
    `).join('');

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <span class="acc-code">${acc.code}</span>
            <strong style="font-size:15px;margin-left:6px;">${acc.name}</strong>
            <span style="color:var(--text-muted);font-size:12.5px;margin-left:8px;">(${CATEGORY_LABELS[acc.category]} · ฝั่งปกติ ${acc.normalSide})</span>
          </div>
          <div>
            <span style="font-size:13px;color:var(--text-muted);">คงเหลือปลายงวด:</span>
            <strong style="font-size:15px;margin-left:6px;">฿${fmt(acc.netBalance)} (${acc.normalSide})</strong>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:12%;">วันที่</th>
                <th style="width:16%;">เลขที่เอกสาร</th>
                <th style="width:34%;">คำอธิบายรายการ</th>
                <th class="num" style="width:12%;">เดบิต (Dr.)</th>
                <th class="num" style="width:12%;">เครดิต (Cr.)</th>
                <th class="num" style="width:14%;">ยอดคงเหลือสะสม</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">ไม่มีรายการเคลื่อนไหว</td></tr>`}
            </tbody>
            <tfoot>
              <tr class="row-total">
                <td colspan="3">รวมบัญชี ${acc.code} - ${acc.name}</td>
                <td class="num">${fmt(acc.totalDr)}</td>
                <td class="num">${fmt(acc.totalCr)}</td>
                <td class="num">${fmt(acc.netBalance)} (${acc.normalSide})</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">บัญชีแยกประเภท (General Ledger - GL)</h1>
        <p class="page-desc">คลิกที่เลขที่เอกสารเพื่อย้อนกลับไปดูใบสำคัญต้นทางในสมุดรายวัน</p>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <button class="btn btn-outline btn-sm" id="btn-export-gl">⬇ Export Excel (CSV)</button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="tab-group">
        ${['ALL', 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((c) => `
          <button class="tab-pill ${state.glCategoryFilter === c ? 'active' : ''}" data-gl-cat="${c}">
            ${c === 'ALL' ? 'ทุกหมวด' : CATEGORY_LABELS[c]}
          </button>
        `).join('')}
      </div>
      <select id="gl-account-select" style="width:260px;">
        <option value="ALL" ${state.selectedGlAccount === 'ALL' ? 'selected' : ''}>แสดงทุกบัญชีที่มีรายการเคลื่อนไหว</option>
        ${state.accounts.map((a) => `<option value="${a.code}" ${state.selectedGlAccount === a.code ? 'selected' : ''}>${a.code} - ${a.name}</option>`).join('')}
      </select>
    </div>

    ${glCards}
  `;
}

function bindLedgerEvents() {
  document.querySelectorAll('[data-gl-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.glCategoryFilter = btn.dataset.glCat;
      state.selectedGlAccount = 'ALL';
      render();
    });
  });

  document.getElementById('gl-account-select')?.addEventListener('change', (e) => {
    state.selectedGlAccount = e.target.value;
    render();
  });

  document.getElementById('btn-export-gl')?.addEventListener('click', () => {
    const calc = computeAccounting();
    const rows = [];
    calc.accountsWithBalances.forEach((acc) => {
      acc.entries.forEach((e) => {
        rows.push([acc.code, acc.name, e.date, e.book, e.docNo, e.contact, e.description, e.debit, e.credit, e.runningBalance]);
      });
    });
    downloadCsv('FlowAccount_General_Ledger.csv', ['รหัสบัญชี', 'ชื่อบัญชี', 'วันที่', 'สมุด', 'เลขที่เอกสาร', 'คู่ค้า', 'คำอธิบาย', 'เดบิต', 'เครดิต', 'ยอดสะสม'], rows);
  });
}

// ==========================================
// 6. Financial Reports (งบทดลอง, งบกำไรขาดทุน, งบดุล)
// ==========================================
function renderReports(calc) {
  let bodyHtml = '';

  if (state.reportTab === 'TB') {
    const active = calc.accountsWithBalances.filter((a) => a.totalDr > 0 || a.totalCr > 0);
    const rows = active.map((a) => `
      <tr>
        <td><span class="acc-code">${a.code}</span></td>
        <td><a class="drill-link" onclick="drillToGl('${a.code}')">${a.name}</a><div style="font-size:11.5px;color:var(--text-muted);">${a.nameEn || ''}</div></td>
        <td>${CATEGORY_LABELS[a.category]}</td>
        <td class="num">${a.totalDr > 0 ? fmt(a.totalDr) : '-'}</td>
        <td class="num">${a.totalCr > 0 ? fmt(a.totalCr) : '-'}</td>
        <td class="num" style="color:var(--dr-color);font-weight:600;">${a.drBalance > 0 ? fmt(a.drBalance) : '-'}</td>
        <td class="num" style="color:var(--cr-color);font-weight:600;">${a.crBalance > 0 ? fmt(a.crBalance) : '-'}</td>
      </tr>
    `).join('');

    const isBalanced = Math.abs(calc.tbTotalEndingDr - calc.tbTotalEndingCr) < 0.01;

    bodyHtml = `
      <div class="card">
        <div class="card-header">
          <div>
            <span class="card-title">งบทดลอง (Trial Balance)</span>
            <span style="font-size:12.5px;color:var(--text-muted);margin-left:8px;">คลิกที่ชื่อบัญชีเพื่อเจาะลึก (Drill-down) ไปยังบัญชีแยกประเภท</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="badge ${isBalanced ? 'badge-ok' : 'badge-err'}">
              ${isBalanced ? '✓ ยอดรวมเดบิต = เครดิต' : '✕ ยอดไม่ดุล'}
            </span>
            <button class="btn btn-outline btn-sm" id="btn-export-tb">⬇ Export Excel (CSV)</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>รหัสบัญชี</th>
                <th>ชื่อบัญชี (คลิกเพื่อดู GL)</th>
                <th>หมวด</th>
                <th class="num">รวมเคลื่อนไหว Dr.</th>
                <th class="num">รวมเคลื่อนไหว Cr.</th>
                <th class="num">ยอดคงเหลือสุทธิ Dr.</th>
                <th class="num">ยอดคงเหลือสุทธิ Cr.</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr class="row-total">
                <td colspan="3">รวมงบทดลองทั้งสิ้น</td>
                <td class="num">${fmt(calc.tbTotalMovementDr)}</td>
                <td class="num">${fmt(calc.tbTotalMovementCr)}</td>
                <td class="num" style="color:var(--dr-color);">${fmt(calc.tbTotalEndingDr)}</td>
                <td class="num" style="color:var(--cr-color);">${fmt(calc.tbTotalEndingCr)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  } else if (state.reportTab === 'PL') {
    const revRows = calc.revenues.map((a) => `
      <tr>
        <td><span class="acc-code">${a.code}</span> <a class="drill-link" onclick="drillToGl('${a.code}')">${a.name}</a></td>
        <td class="num">${fmt(a.totalCr - a.totalDr)}</td>
      </tr>
    `).join('');

    const expRows = calc.expenses.map((a) => `
      <tr>
        <td><span class="acc-code">${a.code}</span> <a class="drill-link" onclick="drillToGl('${a.code}')">${a.name}</a></td>
        <td class="num">${fmt(a.totalDr - a.totalCr)}</td>
      </tr>
    `).join('');

    bodyHtml = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">งบกำไรขาดทุน (Income Statement)</span>
          <span class="period-pill">งวด: ตุลาคม 2026</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>หมวดบัญชี</th>
                <th class="num">จำนวนเงิน (บาท)</th>
              </tr>
            </thead>
            <tbody>
              <tr style="background:#f8fafc;font-weight:700;"><td colspan="2">4 - รายได้ (Revenues)</td></tr>
              ${revRows || `<tr><td colspan="2" style="color:var(--text-muted);">ไม่มีรายการรายได้</td></tr>`}
              <tr style="font-weight:700;background:#ecfdf5;">
                <td>รวมรายได้ (Total Revenue)</td>
                <td class="num" style="color:#059669;">${fmt(calc.totalRevenue)}</td>
              </tr>
              <tr style="background:#f8fafc;font-weight:700;"><td colspan="2">5 - ค่าใช้จ่าย (Expenses)</td></tr>
              ${expRows || `<tr><td colspan="2" style="color:var(--text-muted);">ไม่มีรายการค่าใช้จ่าย</td></tr>`}
              <tr style="font-weight:700;background:#fef2f2;">
                <td>รวมค่าใช้จ่าย (Total Expenses)</td>
                <td class="num" style="color:#dc2626;">${fmt(calc.totalExpense)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="row-total" style="font-size:15px;">
                <td>กำไร (ขาดทุน) สุทธิสำหรับงวด</td>
                <td class="num" style="color:${calc.netProfit >= 0 ? '#0284c7' : '#dc2626'};">฿${fmt(calc.netProfit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  } else if (state.reportTab === 'BS') {
    const assetRows = calc.assets.map((a) => `
      <tr>
        <td><span class="acc-code">${a.code}</span> <a class="drill-link" onclick="drillToGl('${a.code}')">${a.name}</a></td>
        <td class="num">${fmt(a.totalDr - a.totalCr)}</td>
      </tr>
    `).join('');

    const liabRows = calc.liabilities.map((a) => `
      <tr>
        <td><span class="acc-code">${a.code}</span> <a class="drill-link" onclick="drillToGl('${a.code}')">${a.name}</a></td>
        <td class="num">${fmt(a.totalCr - a.totalDr)}</td>
      </tr>
    `).join('');

    const eqRows = calc.equities.map((a) => `
      <tr>
        <td><span class="acc-code">${a.code}</span> <a class="drill-link" onclick="drillToGl('${a.code}')">${a.name}</a></td>
        <td class="num">${fmt(a.totalCr - a.totalDr)}</td>
      </tr>
    `).join('');

    const totalLiabAndEq = round2(calc.totalLiability + calc.totalEquityWithProfit);
    const bsBalanced = Math.abs(calc.totalAsset - totalLiabAndEq) < 0.01;

    bodyHtml = `
      <div class="card">
        <div class="card-header">
          <div>
            <span class="card-title">งบแสดงฐานะการเงิน / งบดุล (Statement of Financial Position)</span>
          </div>
          <span class="badge ${bsBalanced ? 'badge-ok' : 'badge-err'}">
            ${bsBalanced ? `✓ สินทรัพย์ = หนี้สิน + ทุน (฿${fmt(calc.totalAsset)})` : '✕ งบดุลไม่สมดุล'}
          </span>
        </div>
        <div class="split-grid" style="padding:16px;">
          <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;">
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>1 - สินทรัพย์ (Assets)</th>
                    <th class="num">จำนวนเงิน (บาท)</th>
                  </tr>
                </thead>
                <tbody>${assetRows}</tbody>
                <tfoot>
                  <tr class="row-total">
                    <td>รวมสินทรัพย์ทั้งสิ้น</td>
                    <td class="num" style="color:var(--dr-color);">฿${fmt(calc.totalAsset)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;">
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>2 & 3 - หนี้สินและส่วนของผู้ถือหุ้น</th>
                    <th class="num">จำนวนเงิน (บาท)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="background:#f8fafc;font-weight:700;"><td colspan="2">2 - หนี้สิน (Liabilities)</td></tr>
                  ${liabRows}
                  <tr style="font-weight:700;">
                    <td>รวมหนี้สินทั้งสิ้น</td>
                    <td class="num">${fmt(calc.totalLiability)}</td>
                  </tr>
                  <tr style="background:#f8fafc;font-weight:700;"><td colspan="2">3 - ส่วนของผู้ถือหุ้น (Equity)</td></tr>
                  ${eqRows}
                  <tr>
                    <td><span class="acc-code">P&L</span> กำไร (ขาดทุน) สุทธิงวดปัจจุบัน</td>
                    <td class="num" style="color:#0284c7;font-weight:600;">${fmt(calc.netProfit)}</td>
                  </tr>
                  <tr style="font-weight:700;">
                    <td>รวมส่วนของผู้ถือหุ้นทั้งสิ้น</td>
                    <td class="num">${fmt(calc.totalEquityWithProfit)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr class="row-total">
                    <td>รวมหนี้สินและส่วนของผู้ถือหุ้น</td>
                    <td class="num" style="color:var(--cr-color);">฿${fmt(totalLiabAndEq)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">รายงานด้านบัญชี: งบทดลอง & งบการเงิน</h1>
        <p class="page-desc">ประมวลผลแบบ Real-time จากสมุดรายวันและบัญชีแยกประเภท</p>
      </div>
      <div class="tab-group">
        <button class="tab-pill ${state.reportTab === 'TB' ? 'active' : ''}" data-rpt="TB">งบทดลอง (Trial Balance)</button>
        <button class="tab-pill ${state.reportTab === 'PL' ? 'active' : ''}" data-rpt="PL">งบกำไรขาดทุน (P&L)</button>
        <button class="tab-pill ${state.reportTab === 'BS' ? 'active' : ''}" data-rpt="BS">งบแสดงฐานะการเงิน (งบดุล)</button>
      </div>
    </div>
    ${bodyHtml}
  `;
}

function bindReportsEvents() {
  document.querySelectorAll('[data-rpt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.reportTab = btn.dataset.rpt;
      render();
    });
  });

  document.getElementById('btn-export-tb')?.addEventListener('click', () => {
    const calc = computeAccounting();
    const active = calc.accountsWithBalances.filter((a) => a.totalDr > 0 || a.totalCr > 0);
    const rows = active.map((a) => [a.code, a.name, CATEGORY_LABELS[a.category], a.totalDr, a.totalCr, a.drBalance, a.crBalance]);
    downloadCsv('FlowAccount_Trial_Balance.csv', ['รหัสบัญชี', 'ชื่อบัญชี', 'หมวด', 'เคลื่อนไหว Dr.', 'เคลื่อนไหว Cr.', 'คงเหลือ Dr.', 'คงเหลือ Cr.'], rows);
  });
}

// ==========================================
// 7. Thai Tax Report View (VAT 7% & WHT)
// ==========================================
function renderTax(calc) {
  const salesVatEntries = calc.ledgerMap['21510']?.entries || [];
  const purchaseVatEntries = calc.ledgerMap['11510']?.entries || [];
  const whtPayableEntries = calc.ledgerMap['21610']?.entries || [];

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">รายงานภาษีซื้อ-ขาย (ภ.พ.30) และหัก ณ ที่จ่าย</h1>
        <p class="page-desc">สรุปยอดภาษีจากบัญชี 21510 (ภาษีขาย), 11510 (ภาษีซื้อ) และ 21610 (หัก ณ ที่จ่ายค้างจ่าย)</p>
      </div>
      <button class="btn btn-primary btn-sm" id="btn-close-vat">ลงรายการปิดภาษีซื้อ-ภาษีขาย (ภ.พ.30)</button>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label"><span>ภาษีขาย (Output VAT 7%)</span><span class="acc-code">21510</span></div>
        <div class="kpi-value">฿${fmt(calc.outputVat)}</div>
        <div class="kpi-sub">${salesVatEntries.length} รายการ</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label"><span>ภาษีซื้อ (Input VAT 7%)</span><span class="acc-code">11510</span></div>
        <div class="kpi-value">฿${fmt(calc.inputVat)}</div>
        <div class="kpi-sub">${purchaseVatEntries.length} รายการ</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label"><span>ยอดสุทธิ ภ.พ.30</span></div>
        <div class="kpi-value" style="color:${calc.netVatPayable >= 0 ? '#d97706' : '#059669'};">
          ฿${fmt(Math.abs(calc.netVatPayable))}
        </div>
        <div class="kpi-sub">${calc.netVatPayable >= 0 ? 'ต้องชำระกรมสรรพากร' : 'เครดิตภาษีซื้อยกไป'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label"><span>หัก ณ ที่จ่ายค้างจ่าย (ภ.ง.ด.1/3/53)</span><span class="acc-code">21610</span></div>
        <div class="kpi-value" style="color:#dc2626;">฿${fmt(calc.whtPayable)}</div>
        <div class="kpi-sub">ภาษีถูกหักไว้ (11540): ฿${fmt(calc.whtAsset)}</div>
      </div>
    </div>

    <div class="split-grid">
      <div class="card">
        <div class="card-header">
          <span class="card-title">รายงานภาษีขาย (21510)</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>วันที่</th>
                <th>ใบสำคัญ</th>
                <th>คู่ค้า / รายละเอียด</th>
                <th class="num">ภาษีขาย</th>
              </tr>
            </thead>
            <tbody>
              ${salesVatEntries.map((e) => `
                <tr>
                  <td>${e.date}</td>
                  <td><a class="drill-link" onclick="switchViewAndInspect('${e.journalId}')">${e.docNo}</a></td>
                  <td>${e.contact} — ${e.description}</td>
                  <td class="num">${fmt(e.credit - e.debit)}</td>
                </tr>
              `).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">ไม่มีรายการ</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">รายงานภาษีซื้อ (11510)</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>วันที่</th>
                <th>ใบสำคัญ</th>
                <th>ผู้ขาย / รายละเอียด</th>
                <th class="num">ภาษีซื้อ</th>
              </tr>
            </thead>
            <tbody>
              ${purchaseVatEntries.map((e) => `
                <tr>
                  <td>${e.date}</td>
                  <td><a class="drill-link" onclick="switchViewAndInspect('${e.journalId}')">${e.docNo}</a></td>
                  <td>${e.contact} — ${e.description}</td>
                  <td class="num">${fmt(e.debit - e.credit)}</td>
                </tr>
              `).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">ไม่มีรายการ</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">รายการภาษีหัก ณ ที่จ่ายค้างจ่าย (21610)</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>วันที่</th>
              <th>เลขที่เอกสาร</th>
              <th>ผู้ถูกหัก ณ ที่จ่าย</th>
              <th>รายละเอียด</th>
              <th class="num">ยอดภาษี (บาท)</th>
            </tr>
          </thead>
          <tbody>
            ${whtPayableEntries.map((e) => `
              <tr>
                <td>${e.date}</td>
                <td><a class="drill-link" onclick="switchViewAndInspect('${e.journalId}')">${e.docNo}</a></td>
                <td>${e.contact}</td>
                <td>${e.description}</td>
                <td class="num"><strong>${fmt(e.credit - e.debit)}</strong></td>
              </tr>
            `).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">ไม่มีรายการ</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function bindTaxEvents(calc) {
  document.getElementById('btn-close-vat')?.addEventListener('click', () => {
    if (calc.outputVat <= 0 && calc.inputVat <= 0) {
      return alert('ไม่มียอดภาษีซื้อหรือภาษีขายคงเหลือให้ปิด');
    }
    const lines = [];
    if (calc.outputVat > 0) {
      lines.push({ accountCode: '21510', description: 'ล้างบัญชีภาษีขายประจำเดือน', debit: calc.outputVat, credit: 0 });
    }
    if (calc.inputVat > 0) {
      lines.push({ accountCode: '11510', description: 'ล้างบัญชีภาษีซื้อประจำเดือน', debit: 0, credit: calc.inputVat });
    }
    if (calc.netVatPayable > 0) {
      lines.push({ accountCode: '21310', description: 'ตั้งค้างจ่าย ภ.พ.30 กรมสรรพากร', debit: 0, credit: calc.netVatPayable });
    }
    openJvModal({
      book: 'JV',
      date: '2026-10-31',
      contact: 'กรมสรรพากร',
      refDoc: 'PP30-202610',
      description: 'ปิดบัญชีภาษีซื้อ-ภาษีขาย ประจำเดือน ต.ค. (ภ.พ.30)',
      lines
    });
  });
}

// ==========================================
// 8. Chart of Accounts View (บริหารผังบัญชี)
// ==========================================
function renderCoa(calc) {
  const filtered = calc.accountsWithBalances.filter(
    (a) => state.coaFilter === 'ALL' || a.category === state.coaFilter
  );

  const rows = filtered.map((a) => `
    <tr>
      <td><span class="acc-code">${a.code}</span></td>
      <td><a class="drill-link" onclick="drillToGl('${a.code}')">${a.name}</a></td>
      <td style="color:var(--text-muted);">${a.nameEn || '-'}</td>
      <td>${CATEGORY_LABELS[a.category]}</td>
      <td><span class="badge ${a.normalSide === 'DR' ? 'badge-dr' : 'badge-cr'}">${a.normalSide}</span></td>
      <td class="num"><strong>${fmt(a.netBalance)}</strong></td>
      <td style="text-align:right;">
        ${a.system ? '<span style="font-size:11.5px;color:var(--text-muted);">บัญชีหลัก</span>' : `<button class="btn btn-danger-ghost" data-del-acc="${a.code}">ลบ</button>`}
      </td>
    </tr>
  `).join('');

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">บริหารผังบัญชี (Chart of Accounts)</h1>
        <p class="page-desc">ผังบัญชี 5 หมวด (บัญชีที่มีรายการเคลื่อนไหวแล้วจะไม่สามารถลบได้เพื่อคงร่องรอยทางบัญชี)</p>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">เพิ่มรหัสบัญชีใหม่</span>
      </div>
      <div class="card-body">
        <div class="form-grid" style="margin-bottom:0;">
          <div class="field">
            <label>รหัสบัญชี (5 หลัก)</label>
            <input type="text" class="input" id="new-acc-code" placeholder="เช่น 53190" maxlength="5" />
          </div>
          <div class="field">
            <label>ชื่อบัญชี (ไทย)</label>
            <input type="text" class="input" id="new-acc-name" placeholder="เช่น ค่ารับรอง" />
          </div>
          <div class="field">
            <label>ชื่อบัญชี (อังกฤษ)</label>
            <input type="text" class="input" id="new-acc-en" placeholder="Entertainment Expense" />
          </div>
          <div class="field">
            <label>หมวดบัญชี</label>
            <select id="new-acc-cat">
              <option value="ASSET">1 - สินทรัพย์ (Dr.)</option>
              <option value="LIABILITY">2 - หนี้สิน (Cr.)</option>
              <option value="EQUITY">3 - ส่วนของผู้ถือหุ้น (Cr.)</option>
              <option value="REVENUE">4 - รายได้ (Cr.)</option>
              <option value="EXPENSE" selected>5 - ค่าใช้จ่าย (Dr.)</option>
            </select>
          </div>
          <div class="field" style="justify-content:flex-end;">
            <button class="btn btn-primary" id="btn-add-acc">+ เพิ่มผังบัญชี</button>
          </div>
        </div>
      </div>
    </div>

    <div class="filter-bar">
      <div class="tab-group">
        ${['ALL', 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((c) => `
          <button class="tab-pill ${state.coaFilter === c ? 'active' : ''}" data-coa="${c}">
            ${c === 'ALL' ? 'ทั้งหมด' : CATEGORY_LABELS[c]}
          </button>
        `).join('')}
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>รหัส</th>
              <th>ชื่อบัญชี (คลิกดู GL)</th>
              <th>ชื่อภาษาอังกฤษ</th>
              <th>หมวด</th>
              <th>ฝั่งปกติ</th>
              <th class="num">ยอดคงเหลือ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function bindCoaEvents() {
  document.querySelectorAll('[data-coa]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.coaFilter = btn.dataset.coa;
      render();
    });
  });

  document.getElementById('btn-add-acc')?.addEventListener('click', async () => {
    const code = document.getElementById('new-acc-code').value.trim();
    const name = document.getElementById('new-acc-name').value.trim();
    const nameEn = document.getElementById('new-acc-en').value.trim();
    const category = document.getElementById('new-acc-cat').value;

    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name, nameEn, category })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'ไม่สามารถเพิ่มบัญชีได้');

    state.accounts = data.accounts;
    showToast(`เพิ่มรหัสบัญชี ${code} - ${name} เรียบร้อย`);
    render();
  });

  document.querySelectorAll('[data-del-acc]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const code = btn.dataset.delAcc;
      const res = await fetch(`/api/accounts/${encodeURIComponent(code)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return alert(data.error || 'ไม่สามารถลบได้');
      state.accounts = data.accounts;
      showToast(`ลบรหัสบัญชี ${code} เรียบร้อย`);
      render();
    });
  });
}

// ==========================================
// Manual Journal Voucher Modal (Create & Edit)
// ==========================================
function openJvModal(preset, editId = null) {
  state.editingJournalId = editId;
  const modal = document.getElementById('jv-modal');
  modal.classList.add('open');

  document.getElementById('jv-modal-title').textContent = editId
    ? `แก้ไขใบสำคัญ (${preset.docNo})`
    : 'สร้างใบสำคัญลงบัญชี (Journal Entry)';

  document.getElementById('jv-book').value = preset?.book || 'JV';
  document.getElementById('jv-date').value = preset?.date || '2026-10-16';
  document.getElementById('jv-contact').value = preset?.contact || '';
  document.getElementById('jv-ref').value = preset?.refDoc || '';
  document.getElementById('jv-desc').value = preset?.description || '';

  state.jvLines = preset?.lines
    ? JSON.parse(JSON.stringify(preset.lines))
    : [
        { accountCode: '53140', description: 'ค่าอินเทอร์เน็ตและสาธารณูปโภค', debit: 1500, credit: 0 },
        { accountCode: '11120', description: 'ตัดจ่ายจากบัญชีออมทรัพย์ ธ.กสิกรไทย', debit: 0, credit: 1500 }
      ];

  renderJvModalLines();
}

function closeJvModal() {
  state.editingJournalId = null;
  document.getElementById('jv-modal').classList.remove('open');
}

function renderJvModalLines() {
  const tbody = document.getElementById('jv-lines-body');
  const optionsHtml = (selected) =>
    state.accounts
      .map((a) => `<option value="${a.code}" ${a.code === selected ? 'selected' : ''}>${a.code} - ${a.name}</option>`)
      .join('');

  tbody.innerHTML = state.jvLines
    .map(
      (line, idx) => `
      <tr>
        <td>
          <select class="jv-line-acc" data-idx="${idx}" style="width:100%;">
            ${optionsHtml(line.accountCode)}
          </select>
        </td>
        <td>
          <input type="text" class="input jv-line-desc" data-idx="${idx}" value="${line.description || ''}" style="width:100%;" />
        </td>
        <td>
          <input type="number" step="0.01" class="input num jv-line-dr" data-idx="${idx}" value="${line.debit || 0}" style="width:100%;" />
        </td>
        <td>
          <input type="number" step="0.01" class="input num jv-line-cr" data-idx="${idx}" value="${line.credit || 0}" style="width:100%;" />
        </td>
        <td style="text-align:center;">
          ${state.jvLines.length > 2 ? `<button type="button" class="btn btn-danger-ghost jv-line-del" data-idx="${idx}">✕</button>` : ''}
        </td>
      </tr>
    `
    )
    .join('');

  tbody.querySelectorAll('.jv-line-acc').forEach((el) => {
    el.addEventListener('change', (e) => {
      state.jvLines[Number(e.target.dataset.idx)].accountCode = e.target.value;
    });
  });

  tbody.querySelectorAll('.jv-line-desc').forEach((el) => {
    el.addEventListener('input', (e) => {
      state.jvLines[Number(e.target.dataset.idx)].description = e.target.value;
    });
  });

  tbody.querySelectorAll('.jv-line-dr').forEach((el) => {
    el.addEventListener('input', (e) => {
      const idx = Number(e.target.dataset.idx);
      const val = parseFloat(e.target.value || 0);
      state.jvLines[idx].debit = val;
      if (val > 0) {
        state.jvLines[idx].credit = 0;
        tbody.querySelector(`.jv-line-cr[data-idx="${idx}"]`).value = 0;
      }
      updateJvModalTotals();
    });
  });

  tbody.querySelectorAll('.jv-line-cr').forEach((el) => {
    el.addEventListener('input', (e) => {
      const idx = Number(e.target.dataset.idx);
      const val = parseFloat(e.target.value || 0);
      state.jvLines[idx].credit = val;
      if (val > 0) {
        state.jvLines[idx].debit = 0;
        tbody.querySelector(`.jv-line-dr[data-idx="${idx}"]`).value = 0;
      }
      updateJvModalTotals();
    });
  });

  tbody.querySelectorAll('.jv-line-del').forEach((el) => {
    el.addEventListener('click', (e) => {
      const idx = Number(e.target.dataset.idx);
      state.jvLines.splice(idx, 1);
      renderJvModalLines();
    });
  });

  updateJvModalTotals();
}

function updateJvModalTotals() {
  const totalDr = round2(state.jvLines.reduce((s, l) => s + Number(l.debit || 0), 0));
  const totalCr = round2(state.jvLines.reduce((s, l) => s + Number(l.credit || 0), 0));
  const diff = round2(Math.abs(totalDr - totalCr));

  document.getElementById('jv-total-dr').textContent = fmt(totalDr);
  document.getElementById('jv-total-cr').textContent = fmt(totalCr);

  const statusEl = document.getElementById('jv-balance-status');
  if (totalDr > 0 && diff < 0.01) {
    statusEl.innerHTML = `<span class="badge badge-ok">✓ ดุลแล้ว (${fmt(totalDr)} บาท)</span>`;
  } else {
    statusEl.innerHTML = `<span class="badge badge-err">✕ ยอดไม่ดุล (ผลต่าง ${fmt(diff)} บาท)</span>`;
  }
}

window.switchView = function (viewName) {
  state.view = viewName;
  closeMobileSidebar();
  render();
};

window.drillToGl = function (accountCode) {
  state.view = 'ledger';
  state.glCategoryFilter = 'ALL';
  state.selectedGlAccount = accountCode;
  closeMobileSidebar();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.switchViewAndInspect = function (journalId) {
  state.view = 'journals';
  state.journalBookFilter = 'ALL';
  state.journalSearch = '';
  closeMobileSidebar();
  render();
  setTimeout(() => {
    const el = document.getElementById(`voucher-${journalId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50);
};

// ==========================================
// Init & Global Event Listeners
// ==========================================
async function init() {
  const res = await fetch('/api/state');
  const data = await res.json();
  state.company = data.company || { locked: false };
  state.accounts = data.accounts || [];
  state.journals = data.journals || [];
  state.assets = data.assets || [];

  document.querySelectorAll('.nav-btn, .mq-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      closeMobileSidebar();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  document.getElementById('btn-open-sidebar')?.addEventListener('click', openMobileSidebar);
  document.getElementById('btn-close-sidebar')?.addEventListener('click', closeMobileSidebar);
  document.getElementById('sidebar-backdrop')?.addEventListener('click', closeMobileSidebar);

  document.getElementById('btn-toggle-lock').addEventListener('click', async () => {
    const resLock = await fetch('/api/lock-period', { method: 'POST' });
    const out = await resLock.json();
    state.company = out.company;
    showToast(state.company.locked ? 'ล็อกงวดบัญชีแล้ว (ป้องกันการแก้ไขย้อนหลัง)' : 'ปลดล็อกงวดบัญชีแล้ว');
    render();
  });

  document.getElementById('btn-open-jv').addEventListener('click', () => openJvModal());
  document.getElementById('btn-close-jv').addEventListener('click', closeJvModal);
  document.getElementById('btn-cancel-jv').addEventListener('click', closeJvModal);

  document.getElementById('btn-go-autopost').addEventListener('click', () => {
    state.view = 'autopost';
    closeMobileSidebar();
    render();
  });

  document.getElementById('btn-add-jv-line').addEventListener('click', () => {
    state.jvLines.push({ accountCode: '11120', description: '', debit: 0, credit: 0 });
    renderJvModalLines();
  });

  document.getElementById('btn-auto-balance').addEventListener('click', () => {
    if (state.jvLines.length < 2) return;
    const lastIdx = state.jvLines.length - 1;
    const priorDr = round2(state.jvLines.slice(0, lastIdx).reduce((s, l) => s + Number(l.debit || 0), 0));
    const priorCr = round2(state.jvLines.slice(0, lastIdx).reduce((s, l) => s + Number(l.credit || 0), 0));
    if (priorDr > priorCr) {
      state.jvLines[lastIdx].debit = 0;
      state.jvLines[lastIdx].credit = round2(priorDr - priorCr);
    } else if (priorCr > priorDr) {
      state.jvLines[lastIdx].credit = 0;
      state.jvLines[lastIdx].debit = round2(priorCr - priorDr);
    }
    renderJvModalLines();
  });

  document.getElementById('btn-save-jv').addEventListener('click', async () => {
    const payload = {
      book: document.getElementById('jv-book').value,
      date: document.getElementById('jv-date').value,
      contact: document.getElementById('jv-contact').value,
      refDoc: document.getElementById('jv-ref').value,
      description: document.getElementById('jv-desc').value,
      lines: state.jvLines
    };

    const url = state.editingJournalId
      ? `/api/journals/${encodeURIComponent(state.editingJournalId)}`
      : '/api/journals';
    const method = state.editingJournalId ? 'PUT' : 'POST';

    const resSave = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const out = await resSave.json();
    if (!resSave.ok) return alert(out.error || 'บันทึกไม่สำเร็จ');

    state.journals = out.journals;
    closeJvModal();
    showToast(`บันทึกใบสำคัญ ${out.journal.docNo} เรียบร้อย`);
    state.view = 'journals';
    render();
  });

  document.getElementById('btn-reset-demo').addEventListener('click', async () => {
    if (!confirm('รีเซ็ตข้อมูลกลับเป็นค่าเริ่มต้นใช่หรือไม่?')) return;
    const resReset = await fetch('/api/reset', { method: 'POST' });
    const out = await resReset.json();
    state.company = out.company;
    state.accounts = out.accounts;
    state.journals = out.journals;
    state.assets = out.assets;
    showToast('รีเซ็ตข้อมูลเรียบร้อย');
    render();
  });

  render();
}

init();
