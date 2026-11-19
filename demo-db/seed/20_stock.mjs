// The stock book: plates received, plates sold, with dimensions, heat numbers and weights that add up.
import { insert, R, dayStr, CUSTOMERS, money } from "../lib.mjs";
import { GRADES } from "./10_masters.mjs";

const WIDTHS = [1250, 1500, 1800, 2000, 2500];
const LENGTHS = [6000, 6300, 8000, 10000, 12000];
const MILL_CODES = ["SA", "SB", "MK", "JV", "RT"];

export default async function (db) {
  const one = async (sql) => (await db.query(sql)).rows;
  const books = Object.fromEntries((await one("select id, code from public.stock_books")).map((b) => [b.code, b.id]));
  const npf = (await one("select id from public.entities where code = 'NPF'"))[0].id;
  const grades = Object.fromEntries((await one("select id, code from public.grades")).map((g) => [g.code, g.id]));
  const yards = (await one("select id from public.yards")).map((y) => y.id);
  const mills = (await one("select id from public.parties where 'mill' = any(roles) or 'vendor' = any(roles)")).map((p) => p.id);

  const lots = [];
  for (const g of GRADES) {
    for (const thk of g.thk) {
      const n = R.int(1, 3);
      for (let k = 0; k < n; k++) {
        const wide = thk <= 8 ? [1250, 1500] : WIDTHS, long = thk <= 8 ? [6000, 6300] : LENGTHS;
        const width = R.pick(wide), length = R.pick(long);
        const pieces = thk >= 32 ? R.int(1, 5) : R.int(2, 14);
        const perPiece = (thk * width * length * 7.85) / 1e6; // kg
        const age = R.chance(0.72) ? R.int(3, 225) : R.int(226, 640);
        lots.push({
          g, thk, width, length, pieces, perPiece, age, receipt: dayStr(age),
          heat: `${R.int(10000, 99999)}${R.pick(MILL_CODES)}`, plate: R.chance(0.3) ? `P${R.int(100, 999)}${String.fromCharCode(65 + R.int(0, 5))}` : null,
          tc: `TC${R.int(100000, 999999)}`, yard: R.pick(yards), mill: R.pick(mills),
          invoiceKg: money(perPiece * pieces * (0.996 + R.next() * 0.014)), rate: money(g.rate + R.int(-6, 6) + R.next()),
        });
      }
    }
  }
  const rows = lots.map((l) => [
    books[l.g.book], npf, "purchase", grades[l.g.code], l.g.code, l.thk, l.width, l.length, l.heat, l.plate, l.tc, l.receipt, l.pieces,
    l.invoiceKg, money(l.perPiece * l.pieces), l.yard, l.mill, "7225",
  ]);
  const made = await insert(db, "public.lots",
    ["stock_book_id", "entity_id", "origin", "grade_id", "grade_raw", "thickness_mm", "width_mm", "length_mm", "heat_no", "plate_no", "tc_no", "receipt_date", "pieces_received", "invoice_weight_kg", "theoretical_weight_kg", "yard_id", "mill_party_id", "hsn_code"],
    rows, { returning: "id, lot_no" });
  made.forEach((m, i) => { lots[i].id = m.id; lots[i].lot_no = m.lot_no; });

  // where each plate sits in the sheet copy (tab, row) and the links shown next to it
  const rowOfTab = {};
  await insert(db, "public.legacy_refs", ["table_name", "record_id", "source_tab", "source_row", "raw"], lots.map((l) => {
    const r = (rowOfTab[l.g.tab] = (rowOfTab[l.g.tab] ?? 3) + 1);
    return ["lots", l.id, l.g.tab, r, JSON.stringify({ link: `/demo-docs/mtc-${(parseInt(l.heat) % 5) + 1}.pdf`, tc_link: R.chance(0.5) ? `/demo-docs/tc-${(parseInt(l.heat) % 3) + 1}.pdf` : null, rate_per_kg: String(l.rate) })];
  }));

  // movements: the receipt, then some sales
  const mv = [];
  let inv = 380, vno = 2000;
  const sales = [];
  for (const l of lots) {
    const type = l.age > 590 ? "opening_count" : "receipt";
    mv.push({ lot: l, type, pieces: l.pieces, kg: l.invoiceKg, date: l.receipt, note: type === "receipt" ? `${l.g.book} purchase, heat ${l.heat}` : `${l.g.book} opening stock, heat ${l.heat}` });
    let left = l.pieces;
    const x = R.next();
    const nSales = x < 0.22 ? 0 : x < 0.5 ? 1 : x < 0.78 ? 2 : 3;
    for (let s = 0; s < nSales && left > 0; s++) {
      const last = s === nSales - 1 && R.chance(0.45);
      const p = Math.min(last ? left : R.int(1, Math.max(1, Math.ceil(left * 0.7))), left);
      const when = l.age <= 3 ? 0 : R.int(0, l.age - 2);
      sales.push({ lot: l, pieces: p, date: dayStr(when), buyer: R.pick(CUSTOMERS), plot: R.chance(0.7) ? "D15" : "753" });
      left -= p;
    }
  }
  sales.sort((a, b) => a.date.localeCompare(b.date));
  for (const s of sales) {
    const kg = money((s.lot.invoiceKg / s.lot.pieces) * s.pieces);
    s.inv = ++inv; s.vno = `T${++vno}`; s.kg = kg;
    mv.push({ lot: s.lot, type: "sale", pieces: -s.pieces, kg: -kg, date: s.date, note: `${s.lot.g.book} live: invoice ${s.inv}, V.NO ${s.vno}, plot ${s.plot}, buyer ${s.buyer}` });
  }
  await insert(db, "public.stock_movements", ["lot_id", "movement_type", "pieces", "weight_kg", "movement_date", "note"], mv.map((m) => [m.lot.id, m.type, m.pieces, m.kg, m.date, m.note]));

  globalThis.__demo = { lots, sales };
  console.log(`stock: ${lots.length} plates, ${sales.length} sales`);
}
