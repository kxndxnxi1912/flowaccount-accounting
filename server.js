const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const INITIAL_ACCOUNTS = [
  // 1 - สินทรัพย์ (Assets) -> Normal DR
  { code: '11110', name: 'เงินสด', nameEn: 'Cash on Hand', category: 'ASSET', subType: 'สินทรัพย์หมุนเวียน', normalSide: 'DR', system: true },
  { code: '11120', name: 'เงินฝากออมทรัพย์ - ธ.กสิกรไทย', nameEn: 'Cash in Bank - KBANK', category: 'ASSET', subType: 'สินทรัพย์หมุนเวียน', normalSide: 'DR', system: true },
  { code: '11310', name: 'ลูกหนี้การค้า', nameEn: 'Accounts Receivable', category: 'ASSET', subType: 'สินทรัพย์หมุนเวียน', normalSide: 'DR', system: true },
  { code: '11510', name: 'ภาษีซื้อ', nameEn: 'Input VAT 7%', category: 'ASSET', subType: 'ภาษีมูลค่าเพิ่ม', normalSide: 'DR', system: true },
  { code: '11520', name: 'ภาษีซื้อยังไม่ถึงกำหนด', nameEn: 'Undue Input VAT', category: 'ASSET', subType: 'ภาษีมูลค่าเพิ่ม', normalSide: 'DR', system: false },
  { code: '11540', name: 'ภาษีเงินได้ถูกหัก ณ ที่จ่าย', nameEn: 'Withholding Tax Asset', category: 'ASSET', subType: 'ภาษีหัก ณ ที่จ่าย', normalSide: 'DR', system: true },
  { code: '12110', name: 'อุปกรณ์สำนักงานและคอมพิวเตอร์', nameEn: 'Office & Computer Equipment', category: 'ASSET', subType: 'สินทรัพย์ไม่หมุนเวียน', normalSide: 'DR', system: true },
  { code: '12120', name: 'ค่าเสื่อมราคาสะสม - อุปกรณ์สำนักงาน', nameEn: 'Accumulated Depreciation', category: 'ASSET', subType: 'สินทรัพย์ไม่หมุนเวียน', normalSide: 'CR', system: true },

  // 2 - หนี้สิน (Liabilities) -> Normal CR
  { code: '21210', name: 'เจ้าหนี้การค้า', nameEn: 'Accounts Payable', category: 'LIABILITY', subType: 'หนี้สินหมุนเวียน', normalSide: 'CR', system: true },
  { code: '21310', name: 'ค่าใช้จ่ายค้างจ่าย', nameEn: 'Accrued Expenses', category: 'LIABILITY', subType: 'หนี้สินหมุนเวียน', normalSide: 'CR', system: false },
  { code: '21510', name: 'ภาษีขาย', nameEn: 'Output VAT 7%', category: 'LIABILITY', subType: 'ภาษีมูลค่าเพิ่ม', normalSide: 'CR', system: true },
  { code: '21520', name: 'ภาษีขายยังไม่ถึงกำหนด', nameEn: 'Undue Output VAT', category: 'LIABILITY', subType: 'ภาษีมูลค่าเพิ่ม', normalSide: 'CR', system: false },
  { code: '21610', name: 'ภาษีหัก ณ ที่จ่ายค้างจ่าย (ภ.ง.ด.1/3/53)', nameEn: 'Withholding Tax Payable', category: 'LIABILITY', subType: 'ภาษีหัก ณ ที่จ่าย', normalSide: 'CR', system: true },

  // 3 - ส่วนของผู้ถือหุ้น (Equity) -> Normal CR
  { code: '31110', name: 'ทุนเรือนหุ้นสามัญ', nameEn: 'Paid-up Share Capital', category: 'EQUITY', subType: 'ทุนเรือนหุ้น', normalSide: 'CR', system: true },
  { code: '32110', name: 'กำไร (ขาดทุน) สะสม', nameEn: 'Retained Earnings', category: 'EQUITY', subType: 'กำไรสะสม', normalSide: 'CR', system: true },

  // 4 - รายได้ (Revenue) -> Normal CR
  { code: '41110', name: 'รายได้จากการขายสินค้า', nameEn: 'Sales Revenue', category: 'REVENUE', subType: 'รายได้หลัก', normalSide: 'CR', system: true },
  { code: '41120', name: 'รายได้จากการให้บริการ', nameEn: 'Service Revenue', category: 'REVENUE', subType: 'รายได้หลัก', normalSide: 'CR', system: true },
  { code: '42110', name: 'ดอกเบี้ยรับและรายได้อื่น', nameEn: 'Other Income', category: 'REVENUE', subType: 'รายได้อื่น', normalSide: 'CR', system: false },

  // 5 - ค่าใช้จ่าย (Expense) -> Normal DR
  { code: '51110', name: 'ต้นทุนขายและต้นทุนบริการ', nameEn: 'Cost of Goods & Services', category: 'EXPENSE', subType: 'ต้นทุนหลัก', normalSide: 'DR', system: true },
  { code: '52110', name: 'เงินเดือนและค่าจ้าง', nameEn: 'Salaries and Wages', category: 'EXPENSE', subType: 'ค่าใช้จ่ายบริหาร', normalSide: 'DR', system: false },
  { code: '53110', name: 'ค่าเช่าสำนักงาน', nameEn: 'Office Rent Expense', category: 'EXPENSE', subType: 'ค่าใช้จ่ายบริหาร', normalSide: 'DR', system: false },
  { code: '53120', name: 'ค่าโฆษณาและการตลาด', nameEn: 'Marketing & Ads Expense', category: 'EXPENSE', subType: 'ค่าใช้จ่ายขาย', normalSide: 'DR', system: false },
  { code: '53130', name: 'ค่าบริการวิชาชีพและจ้างทำของ', nameEn: 'Professional & Outsource Fee', category: 'EXPENSE', subType: 'ค่าใช้จ่ายบริหาร', normalSide: 'DR', system: false },
  { code: '53140', name: 'ค่าน้ำ ค่าไฟ ค่าอินเทอร์เน็ต', nameEn: 'Utilities & Internet', category: 'EXPENSE', subType: 'ค่าใช้จ่ายบริหาร', normalSide: 'DR', system: false },
  { code: '53210', name: 'ค่าเสื่อมราคา - อุปกรณ์สำนักงาน', nameEn: 'Depreciation Expense', category: 'EXPENSE', subType: 'ค่าใช้จ่ายบริหาร', normalSide: 'DR', system: true }
];

