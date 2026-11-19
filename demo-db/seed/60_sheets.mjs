// The "copies of the Google Sheets" shown in the Sheet view, and the rows the Summary tab and the dashboards read from them.
// Everything is made up and built from the same dummy lots, invoices and orders as the rest of the demo.
import { createHash } from "node:crypto";
import { R, TODAY, iso, sheetDate, money, CUSTOMERS, SALES_PEOPLE } from "../lib.mjs";
import { GRADES } from "./10_masters.mjs";

const md5 = (x) => createHash("md5").update(JSON.stringify(x)).digest("hex");
const s = (v) => (v == null ? "" : String(v));
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MON = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

export default async function (db) {
  const { lots, sales, invoices, purchases, contacts } = globalThis.__demo;
  const sources = [];
  const rows = []; // [source, tab, row_no, cells, links]
  const add = (source, tab, cellsList, links = []) => cellsList.forEach((cells, i) => rows.push([source, tab, i + 1, cells.map(s), links[i] ?? null]));
  const source = (key, name, tabs) => sources.push({ key, name, tabs });

  // ---------------------------------------------------------------- the two stock books: Summary + a tab for each grade
  const books = { WB1: { key: "wb1_stock_ims", name: "Stock book: alloy plates (WB1)" }, WB2: { key: "wb2_stock_npf_rfs", name: "Stock book: pressure vessel and wear plates (WB2)" } };
  for (const [code, b] of Object.entries(books)) {
    const grades = GRADES.filter((g) => g.book === code);
    const tabs = ["Summary", ...grades.map((g) => g.tab)];
    // the Summary: one row per grade and thickness band
    const head = code === "WB1"
      ? [["Summary of stock · 1/4/26 – 31/3/27"], ["Grade", "Thickness", "Bought 22-23 (kg)", "Bought 23-24 (kg)", "Bought 24-25 (kg)", "Bought 25-26 (kg)", "Avg Rate", "Sold 26-27 Q1", "Sold Q2", "Sold Q3", "Sold Q4"]]
      : [["Summary of stock · 1/1/26 – 31/3/27"], ["Grade", "Thickness", "Avg Rate", "Purchase", "Sale", "Balance", "25-26 Q4", "26-27 Q1", "26-27 Q2", "26-27 Q3", "26-27 Q4"]];
    const spine = [];
    const SUMMARY_NAME = { "GR. 11": "GR 11 U", "GR. 22": "GR 22 U", "16M03": "16M03 U", "GR. 12  W": "GR 12 U", A36: "A 36" };
    for (const g of grades) {
      const name = code === "WB1" ? (SUMMARY_NAME[g.tab] ?? g.tab) : g.tab;
      const t = g.thk;
      for (let i = 0; i < t.length; i += 2) {
        const band = t.slice(i, i + 2).join(" / ") + " MM";
        spine.push(code === "WB1"
          ? [name, band, ...[0, 1, 2, 3].map(() => R.int(8, 60) * 1000), inr(g.rate + R.int(-3, 3)), "", "", "", ""]
          : [name, band, inr(g.rate + R.int(-3, 3)), "", "", "", "", "", "", "", ""]);
      }
    }
    add(b.key, "Summary", [...head, ...spine]);

    // a tab for each grade: one line per plate received
    for (const g of grades) {
      const mine = lots.filter((l) => l.g === g).sort((a, c) => a.thk - c.thk || a.receipt.localeCompare(c.receipt));
      const header = ["Date", "Thickness", "Width", "Length", "Nos", "Weight (kg)", "Heat No", "Plate No", "HSN", "Rate / kg", "Yard", "MTC", "TC"];
      const body = mine.map((l) => [sheetDate(l.receipt), l.thk, l.width, l.length, l.pieces, l.invoiceKg, l.heat, l.plate ?? "", "7225", l.rate, "", "MTC", "TC"]);
      const links = mine.map((l) => ({ 11: `/demo-docs/mtc-${(parseInt(l.heat) % 5) + 1}.pdf`, ...(R.chance(0.5) ? { 12: `/demo-docs/tc-${(parseInt(l.heat) % 3) + 1}.pdf` } : {}) }));
      add(b.key, g.tab, [[`${g.code} · stock received`], header, ...body], [null, null, ...links]);
    }
    source(b.key, b.name, tabs);
  }

  // ---------------------------------------------------------------- the payment sheets: sales and purchases, one workbook for each company
  for (const [ent, key] of [["NPF", "npf_payment_better"], ["BSE", "bse_payment_better"]]) {
    const sale = invoices.filter((x) => x.entity === ent), pur = purchases.filter((x) => x.entity === ent);
    add(key, "M Sale", [["Date", "Invoice No", "Client", "Salesperson", "PO No", "Credit days", "Amount", "Due date", "Received", "Pending"],
      ...sale.map((x) => [sheetDate(x.date), x.no, x.client, x.person, x.po, x.credit, inr(x.amount), sheetDate(x.due), inr(x.received ?? 0), inr(x.pending ?? x.amount)])]);
    add(key, "M Pur", [["Date", "Invoice No", "Vendor", "Broker", "Credit days", "Basic", "Amount", "Due date", "Paid", "Pending"],
      ...pur.map((x) => [sheetDate(x.date), x.no, x.vendor, x.broker ?? "", x.credit, inr(x.basic), inr(x.amount), sheetDate(x.due), inr(x.advance ?? 0), inr(x.pending ?? x.amount)])]);
    source(key, `Payment Better (${ent})`, ["M Sale", "M Pur"]);
  }

  // ---------------------------------------------------------------- the mail tracker: a few numbers at the top and the client master
  const quotes = (await db.query("select count(*) filter (where status = 'Open') o, count(*) filter (where quote_no is not null) n from app.v_quotations_store")).rows[0];
  const pending = (await db.query("select count(*) n from app.v_mail_inbox_store where state = 'Pending'")).rows[0];
  const stamp = iso(TODAY).split("-").reverse().join("-") + " 06:00";
  add("email_tracker", "Dashboard", [["Total Pending", pending.n], ["Open Quotations", quotes.o], ["Numbered Quotations", quotes.n], ["Last Synced", stamp]]);
  add("email_tracker", "Client Master", [["Client", "Email", "Contact person", "City"], ...contacts.map((c) => [c.company, c.email, c.name, ""])]);
  source("email_tracker", "Mail tracker", ["Dashboard", "Client Master"]);

  // ---------------------------------------------------------------- dispatch: the monthly totals at the top of the year tab
  const trips = (await db.query("select to_char(dispatch_date, 'YYYY-MM') m, plot, sum(weight_kg) kg from app.v_vehicle_register_store where dispatch_date >= '2026-04-01' group by 1, 2")).rows;
  const monthly = MON.map((m, i) => {
    const key = `${i < 9 ? 2026 : 2027}-${String(((i + 3) % 12) + 1).padStart(2, "0")}`;
    const p753 = Number(trips.filter((t) => t.m === key && t.plot === "753").reduce((a, t) => a + Number(t.kg), 0));
    const d15 = Number(trips.filter((t) => t.m === key && t.plot === "D15").reduce((a, t) => a + Number(t.kg), 0));
    return [`${m}-${String(i < 9 ? 26 : 27)}`, Math.round(p753), Math.round(d15), Math.round(p753 + d15), Math.round((p753 + d15) * 1.2)];
  });
  add("dispatch_26_27", "26-27", [["Month", "Plot 753 (kg)", "Plot D15 (kg)", "Total (kg)", "Freight (Rs)"], ...monthly]);
  source("dispatch_26_27", "Dispatch FMS 26-27", ["26-27"]);

  // ---------------------------------------------------------------- write
  const now = new Date().toISOString();
  const stamp0 = new Date(Date.UTC(2026, 10, 14, 0, 30)).toISOString();
  for (const x of sources) {
    await db.query("insert into public.sheet_sources (key, name, spreadsheet_id, active, tabs, last_modified_at, last_synced_at) values ($1, $2, $3, true, $4, $5, $5)",
      [x.key, x.name, `demo-${x.key}`, JSON.stringify(x.tabs.map((t) => ({ title: t, hidden: false }))), stamp0]);
  }
  for (let i = 0; i < rows.length; i += 150) {
    const part = rows.slice(i, i + 150), params = [];
    const tuples = part.map(([src, tab, no, cells, links]) => { params.push(src, tab, no, JSON.stringify(cells), links ? JSON.stringify(links) : null, md5(cells)); const n = params.length; return `($${n - 5},$${n - 4},$${n - 3},$${n - 2}::jsonb,$${n - 1}::jsonb,$${n})`; });
    await db.query(`insert into public.sheet_rows (source_key, tab, row_no, cells, links, row_hash) values ${tuples.join(",")}`, params);
  }
  await db.query("refresh materialized view app.sheet_tab_meta_store");
  void now; void money; void CUSTOMERS; void SALES_PEOPLE;
  console.log(`sheets: ${sources.length} workbooks, ${rows.length} rows`);
}
