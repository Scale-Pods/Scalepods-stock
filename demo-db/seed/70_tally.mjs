// The accounting-software copy: two companies, party ledgers whose balances mostly agree with the payment sheets (a few deliberately do not),
// outstanding bills, vouchers with item lines (the sales lines carry the plates' heat numbers, so the paperwork trail connects).
import { randomBytes } from "node:crypto";
import { insert, R, TODAY, iso, dayStr, addDays, money, pad, fyOf, fyShort, CUSTOMERS, VENDORS, TRANSPORTERS, PLACES } from "../lib.mjs";

const todayStr = iso(TODAY);
const hex = (n) => randomBytes(n).toString("hex"); // not used for logic; values are only shown
const STATES = [["Gujarat", "24"], ["Maharashtra", "27"], ["Tamil Nadu", "33"], ["Telangana", "36"], ["Karnataka", "29"], ["Rajasthan", "08"]];
const LET = "ABCDEFGHJKLMNPRSTUVWXYZ";
const gstin = (st) => `${st}${Array.from({ length: 5 }, () => R.pick(LET.split(""))).join("")}${pad(R.int(0, 9999), 4)}${R.pick(LET.split(""))}1Z${R.int(1, 9)}`;
const eway = () => String(R.int(100000000000, 999999999999));
const irn = () => Array.from({ length: 64 }, () => "0123456789abcdef"[R.int(0, 15)]).join("");
const after = (n) => dayStr(-n);

