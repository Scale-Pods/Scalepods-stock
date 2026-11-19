// Connected mailboxes, the mill's dispatch mails (read into suggestions: some approved, some waiting, one set aside), and mail threads.
import { insert, R, TODAY, iso, dayStr, addDays, money, pad, CUSTOMERS, TRANSPORTERS, PLACES } from "../lib.mjs";
import { GRADES } from "./10_masters.mjs";

const q1 = async (db, sql, p) => (await db.query(sql, p)).rows;
const ts = (d, h, m) => `${d} ${pad(h ?? R.int(8, 19))}:${pad(m ?? R.int(0, 59))}:00+05:30`;
const ALIAS = { "SA 387 GR 11 CL2": "SA387 GR11 CL2", "SA 387 GR 22 CL2": "SA387 GR22 CL2", "16MO3": "16M03", "SA 387 GR 12 CL2": "SA387 GR12 CL2", "SA 516 GR 70": "SA516 GR70", "SA 537 CL 1": "SA537 CL1", S690QL: "S 690 QL", "ROCKSTAR 400": "ROCKSTAR400", "ROCKSTAR 500": "ROCKSTAR500", A36: "A 36" };

export default async function (db) {
  const { lots } = globalThis.__demo;
  const ent = Object.fromEntries((await q1(db, "select id, code from public.entities")).map((e) => [e.code, e.id]));
  const staff = Object.fromEntries((await q1(db, "select id, full_name from public.staff")).map((s) => [s.full_name, s.id]));

  const boxes = await insert(db, "public.mailboxes", ["address", "kind", "entity_id", "owner_staff_id", "active", "last_synced_at", "backfill_done", "messages_total", "storage_bytes"],
    [["demo@northwindpipes.example", "workspace", ent.NPF, staff["Aarav Mehta"], true, ts(iso(TODAY), 6, 10), true, 4120, 96e6],
     ["sales@bluecrest-steel.example", "workspace", ent.BSE, staff["Riya Shah"], true, ts(iso(TODAY), 6, 12), true, 1870, 41e6],
     ["accounts@northwindpipes.example", "workspace", ent.NPF, staff["Kabir Nair"], true, ts(iso(TODAY), 6, 14), true, 950, 18e6]], { returning: "id, address" });
  await insert(db, "public.mailbox_tokens", ["mailbox_id", "token_enc", "connected_by", "sender_filter", "subject_filter"], boxes.map((b) => [b.id, `demo:${b.address}`, staff["Demo Admin"], "meridian-steel.example", "dispatch detail"]));
  await insert(db, "public.mailbox_access", ["mailbox_id", "staff_id"], boxes.flatMap((b) => Object.values(staff).map((s) => [b.id, s])));

  // ---------------------------------------------------------------- the mill's dispatch mails
  const mills = [];
  const used = new Set();
  const take = (n) => { const out = []; for (const l of R.shuffle(lots)) { if (used.has(l.id) || l.thk < 8) continue; used.add(l.id); out.push(l); if (out.length === n) break; } return out; };
  const MAILS = [["approved", 11, 6], ["approved", 9, 5], ["approved", 7, 4], ["approved", 6, 5], ["approved", 4, 3], ["approved", 3, 4], ["pending", 1, 5], ["pending", 0, 3], ["rejected", 2, 4]];
  for (const [status, age, n] of MAILS) {
    const date = dayStr(age * 9 + R.int(0, 4)), picked = take(n);
    const entity = R.pick(["NPF", "NPF", "BSE"]);
    const customer = entity === "NPF" ? "NORTHWIND PIPES & FITTINGS" : "BLUECREST STEEL & ENGINEERING";
    const truck = `MH04${R.pick(["AB", "CD", "EF"])}${pad(R.int(1, 9999), 4)}`, tr = R.pick(TRANSPORTERS), tc = `TC${R.int(100000, 999999)}`;
    const rows = picked.map((l, i) => {
      const tonnes = money(l.invoiceKg / 1000);
      return { customer, entity, material_desc: `${l.g.code} PLATE`, material_code: `MC${R.int(10000, 99999)}`, so_item: `${R.int(6000000, 6999999)}-${(i + 1) * 10}`, thickness_mm: l.thk, width_mm: l.width, length_mm: l.length, pieces: l.pieces, tonnes,
        invoice_item: `${R.int(7000000000, 7999999999)}-${(i + 1) * 10}`, invoice_value: Math.round(tonnes * l.rate * 1000 * 1.18), invoice_date: date, batch: l.heat, upr: Math.round(l.rate * 1000), freight_per_ton: R.pick([900, 1100, 1250]),
        grade_text: ALIAS[l.g.code] ?? l.g.code, order_type: "Standard", ship_to: customer, destination: R.pick(PLACES), transporter: tr, truck_no: truck, tc_no: tc, driver_phone: `9${R.int(100000000, 999999999)}`, warnings: [] };
    });
    const totals = { rows: rows.length, pieces: rows.reduce((a, r) => a + r.pieces, 0), tonnes: money(rows.reduce((a, r) => a + r.tonnes, 0)), value: rows.reduce((a, r) => a + r.invoice_value, 0) };
    const consignments = [{ key: `${tr}|${truck}|${tc}`, truck_no: truck, transporter: tr, tc_no: tc, invoices: rows.map((r) => r.invoice_item), plates: rows.length, pieces: totals.pieces, tonnes: totals.tonnes, destination: rows[0].destination, entity }];
    mills.push({ status, date, rows, totals, consignments, picked, box: boxes[entity === "NPF" ? 0 : 1], warnings: status === "rejected" ? ["already received from an earlier mail"] : [] });
  }
  const mails = await insert(db, "public.mill_mails", ["mailbox_id", "gmail_id", "thread_id", "from_name", "from_addr", "subject", "received_at", "attachment_names", "source_kind", "source_text", "status", "note"],
    mills.map((m, i) => [m.box.id, `demo-mill-${i}`, `demo-mill-thread-${i}`, "Meridian Steel Works Dispatch", "dispatch@meridian-steel.example", `Dispatch details ${m.date.split("-").reverse().join("-")}`, ts(m.date, 16, R.int(0, 59)), "{dispatch_details.html}", "attachment_html", null, "read", null]), { returning: "id" });
  const rec = await insert(db, "public.mill_receipts", ["message_id", "status", "rows", "consignments", "totals", "warnings", "is_test", "decided_by", "decided_at", "note"],
    mills.map((m, i) => [mails[i].id, m.status, JSON.stringify(m.rows), JSON.stringify(m.consignments), JSON.stringify(m.totals), JSON.stringify(m.warnings), false,
      m.status === "pending" ? null : staff["Riya Shah"], m.status === "pending" ? null : ts(addDays(m.date, 1), 10, 5), m.status === "rejected" ? "set aside by the system: the same plates came in an earlier mail" : null]), { returning: "id" });
  await insert(db, "public.mill_receipt_lines", ["receipt_id", "invoice_item", "lot_id"],
    mills.flatMap((m, i) => (m.status === "approved" ? m.rows.map((r, k) => [rec[i].id, r.invoice_item, m.picked[k].id]) : [])));

  // the mill's open purchase orders
  const po = [];
  for (let i = 0; i < 18; i++) {
    const g = R.pick(GRADES), kg = R.int(5, 60) * 1000, got = R.chance(0.5) ? kg : Math.round(kg * R.next());
    po.push([`PO${R.int(400000, 499999)}`, `SO${R.int(6000000, 6999999)}`, g.code, dayStr(R.int(10, 150)), dayStr(R.int(5, 120)), R.pick(g.thk), kg, got, kg - got, "Open orders", "Mill orders", i + 2]);
  }
  await insert(db, "public.mill_po_lines", ["po_no", "so_no", "grade_raw", "po_date_text", "so_date_text", "size_mm", "ordered_kg", "received_kg", "pending_kg", "sheet_block", "source_tab", "source_row"], po);

  // ---------------------------------------------------------------- mail threads with a message or two each
  const parties = await q1(db, "select id, name from public.parties where 'customer' = any(roles)");
  const cats = ["enquiry", "quotation", "po", "mtc_request", "payment"];
  const SUBJ = { enquiry: "Enquiry for {g} plates", quotation: "Quotation for {g} {t} mm", po: "Purchase order for {g}", mtc_request: "Test certificates for heat {h}", payment: "Payment advice against invoice {i}" };
  const threads = [];
  for (let i = 0; i < 60; i++) {
    const cat = R.pick(cats), p = R.pick(parties), g = R.pick(GRADES), age = R.int(0, 90), last = `${dayStr(age)}`;
    const direction = R.pick(["in", "out", "out"]), status = age < 3 ? "needs_reply" : direction === "out" ? (age > 4 ? "follow_up" : "replied") : "new";
    const subject = SUBJ[cat].replace("{g}", g.code).replace("{t}", R.pick(g.thk)).replace("{h}", R.pick(lots).heat).replace("{i}", `${R.int(300, 520)}/26-27`);
    threads.push({ box: R.pick(boxes), p, cat, status, direction, subject, age, last, quote: cat === "quotation" ? `QT/26-27/${pad(R.int(700, 900), 4)}` : null });
  }
  const th = await insert(db, "public.mail_threads", ["mailbox_id", "gmail_thread_id", "subject", "party_id", "owner_staff_id", "category", "status", "first_message_at", "last_message_at", "last_direction", "last_out_at", "quote_no", "needs_reply", "last_inbound_at", "last_outbound_at", "classify_status"],
    threads.map((t, i) => [t.box.id, `demo-thread-${i}`, t.subject, t.p.id, R.pick([staff["Aarav Mehta"], staff["Riya Shah"], staff["Kabir Nair"]]), t.cat, t.status, ts(addDays(t.last, -R.int(0, 4)), 10, 0), ts(t.last, 15, 30), t.direction,
      t.direction === "out" ? ts(t.last, 15, 30) : null, t.quote, t.status === "needs_reply", t.direction === "in" ? ts(t.last, 15, 30) : ts(addDays(t.last, -1), 11, 0), t.direction === "out" ? ts(t.last, 15, 30) : null, "done"]), { returning: "id" });
  const msgs = [];
  th.forEach((r, i) => {
    const t = threads[i], who = `${t.p.name.split(" ")[0].toLowerCase()}@${t.p.name.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 12)}.example`;
    const ourAddr = t.box.address;
    const first = { dir: "in", at: ts(addDays(t.last, -R.int(0, 4)), 10, 0), from: who, to: [ourAddr], snippet: `Dear Sir, please share your best price and delivery for ${t.subject.toLowerCase()}. Regards.` };
    msgs.push([r.id, `demo-msg-${i}-0`, first.dir, first.from, `{${first.to.join(",")}}`, first.at, first.snippet, `${first.snippet}\n\nThanks and regards`]);
    if (t.direction === "out" || R.chance(0.5)) msgs.push([r.id, `demo-msg-${i}-1`, "out", ourAddr, `{${who}}`, ts(t.last, 15, 30), "Dear Sir, thank you for your enquiry. Please find our offer below. Material ex stock, payment 30 days.", "Dear Sir,\n\nThank you for your enquiry. Please find our offer below.\nMaterial: ex stock\nPayment: 30 days\n\nRegards,\nSales Team"]);
  });
  await insert(db, "public.mail_messages", ["thread_id", "gmail_message_id", "direction", "from_address", "to_addresses", "sent_at", "snippet", "body_text"], msgs);
  console.log(`mill and mail: ${boxes.length} mailboxes, ${mills.length} mill mails, ${threads.length} threads, ${msgs.length} messages`);
}
