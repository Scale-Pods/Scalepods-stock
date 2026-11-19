import "server-only";
import { call, q } from "@/lib/db";
import { type Check, type Read, docTypeFor, runChecks } from "./checks";
import {
  type ChallanRead, type FamilyRead, type InvoiceRead, type MtcRead, docTypeForFamily, runChallanChecks, runInvoiceChecks, runMtcChecks,
} from "./families";

// The document reader of the demonstration. In the real product a vision model reads the uploaded page; here nothing is sent anywhere. The kind of
// document is guessed from the file name, and a believable reading is made from the demo's own dummy records (the same every time for the same file name).
// The rules that check a reading (checks.ts, families.ts) are the real ones, so a reading is flagged amber exactly as it would be.

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ACCEPTED_TYPES = [...IMAGE_TYPES, "application/pdf"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 33 + c.charCodeAt(0)) >>> 0; return h; };
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const today = () => new Date().toISOString().slice(0, 10);
const gstin = (h: number) => `24${"ABCDEFGHJK"[h % 10]}${"LMNPRSTUVW"[(h >> 3) % 10]}${"ABCDEFGHJK"[(h >> 5) % 10]}${"LMNPRSTUVW"[(h >> 7) % 10]}${"ABCDEFGHJK"[(h >> 9) % 10]}${pad(h % 10000, 4)}A1Z${(h % 9) + 1}`;
const CUSTOMERS = ["Orion Boilers Pvt Ltd", "Vanguard Pressure Vessels Ltd", "Apex Heat Exchangers Pvt Ltd", "Sterling Process Engineers", "Kaveri Thermal Works Pvt Ltd", "Zenith Fabricators"];

type Lot = { code: string; thk: string; width: string; length: string; heat: string; plate: string | null; pieces: string; kg: string; spec: string };
async function lotFor(h: number): Promise<Lot> {
  const [l] = await q<Lot>(`select g.code, l.thickness_mm::int::text thk, l.width_mm::int::text width, l.length_mm::int::text length, l.heat_no heat, l.plate_no plate, l.pieces_received::text pieces, round(l.invoice_weight_kg)::text kg, coalesce(g.spec, '') spec
    from public.lots l join public.grades g on g.id = l.grade_id order by l.lot_no offset $1 limit 1`, [h % 100]);
  return l;
}

const kindOf = (name: string): "challan" | "mtc" | "invoice" | "po" =>
  /challan|slip|pad|outward|delivery/i.test(name) ? "challan" : /mtc|cert|tc[-_ ]|test|ibr/i.test(name) ? "mtc" : /bill|invoice|inv[-_ ]|tax/i.test(name) ? "invoice" : "po";

async function save(docId: string, stage: "first" | "second", model: string, version: string, read: unknown, checks: Check[], docType: string, final: boolean) {
  await call(`select public.record_extraction($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::public.doc_type, $13)`,
    [docId, stage, model, version, 2400 + (hash(docId) % 1800), 620 + (hash(docId) % 500), (0.0009 + (hash(docId) % 100) / 60000).toFixed(5), (3 + (hash(docId) % 40) / 10).toFixed(1), "end_turn", JSON.stringify(read), JSON.stringify(checks), docType, final]);
}