export default async function (db) {
  const { invoices, purchases, lots } = globalThis.__demo;
  const ent = Object.fromEntries((await db.query("select id, code from public.entities")).rows.map((e) => [e.code, e.id]));
  const stamp = `${todayStr} 06:05:00+05:30`;

  const comps = await insert(db, "public.tally_companies", ["entity_id", "tally_name", "tally_guid", "fy_label", "last_sync_at", "last_status", "active"],
    [[ent.NPF, "Northwind Pipes & Fittings", "demo-guid-npf", "FY 2026-27", stamp, "ok", true], [ent.BSE, "Bluecrest Steel & Engineering", "demo-guid-bse", "FY 2026-27", stamp, "ok", true]], { returning: "id, tally_name" });
  const cid = { NPF: comps[0].id, BSE: comps[1].id };

  // the connector that talks to the accounting software, shown as healthy at any hour the demo is opened
  await insert(db, "public.tally_connectors", ["name", "key_hash", "active", "last_seen_at", "last_status", "last_message", "last_version", "last_sync_ok_at"],
    [["Accounts PC connector", "demo-not-a-real-key", true, stamp, "ok", "Connected, waiting for the next sync", "1.4.2", stamp]]);
  await db.exec(`create or replace function public.tally_connector_state()
    returns table (seen_min integer, ok_min integer, last_seen_at timestamptz, last_status text, last_message text, last_version text, last_sync_ok_at timestamptz)
    language sql stable security definer set search_path = public as $$
      select 2, 14, now() - interval '2 minutes', 'ok'::text, 'Connected, waiting for the next sync'::text, '1.4.2'::text, now() - interval '14 minutes'
    $$;
    grant execute on function public.tally_connector_state() to authenticated;`);

  // ---------------------------------------------------------------- ledgers
  const state = new Map(CUSTOMERS.map((c) => [c, R.pick(STATES)]));
  const owed = { NPF: new Map(), BSE: new Map() }, ours = { NPF: new Map(), BSE: new Map() };
  for (const x of invoices) owed[x.entity].set(x.client, (owed[x.entity].get(x.client) ?? 0) + x.pending);
  for (const x of purchases) ours[x.entity].set(x.vendor, (ours[x.entity].get(x.vendor) ?? 0) + x.pending);
  const nudge = (v, c) => (R.chance(0.14) ? v + R.pick([-1, 1]) * R.int(2000, 60000) : v);
  const simName = (n) => n.replace("Pvt Ltd", "P Ltd").replace("Ltd", "Limited");

  const ledgers = [];
  let g = 0;
  const L = (co, name, group, bal, gst, st) => ledgers.push([cid[co], `demo-led-${++g}`, name, group, gst ?? null, st ?? null, money(bal)]);
  for (const co of ["NPF", "BSE"]) {
    let skipped = 0;
    for (const [client, pending] of owed[co]) {
      if (pending <= 0 && R.chance(0.5)) continue;
      if (skipped < 1 && R.chance(0.08)) { skipped++; continue; } // in the sheet but not in Tally
      const [st, code] = state.get(client);
      const name = R.chance(0.1) ? simName(client) : client;
      L(co, name, "Sundry Debtors", nudge(pending), R.chance(0.93) ? gstin(code) : null, st);
    }
    for (const x of ["Prakash Metal Trading", "Zephyr Engineering Co"]) L(co, x, "Sundry Debtors", R.int(20000, 400000), gstin("24"), "Gujarat"); // only in Tally
    for (const [vendor, pending] of ours[co]) L(co, vendor, "SUNDRY CREDITORS (FOR GOODS)", -nudge(pending), R.chance(0.95) ? gstin(R.pick(STATES)[1]) : null, R.pick(STATES)[0]);
    for (const t of TRANSPORTERS) L(co, t, "SUNDRY CREDITORS (FOR EXPENSES)", -R.int(0, 150000), gstin("24"), "Gujarat");
    for (const [n, gp, b] of [["Cash", "Cash-in-hand", 184500], ["City Commercial Bank (current)", "Bank Accounts", R.int(2000000, 9000000)], ["Metro Cooperative Bank (OD)", "Bank Accounts", -R.int(1000000, 4000000)], ["Output GST", "Duties & Taxes", -R.int(300000, 1400000)], ["Input GST", "Duties & Taxes", R.int(250000, 1100000)], ["TDS Receivable", "Current Assets", R.int(40000, 300000)], ["Sales", "Sales Accounts", 0], ["Purchases", "Purchase Accounts", 0], ["Freight Inward", "Direct Expenses", 0]]) L(co, n, gp, b);
  }
  await insert(db, "public.tally_ledgers", ["company_id", "tally_guid", "name", "parent_group", "gstin", "state", "closing_balance"], ledgers);

  // ---------------------------------------------------------------- outstanding bills
  const bills = [];
  for (const x of invoices) if (x.pending > 0) bills.push([cid[x.entity], "receivable", x.client, x.no, x.date, x.due, x.pending, todayStr]);
  for (const x of purchases) if (x.pending > 0) bills.push([cid[x.entity], "payable", x.vendor, x.no, x.date, x.due, x.pending, todayStr]);
  await insert(db, "public.tally_outstanding_bills", ["company_id", "kind", "party_ledger", "bill_ref", "bill_date", "due_date", "pending_amount", "as_of"], bills);

  // ---------------------------------------------------------------- vouchers: sales (with item lines), purchases, receipts and payments
  const sale = [];
  for (const x of invoices) {
    const taxable = Math.round(x.amount / 1.18);
    sale.push([cid[x.entity], `demo-v-s-${sale.length}`, "Sales", x.no, x.date, x.client, x.amount, `Being goods sold to ${x.client} against ${x.po}`, `${x.no}`, R.chance(0.9) ? irn() : null, R.pick(["Kabir Nair", "Riya Shah"]),
      JSON.stringify([{ ledger: x.client, amount: -x.amount }, { ledger: "Sales", amount: taxable }, { ledger: "Output GST", amount: x.amount - taxable }]),
      R.pick(["Shree Ganesh Transport", "Rapid Road Carriers", "Western Roadways"]), `GJ${pad(R.int(1, 30))}AB${pad(R.int(1, 9999), 4)}`, eway(), `PO NO : ${x.po}`, "27AAAPL" + R.int(1000, 9999) + "Q1ZP", state.get(x.client)?.[0] ?? "Gujarat", x]);
  }
  const salesV = await insert(db, "public.tally_vouchers",
    ["company_id", "tally_guid", "voucher_type", "voucher_no", "voucher_date", "party_ledger", "amount", "narration", "reference", "irn", "entered_by", "entries", "shipped_by", "vehicle_no", "eway_bill_no", "buyer_order_no", "party_gstin", "place_of_supply"],
    sale.map((s) => s.slice(0, 18)), { returning: "id, voucher_no, company_id" });
  const items = [];
  salesV.forEach((v, i) => {
    const x = sale[i][18], s = x.sale;
    if (s) {
      const l = s.lot, kg = s.kg, rate = money(x.amount / 1.18 / kg);
      items.push([v.id, 1, l.g.code, `${l.g.code} PLATE ${l.thk}X${l.width}X${l.length} MM, HEAT NO. ${l.heat}`, kg, "KG", rate, Math.round(x.amount / 1.18), "7225", "Main Location", l.heat]);
    } else {
      const l = R.pick(lots), kg = R.int(3, 25) * 1000, rate = money(x.amount / 1.18 / kg);
      items.push([v.id, 1, l.g.code, `${l.g.code} PLATE ${l.thk}X${l.width}X${l.length} MM, HEAT NO. ${l.heat}`, kg, "KG", rate, Math.round(x.amount / 1.18), "7225", "Main Location", l.heat]);
    }
  });

  const pur = purchases.slice(0, 120).map((x, i) => [cid[x.entity], `demo-v-p-${i}`, "Purchase", x.no, x.date, x.vendor, x.amount, `Being plates purchased from ${x.vendor}`, x.no, null, "Kabir Nair", JSON.stringify([{ ledger: x.vendor, amount: x.amount }, { ledger: "Purchases", amount: -x.basic }, { ledger: "Input GST", amount: -(x.amount - x.basic) }]), x]);
  const purV = await insert(db, "public.tally_vouchers", ["company_id", "tally_guid", "voucher_type", "voucher_no", "voucher_date", "party_ledger", "amount", "narration", "reference", "irn", "entered_by", "entries"], pur.map((p) => p.slice(0, 12)), { returning: "id" });
  purV.forEach((v, i) => { const x = pur[i][12], l = x.lot; if (l) items.push([v.id, 1, l.g.code, `${l.g.code} PLATE ${l.thk}X${l.width}X${l.length} MM, HEAT NO. ${l.heat}`, x.kg, "KG", x.rate, x.basic, "7225", "Main Location", l.heat]); });
  await insert(db, "public.tally_voucher_items", ["voucher_id", "line_no", "item_name", "description", "quantity", "unit", "rate", "amount", "hsn_code", "godown", "batch"], items);

  const money2 = [];
  let k = 0;
  for (const x of invoices) {
    const paid = x.amount - x.pending;
    if (paid > 0) money2.push([cid[x.entity], `demo-v-r-${k++}`, "Receipt", `R/${pad(k, 4)}`, addDays(x.date, Math.min(x.credit + R.int(-5, 20), 150)), x.client, paid, `Received from ${x.client} against ${x.no}`]);
  }
  for (const x of purchases) {
    const paid = x.amount - x.pending;
    if (paid > 0) money2.push([cid[x.entity], `demo-v-m-${k++}`, "Payment", `P/${pad(k, 4)}`, addDays(x.date, Math.min(x.credit + R.int(-3, 10), 90)), x.vendor, paid, `Paid to ${x.vendor} against ${x.no}`]);
  }
  const clipped = money2.filter((m) => m[4] <= todayStr);
  await insert(db, "public.tally_vouchers", ["company_id", "tally_guid", "voucher_type", "voucher_no", "voucher_date", "party_ledger", "amount", "narration"], clipped);

  // stock items and a week of sync history
  const names = [...new Set(lots.map((l) => `${l.g.code} ${l.thk}MM`))];
  await insert(db, "public.tally_stock_items", ["company_id", "tally_guid", "name", "parent_group", "unit", "closing_qty", "closing_value"],
    names.map((n, i) => [cid.NPF, `demo-si-${i}`, n, "Steel Plates", "KG", R.int(2, 90) * 1000, R.int(300000, 9000000)]));
  const runs = [];
  for (let d = 0; d < 7; d++) for (const co of ["NPF", "BSE"]) runs.push([cid[co], `${dayStr(d)} 06:00:00+05:30`, `${dayStr(d)} 06:0${R.int(3, 8)}:00+05:30`, "ok", R.int(20, 400), "schedule"]);
  await insert(db, "public.tally_sync_runs", ["company_id", "started_at", "finished_at", "status", "records_in", "trigger_type"], runs);
  console.log(`tally: ${ledgers.length} ledgers, ${bills.length} open bills, ${sale.length + pur.length + clipped.length} vouchers`);
}
