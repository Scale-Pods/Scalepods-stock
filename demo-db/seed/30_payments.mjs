// Invoices and payments: sales and purchase invoices that match the plates in the stock book, who owes what, expenses and the smaller lists.
import { insert, R, TODAY, iso, dayStr, addDays, money, fyOf, fyShort, SALES_PEOPLE, CUSTOMERS, VENDORS, BROKERS, TRANSPORTERS, EXPENSE_TYPES, pad } from "../lib.mjs";

const PEOPLE = ["Riya", "Kabir", "Aarav", "Nikhil", "Sana"];
const BIG_DEBTORS = new Set(["Orion Boilers Pvt Ltd", "Vanguard Pressure Vessels Ltd", "Apex Heat Exchangers Pvt Ltd", "Kaveri Thermal Works Pvt Ltd"]);
const todayStr = iso(TODAY);
const daysBetween = (a, b) => Math.round((new Date(a + "T00:00:00Z") - new Date(b + "T00:00:00Z")) / 86400000);
const at = (d, h = 11) => `${d} ${pad(h)}:${pad(R.int(0, 59))}:00`;

export default async function (db) {
  const { lots, sales } = globalThis.__demo;

  // ---------------------------------------------------------------- sales invoices: one for each sale in the stock book, plus some of the sister company
  const inv = sales.map((s) => {
    const rate = s.lot.rate * (1.05 + R.next() * 0.06);
    const base = (s.kg) * rate;
    return { sale: s, entity: "NPF", no: `${s.inv}/${fyShort(s.date)}`, date: s.date, client: s.buyer, amount: Math.round(base * 1.18), credit: R.pick([30, 30, 45, 60]), po: `PO/${fyShort(s.date)}/${pad(R.int(100, 480), 4)}` };
  });
  let bseNo = 120;
  for (let i = 0; i < 34; i++) {
    const date = dayStr(R.int(2, 230));
    inv.push({ entity: "BSE", no: `${++bseNo}/${fyShort(date)}`, date, client: R.pick(CUSTOMERS), amount: Math.round(R.int(150000, 1650000)), credit: R.pick([30, 45, 60]), po: `PO/${fyShort(date)}/${pad(R.int(100, 480), 4)}` });
  }
  inv.sort((a, b) => a.date.localeCompare(b.date));
  inv.forEach((x, i) => { x.row = i + 2; x.due = addDays(x.date, x.credit); x.person = R.pick(PEOPLE); });

  await insert(db, "app.v_sales_invoices_store",
    ["entity", "row_no", "entered_at", "invoice_no", "invoice_date", "client", "salesperson", "po_no", "credit_days", "amount", "made_by", "checked_by", "emailed", "transporter", "fy", "due_date", "entry_no", "entries", "fy_mismatch"],
    inv.map((x) => [x.entity, x.row, at(x.date), x.no, x.date, x.client, x.person, x.po, x.credit, x.amount, R.pick(["Kabir", "Sana"]), R.pick(["Riya", "Aarav"]), "Yes", R.pick(TRANSPORTERS), fyOf(x.date), x.due, 1, 1, false]));

  // ---------------------------------------------------------------- who owes us: each invoice is paid, part paid or open
  const rec = inv.map((x) => {
    const late = daysBetween(todayStr, x.due);
    const big = BIG_DEBTORS.has(x.client);
    const roll = R.next();
    let received;
    if (late > 25) received = big ? (roll < 0.35 ? x.amount : roll < 0.5 ? Math.round(x.amount * R.int(30, 80) / 100) : 0) : roll < 0.84 ? x.amount : roll < 0.93 ? Math.round(x.amount * R.int(40, 90) / 100) : 0;
    else received = roll < 0.35 ? x.amount : roll < 0.5 ? Math.round(x.amount * R.int(30, 70) / 100) : 0;
    x.received = received; x.pending = x.amount - received;
    return x;
  });
  await insert(db, "app.v_receivables_store",
    ["entity", "row_no", "kind", "salesperson", "po_no", "invoice_no", "invoice_date", "credit_days", "due_date", "party", "amount", "received", "pending", "overdue_days"],
    rec.map((x, i) => [x.entity, i + 2, x.pending > 0 && daysBetween(todayStr, x.due) > 120 && R.chance(0.3) ? "Blocked" : x.pending > 0 && R.chance(0.15) ? "K Reminder" : null, x.person, x.po, x.no, x.date, x.credit, x.due, x.client, x.amount, x.received, x.pending, Math.max(0, daysBetween(todayStr, x.due))]));

  // ---------------------------------------------------------------- purchase invoices: one for each plate received
  const vendors = VENDORS;
  const pur = lots.map((l, i) => {
    const vendor = vendors[i % vendors.length];
    const basic = Math.round(l.invoiceKg * l.rate * 0.93);
    const gst = Math.round(basic * 0.18);
    const credit = R.pick([7, 15, 30]);
    return { entity: "NPF", no: `${vendor.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase()}/${fyShort(l.receipt)}/${R.int(1000, 9999)}`, date: l.receipt, vendor, credit, basic, amount: basic + gst, kg: l.invoiceKg, rate: money(basic / l.invoiceKg), broker: R.chance(0.45) ? R.pick(BROKERS) : null, by: R.pick(PEOPLE), forWho: R.chance(0.65) ? "STOCK" : R.pick(CUSTOMERS), lot: l };
  });
  for (let i = 0; i < 26; i++) {
    const date = dayStr(R.int(2, 200)), vendor = R.pick(vendors), amount = R.int(120000, 980000);
    pur.push({ entity: "BSE", no: `${vendor.split(" ")[0].slice(0, 3).toUpperCase()}/${fyShort(date)}/${R.int(1000, 9999)}`, date, vendor, credit: R.pick([7, 15, 30]), basic: Math.round(amount / 1.18), amount, kg: null, rate: null, broker: null, by: R.pick(PEOPLE), forWho: "STOCK" });
  }
  pur.sort((a, b) => a.date.localeCompare(b.date));
  pur.forEach((x, i) => { x.row = i + 2; x.due = addDays(x.date, x.credit); x.bill = `/demo-docs/bill-${(i % 6) + 1}.pdf`; });
  await insert(db, "app.v_purchase_invoices_store",
    ["entity", "row_no", "entered_at", "invoice_no", "invoice_date", "vendor", "credit_days", "amount", "checked_by", "broker", "purchased_by", "purchased_for", "file_url", "weight", "rate", "unit", "basic_amount", "tds", "fy", "due_date", "entry_no", "entries"],
    pur.map((x) => [x.entity, x.row, at(x.date, 15), x.no, x.date, x.vendor, x.credit, x.amount, R.pick(["Riya", "Aarav"]), x.broker, x.by, x.forWho, x.bill, x.kg, x.rate, x.kg ? "KG" : null, x.basic, 0, fyOf(x.date), x.due, 1, 1]));

  // what we owe: paid, part paid or open
  const pay = pur.map((x) => {
    const late = daysBetween(todayStr, x.due);
    const roll = R.next();
    const advance = late > 20 ? (roll < 0.86 ? x.amount : roll < 0.94 ? Math.round(x.amount * 0.5) : 0) : roll < 0.4 ? x.amount : roll < 0.55 ? Math.round(x.amount * 0.4) : 0;
    x.advance = advance; x.pending = x.amount - advance;
    return x;
  });
  await insert(db, "app.v_payables_store",
    ["entity", "row_no", "checked", "invoice_no", "invoice_date", "file_url", "buyer", "purchased_for", "credit_days", "due_date", "broker", "vendor", "amount", "advance", "tds", "pending", "remark", "overdue_days"],
    pay.map((x) => [x.entity, x.row, R.chance(0.85), x.no, x.date, x.bill, x.by, x.forWho, x.credit, x.due, x.broker, x.vendor, x.amount, x.advance, 0, x.pending, x.pending > 0 && R.chance(0.15) ? "Payment on Friday" : null, Math.max(0, daysBetween(todayStr, x.due))]));

  // ---------------------------------------------------------------- expenses, small payments, brokerage
  const exp = [];
  for (let i = 0; i < 90; i++) {
    const d = dayStr(R.int(1, 235)), cat = R.pick(EXPENSE_TYPES);
    exp.push([R.chance(0.78) ? "NPF" : "BSE", i + 2, at(d, 17), cat, R.chance(0.7) ? `${R.pick(["INV", "BL", "RC"])}-${R.int(100, 9999)}` : null, d,
      cat === "Office rent" ? "Harbor View Estates" : cat === "Electricity" ? "State Power Distribution" : cat === "Freight" || cat === "Loading charges" ? R.pick(TRANSPORTERS) : R.pick(["Quick Courier Services", "Apex Associates", "Metro Insurance Brokers", "Digital Telecom Ltd", "City Hardware Stores"]),
      cat === "Office rent" ? 85000 : cat === "Electricity" ? R.int(14000, 32000) : cat === "Freight" ? R.int(12000, 90000) : R.int(1500, 55000), cat === "Professional fees" ? R.int(500, 4000) : 0, R.pick(["Riya", "Aarav"]), R.chance(0.7) ? `/demo-docs/bill-${R.int(1, 6)}.pdf` : null, fyOf(d)]);
  }
  await insert(db, "app.v_expenses_store", ["entity", "row_no", "entered_at", "category", "invoice_no", "invoice_date", "vendor", "amount", "tds", "checked_by", "file_url", "fy"], exp);

  await insert(db, "app.v_gpay_payments_store", ["row_no", "entered_at", "description", "for_whom", "amount", "paid_by", "file_url", "fy"],
    Array.from({ length: 28 }, (_, i) => { const d = dayStr(R.int(1, 200)); return [i + 2, at(d, 13), R.pick(["Advance for plates", "Unloading labour", "Tea and refreshments", "Weighbridge slip", "Sample cutting", "Local tempo hire"]), R.pick([...BROKERS, ...TRANSPORTERS]), R.int(500, 45000), R.pick(["Kabir", "Sana", "Aarav"]), R.chance(0.6) ? `/demo-docs/bill-${R.int(1, 6)}.pdf` : null, fyOf(d)]; }));
  await insert(db, "app.v_petty_expenses_store", ["row_no", "entered_at", "who", "what", "amount", "file_url", "fy"],
    Array.from({ length: 34 }, (_, i) => { const d = dayStr(R.int(1, 200)); return [i + 2, at(d, 12), R.pick(["Sana", "Kabir", "Isha"]), R.pick(["Stationery", "Office snacks", "Auto fare", "Printing", "Courier packet", "Cleaning items"]), R.int(120, 4200), R.chance(0.3) ? `/demo-docs/bill-${R.int(1, 6)}.pdf` : null, fyOf(d)]; }));
  await insert(db, "app.v_brokerage_store", ["entity", "row_no", "entry_date", "party", "broker", "weight", "rate", "unit", "basic_amount"],
    Array.from({ length: 26 }, (_, i) => { const kg = R.int(2000, 22000), rate = R.pick([0.5, 0.75, 1, 1.25]); return ["NPF", i + 2, dayStr(R.int(1, 210)), R.pick(CUSTOMERS), R.pick(BROKERS), kg, rate, "KG", Math.round(kg * rate)]; }));

  // the totals shown on the overview
  const sum = (list, f) => list.reduce((a, x) => a + f(x), 0);
  const summary = [];
  for (const e of ["NPF", "BSE"]) {
    const r = rec.filter((x) => x.entity === e), p = pay.filter((x) => x.entity === e);
    summary.push([e, 2, "Total Debtors", sum(r, (x) => x.pending)], [e, 3, "Due Debtors", sum(r.filter((x) => daysBetween(todayStr, x.due) > 0), (x) => x.pending)],
      [e, 4, "Blocked", sum(r.filter((x) => x.pending > 0 && daysBetween(todayStr, x.due) > 120), (x) => x.pending)],
      [e, 5, "Total Creditors", sum(p, (x) => x.pending)], [e, 6, "Due Creditors", sum(p.filter((x) => daysBetween(todayStr, x.due) > 0), (x) => x.pending)]);
  }
  await insert(db, "app.v_pay_summary_store", ["entity", "row_no", "particulars", "amount"], summary);
  globalThis.__demo.invoices = inv;
  globalThis.__demo.purchases = pur;
  console.log(`payments: ${inv.length} sales invoices, ${pur.length} purchase invoices, ${exp.length} expenses`);
}