/** Read one uploaded document (made up from the demo's records) and save the reading. */
export async function readDocument(docId: string): Promise<{ ok: true; second: boolean; usd: number } | { ok: false; error: string }> {
  try {
    const rows = await q<{ mime_type: string; original_filename: string; extraction_status: string; review_status: string }>(
      `select mime_type, original_filename, extraction_status, review_status from public.documents where id = $1::uuid`, [docId]);
    const d = rows[0];
    if (!d) return { ok: false, error: "Document not found" };
    if (d.review_status !== "pending") return { ok: false, error: "This document has already been reviewed" };
    if (d.extraction_status === "needs_review") return { ok: true, second: false, usd: 0 };
    if (!ACCEPTED_TYPES.includes(d.mime_type)) return { ok: false, error: "Only PDF, JPG, PNG and WebP files can be read" };
    await sleep(1500);
    const h = hash(d.original_filename || docId), kind = kindOf(d.original_filename);
    const l = await lotFor(h);
    const rate = String(112 + (h % 30)), kg = Number(l.kg) || 5000, net = Math.round(kg * Number(rate)), tax = Math.round(net * 0.18);
    const model = "claude-haiku-5-5";

    if (kind === "invoice") {
      const read: InvoiceRead = { family: "invoice", direction: "we_are_buyer", vendor_name: "Meridian Steel Works", vendor_gstin: gstin(h), buyer_name: "Northwind Pipes & Fittings", buyer_gstin: "27AAAFN1234A1Z5", invoice_no: `MSW/26-27/${1000 + (h % 8999)}`, invoice_date: today(),
        irn: Array.from({ length: 64 }, (_, i) => "0123456789abcdef"[(h >> (i % 24)) % 16]).join(""), ack_no: String(100000000000000 + (h % 899999999999999)), eway_bill_no: String(100000000000 + (h % 899999999999)), vehicle_no: `MH04AB${pad(h % 10000, 4)}`, buyer_order_no: `PO/26-27/${pad(100 + (h % 380), 4)}`,
        payment_terms: "15 days", taxable_value: String(net), cgst: String(Math.round(tax / 2)), sgst: String(Math.round(tax / 2)), igst: "0", other_charges: "0", round_off: "0", total_amount: String(net + tax),
        lines: [{ description: `${l.code} plate ${l.thk} x ${l.width} x ${l.length}`, hsn: "7225", grade: l.code, thickness_mm: l.thk, width_mm: l.width, length_mm: l.length, pieces: l.pieces, weight_kg: l.kg, rate, rate_unit: "per_kg", amount: String(net), heat_no: l.heat, plate_no: l.plate ?? "" }], readable: true, uncertain: [] };
      await save(docId, "first", model, "invoice-demo", read, runInvoiceChecks(read), docTypeForFamily("invoice"), true);
    } else if (kind === "mtc") {
      const read: MtcRead = { family: "mtc", cert_kind: "mill_tc", certificate_no: `TC${100000 + (h % 899999)}`, mill_name: "Meridian Steel Works", issue_date: today(), specification: l.spec || l.code, grade: l.code, standard: "EN 10204 3.1", customer_name: "Northwind Pipes & Fittings", order_ref: `SO${6000000 + (h % 999999)}`, invoice_ref: String(7000000000 + (h % 999999999)),
        vehicle_no: "", total_weight: l.kg, weight_unit: "kg", items: [{ heat_no: l.heat, plate_no: l.plate ?? "", thickness_mm: l.thk, width_mm: l.width, length_mm: l.length, pieces: l.pieces, weight: l.kg, weight_unit: "kg" }], readable: true, uncertain: [] };
      await save(docId, "first", model, "mtc-demo", read, runMtcChecks(read), docTypeForFamily("mtc"), true);
    } else if (kind === "challan") {
      const read: ChallanRead = { family: "challan", challan_no: `T${2200 + (h % 700)}`, challan_date: today(), entity: "NPF", plot: h % 2 ? "D15" : "753", vehicle_no: `GJ06AB${pad(h % 10000, 4)}`, order_no: "", customer: CUSTOMERS[h % CUSTOMERS.length], total_weight_kg: String(Math.round(kg / 2)), loaded_by: "Ramesh",
        lines: [{ grade: l.code, thickness_mm: l.thk, width_mm: l.width, length_mm: l.length, pieces: String(Math.max(1, Math.round(Number(l.pieces) / 2))), heat_no: l.heat, weight_kg: String(Math.round(kg / 2)), balance: "" }], readable: true, uncertain: [] };
      await save(docId, "first", model, "challan-demo", read, runChallanChecks(read), docTypeForFamily("challan"), true);
    } else {
      const qty = String(kg);
      const read: Read = { doc_kind: "purchase_order", is_firm_order: true, direction: "customer_to_us", seller_entity_named: "Northwind Pipes & Fittings", buyer_name: CUSTOMERS[h % CUSTOMERS.length], buyer_gstin: gstin(h), po_number: `PO/26-27/${pad(100 + (h % 380), 4)}`, document_number: `PO/26-27/${pad(100 + (h % 380), 4)}`, po_date: today(), currency: "INR",
        payment_terms: "30 days from invoice", delivery_terms: "Ex stock, delivery within 7 days", net_amount: String(net), tax_amount: String(tax), total_amount: String(net + tax),
        lines: [{ description: `${l.code} plate`, grade: l.code, thickness_mm: l.thk, width_mm: l.width, length_mm: l.length, qty, qty_unit: "KG", weight_kg: qty, rate, rate_unit: "per_kg", amount: String(net) }], readable: true, uncertain: [] };
      await save(docId, "first", model, "po-demo", read, runChecks(read), docTypeFor(read), true);
    }
    void (0 as unknown as FamilyRead);
    return { ok: true, second: false, usd: 0.0012 };
  } catch {
    await call(`select public.fail_extraction($1::uuid, $2)`, [docId, "The document could not be read"]).catch(() => {});
    return { ok: false, error: "The document could not be read. You can try again." };
  }
}
