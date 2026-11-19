// Documents the system has "read": customer orders, vendor bills, mill test certificates and delivery challans, with the reading kept,
// the checks that flagged something, the drafts waiting to be checked and the decisions already made.
import { insert, R, TODAY, iso, dayStr, addDays, money, pad, CUSTOMERS } from "../lib.mjs";

const q1 = async (db, sql, p) => (await db.query(sql, p)).rows;
const ts = (d, h) => `${d} ${pad(h ?? R.int(8, 19))}:${pad(R.int(0, 59))}:00+05:30`;
const sha = () => Array.from({ length: 64 }, () => "0123456789abcdef"[R.int(0, 15)]).join("");
const GST = "27AAAFN1234A1Z5";
const gstinOf = () => `24${Array.from({ length: 5 }, () => "ABCDEFGHJKLMNPRSTUVWXYZ"[R.int(0, 22)]).join("")}${pad(R.int(0, 9999), 4)}A1Z${R.int(1, 9)}`;
const s = (v) => (v == null ? "" : String(v));

export default async function (db) {
  const { lots, sales, purchases } = globalThis.__demo;
  const staff = Object.fromEntries((await q1(db, "select id, full_name from public.staff")).map((x) => [x.full_name, x.id]));
  const ent = Object.fromEntries((await q1(db, "select id, code from public.entities")).map((e) => [e.code, e.id]));
  const orders = await q1(db, "select order_no, client, po_no, order_date::text d, grades, company from app.v_orders_store order by order_no_num desc limit 14");

  const docs = [], reads = [], drafts = [];
  const add = (type, name, date, extracted, review, extraStatus = "done") => { docs.push({ type, name, date, extracted, review, extraStatus }); };

  // customer orders
  orders.forEach((o, i) => {
    const g = o.grades.split(", ")[0];
    const qty = R.int(3, 24) * 1000, rate = money(110 + R.next() * 40), net = Math.round(qty * rate), tax = Math.round(net * 0.18);
    const read = { doc_kind: "purchase_order", is_firm_order: i % 5 !== 4, direction: "customer_to_us", seller_entity_named: "Northwind Pipes & Fittings", buyer_name: o.client, buyer_gstin: gstinOf(), po_number: o.po_no, document_number: o.po_no, po_date: o.d,
      currency: "INR", payment_terms: R.pick(["30 days from invoice", "45 days", "Advance 25%, balance on delivery"]), delivery_terms: R.pick(["Ex stock, delivery in 7 days", "Within 2 weeks at our works"]), net_amount: String(net), tax_amount: String(tax), total_amount: String(net + tax),
      lines: [{ description: `${g} plate`, grade: g, thickness_mm: String(R.pick([10, 12, 16, 20, 25])), width_mm: "2000", length_mm: "6000", qty: String(qty), qty_unit: "KG", weight_kg: String(qty), rate: String(rate), rate_unit: "per_kg", amount: String(net) }], readable: true, uncertain: [] };
    const reviewed = i >= 6;
    add("customer_po", `po-${(i % 4) + 1}.pdf`, o.d, read, reviewed ? { decision: i === 9 ? "corrected" : "confirmed", note: i === 9 ? "Rate corrected from the covering mail" : null } : null, "done");
    if (!reviewed) drafts.push({ idx: docs.length - 1, read, kind: "order" });
  });

  // vendor bills
  purchases.slice(0, 8).forEach((p, i) => {
    const l = p.lot;
    const read = { family: "invoice", direction: "we_are_buyer", vendor_name: p.vendor, vendor_gstin: gstinOf(), buyer_name: "Northwind Pipes & Fittings", buyer_gstin: GST, invoice_no: p.no, invoice_date: p.date, irn: sha(), ack_no: String(R.int(1e14, 9e14)), eway_bill_no: String(R.int(1e11, 9e11)),
      vehicle_no: `MH04AB${pad(R.int(1, 9999), 4)}`, buyer_order_no: `PO/26-27/${pad(R.int(100, 400), 4)}`, payment_terms: `${p.credit} days`, taxable_value: String(p.basic), cgst: String(Math.round((p.amount - p.basic) / 2)), sgst: String(Math.round((p.amount - p.basic) / 2)), igst: "0", other_charges: "0", round_off: "0", total_amount: String(p.amount),
      lines: l ? [{ description: `${l.g.code} plate ${l.thk} x ${l.width} x ${l.length}`, hsn: "7225", grade: l.g.code, thickness_mm: String(l.thk), width_mm: String(l.width), length_mm: String(l.length), pieces: String(l.pieces), weight_kg: String(l.invoiceKg), rate: String(p.rate), rate_unit: "per_kg", amount: String(p.basic), heat_no: l.heat, plate_no: l.plate ?? "" }] : [], readable: true, uncertain: i === 2 ? ["rate"] : [] };
    add("purchase_invoice", `bill-${(i % 6) + 1}.pdf`, p.date, read, i >= 4 ? { decision: "confirmed", note: null } : null);
  });

  // test certificates
  lots.slice(0, 8).forEach((l, i) => {
    const read = { family: "mtc", cert_kind: "mill_tc", certificate_no: l.tc, mill_name: "Meridian Steel Works", issue_date: l.receipt, specification: l.g.spec, grade: l.g.code, standard: "EN 10204 3.1", customer_name: "Northwind Pipes & Fittings", order_ref: `SO${R.int(6000000, 6999999)}`, invoice_ref: `${R.int(7e9, 7.9e9)}`,
      vehicle_no: "", total_weight: String(l.invoiceKg), weight_unit: "kg", items: [{ heat_no: l.heat, plate_no: l.plate ?? "", thickness_mm: String(l.thk), width_mm: String(l.width), length_mm: String(l.length), pieces: String(l.pieces), weight: String(l.invoiceKg), weight_unit: "kg" }], readable: true, uncertain: [] };
    add("mtc", `mtc-${(i % 5) + 1}.pdf`, l.receipt, read, i >= 3 ? { decision: "confirmed", note: null } : null);
  });

  // delivery challans (photos of the handwritten pad)
  sales.slice(-8).forEach((x, i) => {
    const read = { family: "challan", challan_no: x.vno, challan_date: x.date, entity: "NPF", plot: x.plot, vehicle_no: `GJ06AB${pad(R.int(1, 9999), 4)}`, order_no: "", customer: x.buyer, total_weight_kg: String(Math.round(x.kg)), loaded_by: R.pick(["Ramesh", "Sunil"]),
      lines: [{ grade: x.lot.g.code, thickness_mm: String(x.lot.thk), width_mm: String(x.lot.width), length_mm: String(x.lot.length), pieces: String(x.pieces), heat_no: x.lot.heat, weight_kg: String(Math.round(x.kg)), balance: "" }], readable: true, uncertain: i === 1 ? ["heat_no"] : [] };
    add("outward_slip", `challan-${(i % 3) + 1}.pdf`, x.date, read, i >= 5 ? { decision: "confirmed", note: null } : null);
  });

  const rows = await insert(db, "public.documents",
    ["entity_id", "doc_type", "source", "original_filename", "mime_type", "size_bytes", "sha256", "storage_path", "gmail_message_id", "received_at", "uploaded_by", "extraction_status", "extracted", "review_status", "reviewed_by", "reviewed_at"],
    docs.map((d, i) => [ent.NPF, d.type, R.pick(["upload", "gmail", "whatsapp"]), d.name, "application/pdf", R.int(40000, 380000), sha(), `demo/${d.name}`, null, ts(d.date, 11), R.pick([staff["Riya Shah"], staff["Kabir Nair"], staff["Demo Admin"]]), d.review ? "extracted" : "needs_review", JSON.stringify(d.extracted), d.review ? "confirmed" : "pending",
      d.review ? staff["Riya Shah"] : null, d.review ? ts(addDays(d.date, 1), 15) : null]), { returning: "id" });

  await insert(db, "public.extraction_runs", ["document_id", "stage", "model", "prompt_version", "input_tokens", "output_tokens", "usd", "seconds", "stop_reason", "result", "checks"],
    docs.map((d, i) => [rows[i].id, "first", "claude-haiku-5-5", "v3", R.int(1800, 4200), R.int(500, 1400), money(0.0005 + R.next() * 0.002), money(3 + R.next() * 5), "end_turn", JSON.stringify(d.extracted),
      JSON.stringify(d.extracted.uncertain?.length ? [{ field: d.extracted.uncertain[0], level: "amber", message: `The reader was not sure about the ${d.extracted.uncertain[0]}: please check it against the page` }] : [])]));
  await insert(db, "public.document_reviews", ["document_id", "decision", "final", "changes", "note", "reviewer_id", "reviewed_at"],
    docs.flatMap((d, i) => (d.review ? [[rows[i].id, d.review.decision, JSON.stringify(d.extracted), JSON.stringify(d.review.decision === "corrected" ? [{ field: "rate", from: "148", to: "142" }] : []), d.review.note, staff["Riya Shah"], ts(addDays(d.date, 1), 15)]] : [])));

  // drafts: orders read from customer POs, waiting to be checked
  const dr = await insert(db, "public.drafts", ["document_id", "kind", "status", "customer_name", "customer_gstin", "po_no", "doc_no", "doc_date", "delivery_terms", "payment_terms", "total_amount", "created_by"],
    drafts.map((x) => [rows[x.idx].id, x.kind, "open", x.read.buyer_name, x.read.buyer_gstin, x.read.po_number, x.read.document_number, x.read.po_date, x.read.delivery_terms, x.read.payment_terms, Number(x.read.total_amount), staff["Kabir Nair"]]), { returning: "id" });
  await insert(db, "public.draft_lines", ["draft_id", "line_no", "description", "grade_raw", "thickness_mm", "width_mm", "length_mm", "quantity", "unit_code", "weight_kg", "rate", "rate_unit", "amount"],
    drafts.flatMap((x, i) => x.read.lines.map((l, k) => [dr[i].id, k + 1, l.description, l.grade, Number(l.thickness_mm), Number(l.width_mm), Number(l.length_mm), Number(l.qty), "KG", Number(l.weight_kg), Number(l.rate), "per_kg", Number(l.amount)])));
  console.log(`documents: ${docs.length} documents, ${drafts.length} drafts`);
}