// FlowAccount 5 Books: SV (ขาย), RV (รับ), UV (ซื้อ), PV (จ่าย), JV (ทั่วไป)
const INITIAL_JOURNALS = [
  {
    id: 'jv-001',
    docNo: 'JV202610001',
    book: 'JV',
    date: '2026-10-01',
    contact: 'ยอดยกมาต้นงวด / ผู้ถือหุ้น',
    description: 'บันทึกยอดยกมาต้นงวด: เงินฝากธนาคาร อุปกรณ์สำนักงาน และทุนจดทะเบียน',
    refDoc: 'OPEN-2026',
    meta: { vatAmount: 0, whtAmount: 0, source: 'OPENING' },
    lines: [
      { accountCode: '11120', description: 'เงินฝากออมทรัพย์ ธ.กสิกรไทย ยกมา', debit: 500000, credit: 0 },
      { accountCode: '12110', description: 'อุปกรณ์คอมพิวเตอร์สำนักงาน (ราคาทุน)', debit: 60000, credit: 0 },
      { accountCode: '31110', description: 'ทุนเรือนหุ้นสามัญชำระแล้ว', debit: 0, credit: 560000 }
    ]
  },
  {
    id: 'rv-001',
    docNo: 'RV202610001',
    book: 'RV',
    date: '2026-10-05',
    contact: 'บจก. สยามดิจิทัล โซลูชั่น',
    description: 'รับชำระค่าบริการพัฒนาระบบ (VAT 7%, ลูกค้าหัก ณ ที่จ่าย 3%)',
    refDoc: 'INV202610001',
    meta: { subTotal: 100000, vatRate: 7, vatAmount: 7000, whtRate: 3, whtAmount: 3000, source: 'AUTO_SALES' },
    lines: [
      { accountCode: '11120', description: 'รับเงินโอนสุทธิเข้า ธ.กสิกรไทย', debit: 104000, credit: 0 },
      { accountCode: '11540', description: 'ภาษีเงินได้ถูกหัก ณ ที่จ่าย 3%', debit: 3000, credit: 0 },
      { accountCode: '41120', description: 'รายได้จากการให้บริการ', debit: 0, credit: 100000 },
      { accountCode: '21510', description: 'ภาษีขาย 7%', debit: 0, credit: 7000 }
    ]
  },
  {
    id: 'sv-001',
    docNo: 'SV202610001',
    book: 'SV',
    date: '2026-10-09',
    contact: 'บจก. เอเพ็กซ์ รีเทล กรุ๊ป',
    description: 'ออกใบแจ้งหนี้ค่าบริการดูแลระบบรายปี (ขายเชื่อ)',
    refDoc: 'INV202610002',
    meta: { subTotal: 60000, vatRate: 7, vatAmount: 4200, whtRate: 0, whtAmount: 0, source: 'AUTO_SALES' },
    lines: [
      { accountCode: '11310', description: 'ลูกหนี้การค้า ตามใบแจ้งหนี้ INV202610002', debit: 64200, credit: 0 },
      { accountCode: '41120', description: 'รายได้จากการให้บริการ', debit: 0, credit: 60000 },
      { accountCode: '21510', description: 'ภาษีขาย 7%', debit: 0, credit: 4200 }
    ]
  },
  {
    id: 'pv-001',
    docNo: 'PV202610001',
    book: 'PV',
    date: '2026-10-10',
    contact: 'บจก. บางกอก ทาวเวอร์ พร็อพเพอร์ตี้',
    description: 'จ่ายค่าเช่าสำนักงานเดือน ต.ค. (VAT 7%, หัก ณ ที่จ่าย 5%)',
    refDoc: 'EXP202610001',
    meta: { subTotal: 25000, vatRate: 7, vatAmount: 1750, whtRate: 5, whtAmount: 1250, source: 'AUTO_EXPENSE' },
    lines: [
      { accountCode: '53110', description: 'ค่าเช่าสำนักงานประจำเดือน ต.ค.', debit: 25000, credit: 0 },
      { accountCode: '11510', description: 'ภาษีซื้อ 7%', debit: 1750, credit: 0 },
      { accountCode: '21610', description: 'ภาษีหัก ณ ที่จ่ายค้างจ่าย 5% (ภ.ง.ด.53)', debit: 0, credit: 1250 },
      { accountCode: '11120', description: 'โอนจ่ายสุทธิจาก ธ.กสิกรไทย', debit: 0, credit: 25500 }
    ]
  },
  {
    id: 'pv-002',
    docNo: 'PV202610002',
    book: 'PV',
    date: '2026-10-12',
    contact: 'คุณธนพล (ฟรีแลนซ์ออกแบบ UX/UI)',
    description: 'จ่ายค่าจ้างออกแบบ UX/UI (ไม่มี VAT, หัก ณ ที่จ่าย 3% ภ.ง.ด.3)',
    refDoc: 'EXP202610002',
    meta: { subTotal: 18000, vatRate: 0, vatAmount: 0, whtRate: 3, whtAmount: 540, source: 'AUTO_EXPENSE' },
    lines: [
      { accountCode: '53130', description: 'ค่าจ้างออกแบบ UX/UI', debit: 18000, credit: 0 },
      { accountCode: '21610', description: 'ภาษีหัก ณ ที่จ่ายค้างจ่าย 3% (ภ.ง.ด.3)', debit: 0, credit: 540 },
      { accountCode: '11120', description: 'โอนจ่ายสุทธิจาก ธ.กสิกรไทย', debit: 0, credit: 17460 }
    ]
  },
  {
    id: 'uv-001',
    docNo: 'UV202610001',
    book: 'UV',
    date: '2026-10-14',
    contact: 'บจก. คลาวด์ โฮสติ้ง ไทยแลนด์',
    description: 'รับใบวางบิลค่า Cloud Server และโฆษณา (ซื้อเชื่อ)',
    refDoc: 'BILL202610001',
    meta: { subTotal: 12000, vatRate: 7, vatAmount: 840, whtRate: 0, whtAmount: 0, source: 'AUTO_EXPENSE' },
    lines: [
      { accountCode: '53120', description: 'ค่าโฆษณาและระบบคลาวด์', debit: 12000, credit: 0 },
      { accountCode: '11510', description: 'ภาษีซื้อ 7%', debit: 840, credit: 0 },
      { accountCode: '21210', description: 'เจ้าหนี้การค้า - บจก. คลาวด์ โฮสติ้ง ไทยแลนด์', debit: 0, credit: 12840 }
    ]
  }
];

const INITIAL_ASSETS = [
  {
    id: 'ast-001',
    code: 'AST-001',
    name: 'MacBook Pro & ชุดคอมพิวเตอร์สำนักงาน (2 เครื่อง)',
    purchaseDate: '2026-10-01',
    cost: 60000,
    salvage: 0,
    usefulLifeYears: 3,
    accumDeprPrior: 0,
    assetAccount: '12110',
    accumAccount: '12120',
    deprExpenseAccount: '53210'
  }
];

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  let needInit = !fs.existsSync(DB_FILE);
  if (!needInit) {
    try {
      const current = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (!Array.isArray(current.assets)) needInit = true;
    } catch (_) {
      needInit = true;
    }
  }
  if (needInit) {
    const initial = {
      company: {
        name: 'บริษัท โฟลว์เทค แอคเคาน์ติ้ง จำกัด (สำนักงานใหญ่)',
        taxId: '0105567012345',
        period: 'ตุลาคม 2026',
        locked: false
      },
      accounts: INITIAL_ACCOUNTS,
      journals: INITIAL_JOURNALS,
      assets: INITIAL_ASSETS
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDb(data) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function validateJournalLines(rawLines) {
  const lines = (Array.isArray(rawLines) ? rawLines : [])
    .map((l) => ({
      accountCode: String(l.accountCode || '').trim(),
      description: String(l.description || '').trim(),
      debit: round2(l.debit || 0),
      credit: round2(l.credit || 0)
    }))
    .filter((l) => l.accountCode && (l.debit > 0 || l.credit > 0));

  if (lines.length < 2) {
    return { error: 'การลงบัญชีคู่ต้องมีอย่างน้อย 2 บรรทัด (เดบิต และ เครดิต)' };
  }

  const totalDr = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCr = round2(lines.reduce((s, l) => s + l.credit, 0));

  if (totalDr <= 0 || Math.abs(totalDr - totalCr) > 0.009) {
    return {
      error: `ยอดเดบิต (${totalDr.toFixed(2)}) ไม่เท่ากับ เครดิต (${totalCr.toFixed(2)}) ผลต่าง ${Math.abs(totalDr - totalCr).toFixed(2)}`
    };
  }
  return { lines, totalDr, totalCr };
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  try {
    if (pathname === '/api/state' && req.method === 'GET') {
      return sendJson(res, 200, readDb());
    }

    if (pathname === '/api/reset' && req.method === 'POST') {
      if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
      return sendJson(res, 200, readDb());
    }

    if (pathname === '/api/lock-period' && req.method === 'POST') {
      const db = readDb();
      db.company.locked = !db.company.locked;
      writeDb(db);
      return sendJson(res, 200, { company: db.company });
    }

    if (pathname === '/api/accounts' && req.method === 'POST') {
      const body = await parseBody(req);
      const code = String(body.code || '').trim();
      const name = String(body.name || '').trim();
      const nameEn = String(body.nameEn || '').trim();
      const category = String(body.category || 'EXPENSE').trim();
      const subType = String(body.subType || 'ทั่วไป').trim();

      if (!/^[1-5]\d{4}$/.test(code)) {
        return sendJson(res, 400, { error: 'รหัสบัญชีต้องเป็นตัวเลข 5 หลัก ขึ้นต้นด้วยหมวด 1-5 (เช่น 53190)' });
      }
      if (!name) {
        return sendJson(res, 400, { error: 'กรุณาระบุชื่อบัญชี' });
      }

      const db = readDb();
      if (db.accounts.some((a) => a.code === code)) {
        return sendJson(res, 400, { error: `รหัสบัญชี ${code} มีอยู่ในระบบแล้ว` });
      }

      const normalSide = category === 'ASSET' || category === 'EXPENSE' ? 'DR' : 'CR';
      const newAcc = { code, name, nameEn, category, subType, normalSide, system: false };
      db.accounts.push(newAcc);
      db.accounts.sort((a, b) => a.code.localeCompare(b.code));
      writeDb(db);
      return sendJson(res, 201, { account: newAcc, accounts: db.accounts });
    }

    if (pathname.startsWith('/api/accounts/') && req.method === 'DELETE') {
      const code = decodeURIComponent(pathname.replace('/api/accounts/', ''));
      const db = readDb();
      const acc = db.accounts.find((a) => a.code === code);
      if (!acc) return sendJson(res, 404, { error: 'ไม่พบรหัสบัญชี' });
      if (acc.system) return sendJson(res, 400, { error: 'บัญชีมาตรฐานระบบไม่สามารถลบได้' });
      const used = db.journals.some((j) => j.lines.some((l) => l.accountCode === code));
      if (used) return sendJson(res, 400, { error: 'ไม่สามารถลบบัญชีที่มีรายการเดินบัญชีแล้วได้ (เพื่อคงร่องรอยทางบัญชี)' });

      db.accounts = db.accounts.filter((a) => a.code !== code);
      writeDb(db);
      return sendJson(res, 200, { accounts: db.accounts });
    }

    if (pathname === '/api/journals' && req.method === 'POST') {
      const db = readDb();
      if (db.company.locked) {
        return sendJson(res, 400, { error: 'งวดบัญชีถูกล็อกแล้ว กรุณาปลดล็อกงวดบัญชีก่อนเพิ่มหรือแก้ไขรายการ' });
      }

      const body = await parseBody(req);
      const book = String(body.book || 'JV').toUpperCase();
      const date = String(body.date || new Date().toISOString().slice(0, 10));
      const contact = String(body.contact || '-').trim();
      const description = String(body.description || '').trim();
      const refDoc = String(body.refDoc || '').trim();

      if (!description) {
        return sendJson(res, 400, { error: 'กรุณาระบุคำอธิบายรายการ' });
      }

      const check = validateJournalLines(body.lines);
      if (check.error) return sendJson(res, 400, { error: check.error });

      const sameBookCount = db.journals.filter((j) => j.book === book).length + 1;
      const ym = date.slice(0, 7).replace('-', '');
      const docNo = body.docNo || `${book}${ym}${String(sameBookCount).padStart(3, '0')}`;

      const entry = {
        id: `${book.toLowerCase()}-${Date.now()}`,
        docNo,
        book,
        date,
        contact,
        description,
        refDoc,
        meta: body.meta || { vatAmount: 0, whtAmount: 0, source: 'MANUAL' },
        lines: check.lines
      };

      db.journals.unshift(entry);
      writeDb(db);
      return sendJson(res, 201, { journal: entry, journals: db.journals });
    }

    if (pathname.startsWith('/api/journals/') && req.method === 'PUT') {
      const db = readDb();
      if (db.company.locked) {
        return sendJson(res, 400, { error: 'งวดบัญชีถูกล็อกแล้ว ไม่สามารถแก้ไขรายการย้อนหลังได้' });
      }

      const id = decodeURIComponent(pathname.replace('/api/journals/', ''));
      const idx = db.journals.findIndex((j) => j.id === id);
      if (idx === -1) return sendJson(res, 404, { error: 'ไม่พบใบสำคัญ' });

      const body = await parseBody(req);
      const check = validateJournalLines(body.lines);
      if (check.error) return sendJson(res, 400, { error: check.error });

      db.journals[idx] = {
        ...db.journals[idx],
        book: String(body.book || db.journals[idx].book).toUpperCase(),
        date: String(body.date || db.journals[idx].date),
        contact: String(body.contact || '-').trim(),
        description: String(body.description || db.journals[idx].description).trim(),
        refDoc: String(body.refDoc || '').trim(),
        lines: check.lines
      };

      writeDb(db);
      return sendJson(res, 200, { journal: db.journals[idx], journals: db.journals });
    }

    if (pathname.startsWith('/api/journals/') && req.method === 'DELETE') {
      const db = readDb();
      if (db.company.locked) {
        return sendJson(res, 400, { error: 'งวดบัญชีถูกล็อกแล้ว ไม่สามารถลบใบสำคัญได้' });
      }
      const id = decodeURIComponent(pathname.replace('/api/journals/', ''));
      db.journals = db.journals.filter((j) => j.id !== id);
      writeDb(db);
      return sendJson(res, 200, { journals: db.journals });
    }

    if (pathname === '/api/assets' && req.method === 'POST') {
      const db = readDb();
      const body = await parseBody(req);
      const name = String(body.name || '').trim();
      const cost = round2(body.cost || 0);
      const salvage = round2(body.salvage || 0);
      const usefulLifeYears = Math.max(1, Number(body.usefulLifeYears || 5));
      const purchaseDate = String(body.purchaseDate || '2026-10-01');

      if (!name || cost <= 0) {
        return sendJson(res, 400, { error: 'กรุณาระบุชื่อสินทรัพย์และราคาทุนให้ถูกต้อง' });
      }

      const code = `AST-${String(db.assets.length + 1).padStart(3, '0')}`;
      const asset = {
        id: `ast-${Date.now()}`,
        code,
        name,
        purchaseDate,
        cost,
        salvage,
        usefulLifeYears,
        accumDeprPrior: round2(body.accumDeprPrior || 0),
        assetAccount: '12110',
        accumAccount: '12120',
        deprExpenseAccount: '53210'
      };
      db.assets.push(asset);
      writeDb(db);
      return sendJson(res, 201, { asset, assets: db.assets });
    }

    let filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, pathname);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      return fs.createReadStream(filePath).pipe(res);
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Internal Server Error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`FlowAccount Accounting Engine running at http://0.0.0.0:${PORT}`);
});
