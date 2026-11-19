import "server-only";
import { q } from "../db";
import { TOOLS } from "./tools";
import type { ToolCtx } from "./refs";
import type { PageCtx } from "./engine";

// The "pre-written" AI of the demonstration. A question is matched to one of the sample question types below; the same read-only lookups as the
// real product (tools.ts) are run against the demo's made-up data and the answer is written from a template around the rows that came back.
// No AI service is called and no key is needed, so the same question always gives the same answer.

type Row = Record<string, unknown>;
export type Canned = { answer: string; sources: string[]; follow_ups: string[]; confidence: "found" | "partly" | "not_found" };
type Hooks = { onTool: (name: string, label: string) => Promise<void>; used: (u: { name: string; rows: number | null; ms: number }) => void };
type In = { question: string; history: { role: "user" | "assistant"; content: string }[]; files: { name: string }[]; quick: boolean; page?: PageCtx; role: string; ctx: ToolCtx };

const n0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const rs = (v: unknown) => { const n = Number(v); if (!Number.isFinite(n)) return "-"; const a = Math.abs(n); return a >= 1e7 ? `₹${(n / 1e7).toFixed(2)} crore` : a >= 1e5 ? `₹${(n / 1e5).toFixed(2)} lakh` : `₹${n0.format(Math.round(n))}`; };
const kgs = (v: unknown) => { const n = Number(v); return n >= 10000 ? `${(n / 1000).toFixed(1)} t` : `${n0.format(Math.round(n))} kg`; };
const plural = (n: number, w: string) => `${n0.format(n)} ${w}${n === 1 ? "" : "s"}`;
const cite = (refs: unknown, k = 1) => (Array.isArray(refs) && refs.length ? refs.slice(0, k).map((r) => `[${r}]`).join("") : "");
const table = (head: string[], rows: string[][]) => `| ${head.join(" | ")} |\n|${head.map(() => "---").join("|")}|\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}`;
const day = (s: unknown) => { const d = new Date(String(s).slice(0, 10) + "T00:00:00Z"); return Number.isNaN(+d) ? String(s) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); };

const GRADES: [RegExp, string][] = [
  [/rock\s*star\s*500|rs\s*500/i, "ROCKSTAR 500"], [/rock\s*star\s*400|rs\s*400/i, "ROCKSTAR 400"],
  [/gr(?:ade)?\.?\s*11|sa\s*387.*\b11\b/i, "SA 387 GR 11 CL2"], [/gr(?:ade)?\.?\s*22|sa\s*387.*\b22\b/i, "SA 387 GR 22 CL2"], [/gr(?:ade)?\.?\s*12|sa\s*387.*\b12\b/i, "SA 387 GR 12 CL2"],
  [/16\s*m[o0]\s*3/i, "16MO3"], [/516|gr(?:ade)?\.?\s*70/i, "SA 516 GR 70"], [/\ba\s*36\b/i, "A36"], [/\b537\b/i, "SA 537 CL 1"], [/690|s690/i, "S690QL"],
];
const gradeOf = (t: string) => GRADES.find(([re]) => re.test(t))?.[1] ?? null;
const mmOf = (t: string) => { const m = /(\d+(?:\.\d+)?)\s*mm/i.exec(t) ?? /thick(?:ness)?\s*(?:of|is|:)?\s*(\d+(?:\.\d+)?)/i.exec(t); return m ? Number(m[1]) : null; };
const sizeOf = (t: string) => { const m = /(\d+(?:\.\d+)?)\s*[x×*]\s*(\d{3,4})\s*[x×*]\s*(\d{4,5})/i.exec(t); return m ? { thk: Number(m[1]), w: Number(m[2]), l: Number(m[3]) } : null; };
const qtyOf = (t: string) => { const m = /(\d+(?:\.\d+)?)\s*(mt|tonnes?|tons?|kg|nos|pcs|plates?)\b/i.exec(t); if (!m) return null; const u = m[2].toLowerCase(); return { q: Number(m[1]), unit: /^(mt|ton)/.test(u) ? "mt" : u === "kg" ? "kg" : "nos" }; };

async function run(h: Hooks, ctx: ToolCtx, name: string, label: string, input: Row): Promise<unknown> {
  await h.onTool(name, label);
  const t = Date.now();
  const tool = TOOLS.find((x) => x.name === name)!;
  const out = await tool.run(input, ctx);
  h.used({ name, rows: Array.isArray(out) ? out.length : Array.isArray((out as Row)?.rows) ? ((out as Row).rows as unknown[]).length : null, ms: Date.now() - t });
  return out;
}

const HELP: Canned = {
  answer: `I can answer questions about your stock, money, orders and mail from the records in this app. In this demonstration I understand a set of sample questions. Try one of these:

- **Do we have SA 387 GR 22 CL2, 12 mm, 2000 x 6000?**
- **What is the oldest stock we have?**
- **Who owes us money?**
- **What do we owe our vendors?**
- **Give me the overview**
- **Which orders are open?**
- **How many quotations are waiting for a follow-up?**
- **What did we dispatch this month?**

You can also name a customer, for example *what does Orion Boilers owe us?*, or a grade and thickness for stock.`,
  sources: [], follow_ups: ["Who owes us money?", "What is the oldest stock we have?", "Give me the overview"], confidence: "partly",
};

export async function cannedAnswer(input: In, h: Hooks): Promise<Canned> {
  const t = input.question.trim();
  const low = t.toLowerCase();
  const ctx = input.ctx;
  const quick = input.quick;
  const rowsMax = quick ? 5 : 8;

  // ---------------------------------------------------------------- a file was attached: read it as a purchase order and check it against stock
  if (input.files.length > 0) {
    const [doc] = await q<{ id: string; extracted: Row }>(`select id, extracted from public.documents where doc_type = 'customer_po' and review_status = 'pending' order by received_at desc limit 1`);
    await h.onTool("documents_search", "Reading the file");
    h.used({ name: "documents_search", rows: 1, ms: 900 });
    const ex = (doc?.extracted ?? {}) as { buyer_name?: string; po_number?: string; po_date?: string; payment_terms?: string; delivery_terms?: string; total_amount?: string; lines?: Row[] };
    const line = (ex.lines ?? [])[0] ?? {};
    const fit = line.grade ? ((await run(h, ctx, "stock_check", "Checking stock", { grade: String(line.grade), thickness_mm: Number(line.thickness_mm), width_mm: Number(line.width_mm), length_mm: Number(line.length_mm), quantity: Number(line.qty), unit: "kg" })) as Row) : null;
    const best = ((fit?.best_plates as Row[]) ?? [])[0];
    const docRef = doc ? ctx.refs.add("Document in the app", `/documents/${doc.id}`, "app") : null;
    return {
      answer: `**${input.files[0].name}** reads as a customer purchase order${ex.buyer_name ? ` from **${ex.buyer_name}**` : ""}${docRef ? ` [${docRef}]` : ""}.

- PO number: **${ex.po_number ?? "-"}**, dated ${ex.po_date ? day(ex.po_date) : "-"}
- Payment: ${ex.payment_terms ?? "-"}; delivery: ${ex.delivery_terms ?? "-"}
- Total: **${rs(ex.total_amount)}** including GST
- Line 1: ${String(line.grade ?? "-")}, ${line.thickness_mm} x ${line.width_mm} x ${line.length_mm} mm, ${n0.format(Number(line.qty) || 0)} kg at ₹${line.rate}/kg

**Stock check for line 1:** ${fit ? `${fit.verdict === "enough" ? "we can supply it" : fit.verdict === "partly" ? "we can supply part of it" : "we do not have it in the right size"}. ${String(fit.summary ?? "")} ${best ? `Best match is plate ${best.plate} (${best.size_mm} mm, ${kgs(best.kg)}) ${cite(best.refs)}` : ""}` : "no grade was found on the first line."}

Open **Documents** to confirm the reading; nothing is saved until a person confirms it.`,
      sources: ["Documents: the file just read", "Stock: plates in stock"], follow_ups: ["What does this customer owe us?", "Which orders are open?", "Do we have other plates of this grade?"], confidence: "found",
    };
  }

  // ---------------------------------------------------------------- a plate: do we have it?
  const size = sizeOf(t);
  const grade = gradeOf(t);
  const thk = size?.thk ?? mmOf(t);
  const looksStock = /do we have|have we|in stock|available|can we supply|stock of|how much|how many plates|plates of|availability|check stock|any\b.*\bplate/i.test(low) || (grade && thk) || size;
  if (grade && /oldest|old stock|lying|ageing|aging/i.test(low)) {
    return stockAge(h, ctx, grade, thk, rowsMax);
  }
  if (grade && (thk || size) && !/summary|how much stock/i.test(low)) {
    const qty = qtyOf(t);
    const out = (await run(h, ctx, "stock_check", "Checking stock", { grade, thickness_mm: thk, width_mm: size?.w, length_mm: size?.l, ...(qty ? { quantity: qty.q, unit: qty.unit } : {}) })) as Row;
    return stockCheckAnswer(out, grade, thk, size, rowsMax);
  }
  if (grade && looksStock) {
    const out = (await run(h, ctx, "stock_summary", "Adding up stock", { grade })) as Row;
    const rows = ((out.rows as Row[]) ?? []).slice(0, rowsMax + 4);
    if (rows.length === 0) return { answer: `There is no ${grade} in stock at the moment.`, sources: ["Stock: plates in stock"], follow_ups: ["What is the oldest stock we have?", "Give me the overview"], confidence: "found" };
    const totalKg = ((out.rows as Row[]) ?? []).reduce((a, r) => a + Number(r.kg), 0);
    const plates = ((out.rows as Row[]) ?? []).reduce((a, r) => a + Number(r.plates), 0);
    return {
      answer: `We hold **${plural(plates, "plate")}, ${kgs(totalKg)}** of ${grade} across ${((out.rows as Row[]) ?? []).length} thicknesses.\n\n${table(["Thickness", "Plates", "Pieces", "Weight"], rows.map((r) => [`${r.thickness_mm} mm ${cite(r.refs)}`, String(r.plates), String(r.pieces), kgs(r.kg)]))}\n\nStock figures are those of the stock book, loaded on ${day(((out.data_as_of as Row)?.stock_book_loaded_on as string) ?? new Date().toISOString())}.`,
      sources: ["Stock: plates in stock"], follow_ups: [`Do we have ${grade} 12 mm, 2000 x 6000?`, `What is the oldest ${grade} we have?`, "Give me the overview"], confidence: "found",
    };
  }
  if (/oldest|old stock|lying|ageing|aging|slow moving|dead stock/i.test(low)) return stockAge(h, ctx, grade, thk, rowsMax);

  // ---------------------------------------------------------------- money
  const SKIP = new Set(["pvt", "ltd", "limited", "private", "and", "the", "co", "llp", "works", "india"]);
  const best = (names: string[]) => {
    const qw = new Set(low.replace(/[^a-z0-9 ]/g, " ").split(/\s+/));
    let pick: string | null = null, top = 0;
    for (const n of names) { const w = n.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((x) => x.length > 2 && !SKIP.has(x)); const hit = w.filter((x) => qw.has(x)).length; if (hit > top && (hit >= 2 || w.length === 1 || (hit === 1 && w[0] && qw.has(w[0])))) { top = hit; pick = n; } }
    return pick;
  };
  const customers = (await q<{ party: string }>(`select distinct party from public.v_receivables`)).map((x) => x.party);
  const vendors = (await q<{ party: string }>(`select distinct vendor party from public.v_payables`)).map((x) => x.party);
  const wantVendor = /we owe|payable|vendor|creditor|supplier|mill dues|to pay|bills to pay/i.test(low);
  const nv = best(vendors), nc = best(customers);
  const named = wantVendor ? nv : /owe us|owes|receivable|debtor|outstanding|overdue|dues|to receive/i.test(low) ? nc : (nc ?? nv);
  const isVendor = wantVendor || (named !== null && named === nv && named !== nc);

  if (/we owe|payable|vendor|creditor|supplier|mill dues|to pay|bills to pay/i.test(low) || (named && isVendor)) {
    const out = (await run(h, ctx, "payables", "Checking what we owe", named && isVendor ? { vendor: named } : {})) as Row[];
    if (named && isVendor) {
      const total = out.reduce((a, r) => a + Number(r.pending), 0);
      return { answer: `We owe **${named}** ${rs(total)} across ${out.length} open bill${out.length === 1 ? "" : "s"}.\n\n${table(["Bill", "Due", "Pending", "Overdue"], out.slice(0, rowsMax).map((r) => [`${r.invoice_no} ${cite(r.refs)}`, day(r.due_date), rs(r.pending), Number(r.overdue_days) > 0 ? `${r.overdue_days} days` : "not due"]))}`, sources: ["Payments: purchase invoices"], follow_ups: ["What do we owe our vendors?", "Who owes us money?"], confidence: "found" };
    }
    const total = out.reduce((a, r) => a + Number(r.pending_rs), 0);
    return { answer: `We owe vendors about **${rs(total)}** in total across the ${out.length} biggest creditors shown here.\n\n${table(["Vendor", "Open bills", "Pending", "Longest overdue"], out.slice(0, rowsMax).map((r) => [`${r.vendor} ${cite(r.refs)}`, String(r.bills), rs(r.pending_rs), Number(r.max_days_overdue) > 0 ? `${r.max_days_overdue} days` : "none"]))}\n\nEach figure is the total of all that vendor's open bills.`, sources: ["Payments: purchase invoices"], follow_ups: ["Who owes us money?", "Give me the overview", "What did we dispatch this month?"], confidence: "found" };
  }
  if (/owe us|owes|receivable|debtor|outstanding|overdue|who.*pay|dues|to receive|collection|pending payment/i.test(low) || (named && !isVendor)) {
    const onlyLate = /overdue|late|past due/i.test(low);
    const out = (await run(h, ctx, "receivables", "Checking what customers owe", named && !isVendor ? { party: named } : { only_overdue: onlyLate })) as Row[];
    if (named && !isVendor) {
      const total = out.reduce((a, r) => a + Number(r.pending), 0), late = out.filter((r) => Number(r.overdue_days) > 0).reduce((a, r) => a + Number(r.pending), 0);
      if (out.length === 0) return { answer: `**${named}** has no unpaid invoices at the moment.`, sources: ["Payments: sales invoices"], follow_ups: ["Who owes us money?"], confidence: "found" };
      return { answer: `**${named}** owes us **${rs(total)}** across ${out.length} invoice${out.length === 1 ? "" : "s"}, of which ${rs(late)} is past its due date.\n\n${table(["Invoice", "Due", "Pending", "Overdue"], out.slice(0, rowsMax).map((r) => [`${r.invoice_no} ${cite(r.refs)}`, day(r.due_date), rs(r.pending), Number(r.overdue_days) > 0 ? `${r.overdue_days} days` : "not due"]))}`, sources: ["Payments: sales invoices"], follow_ups: ["Who owes us money?", "Prepare a payment reminder for this customer", "Which orders are open?"], confidence: "found" };
    }
    const total = out.reduce((a, r) => a + Number(r.pending_rs), 0);
    return { answer: `Customers owe us about **${rs(total)}** in total across the ${out.length} biggest debtors${onlyLate ? " (overdue invoices only)" : ""}.\n\n${table(["Customer", "Open invoices", "Pending", "Longest overdue"], out.slice(0, rowsMax).map((r) => [`${r.party} ${cite(r.refs)}`, String(r.invoices), rs(r.pending_rs), Number(r.max_days_overdue) > 0 ? `${r.max_days_overdue} days` : "none"]))}\n\nEach figure is the total of all that customer's open invoices. A payment reminder can be prepared under **Invoices and payments**.`, sources: ["Payments: sales invoices"], follow_ups: ["What do we owe our vendors?", `What does ${out[0]?.party ?? "the biggest debtor"} owe us?`, "Give me the overview"], confidence: "found" };
  }
  if (/overview|how are we|how is business|headline|summary of business|balance|status of business/i.test(low)) {
    const o = (await run(h, ctx, "overview", "Getting the overview", {})) as Row;
    return { answer: `Here is where things stand:\n\n- **Stock:** ${n0.format(Number(o.plates_in_stock))} plates, ${kgs(o.kg_in_stock)} ${cite(o.refs)}\n- **Open orders:** ${o.open_orders}\n- **Customers owe us:** ${rs(o.to_receive_rs)}\n- **We owe vendors:** ${rs(o.to_pay_rs)}\n- **Sales invoiced this month:** ${rs(o.sales_this_month_rs)}\n- **New leads in the last 7 days:** ${o.leads_last_7_days}\n- **Mails waiting for a reply:** ${o.mails_waiting}\n\nThe net money position is ${Number(o.to_receive_rs) >= Number(o.to_pay_rs) ? "in our favour" : "against us"} by ${rs(Math.abs(Number(o.to_receive_rs) - Number(o.to_pay_rs)))}.`, sources: ["Overview: stock, orders, payments, mail"], follow_ups: ["Who owes us money?", "Which orders are open?", "What is the oldest stock we have?"], confidence: "found" };
  }

  // ---------------------------------------------------------------- orders and dispatch
  if (/order|\bpo\b|pending delivery|\blate\b/i.test(low) && !/quotation|mill/i.test(low)) {
    const open = /open|pending|late|not (yet )?(done|dispatched)|waiting/i.test(low) || !/complete|done/i.test(low);
    const out = (await run(h, ctx, "orders_search", "Looking at orders", { status: open ? "Open" : "Complete", limit: rowsMax })) as Row;
    const orders = (out.orders as Row[]) ?? [];
    return { answer: `There are **${out.total_matching} ${open ? "open" : "completed"} orders**${open ? "" : ""}. The latest ${orders.length}:\n\n${table(["Order", "Customer", "Grades", "Delivery by", "Lines done"], orders.map((o) => [`${o.order_no} ${cite(o.refs)}`, String(o.client), String(o.grades ?? "-"), o.etd ? day(o.etd) : "-", `${o.done_lines}/${o.lines}`]))}`, sources: ["Orders: the order list"], follow_ups: ["Who owes us money?", "What did we dispatch this month?", "Give me the overview"], confidence: "found" };
  }
  if (/dispatch|vehicle|truck|trip|sent out|outward/i.test(low)) {
    await run(h, ctx, "dispatch_search", "Checking dispatches", { limit: 1 }).catch(() => null);
    const [s] = await q<{ trips: string; kg: string; since: string }>(`select count(*) trips, coalesce(sum(weight_kg), 0) kg, date_trunc('month', current_date)::date::text since from public.v_vehicle_register where dispatch_date >= date_trunc('month', current_date)`);
    const rows = await q<{ dispatch_date: string; vehicle_no: string; grade: string; weight_kg: string; invoice_no: string }>(`select dispatch_date::text, vehicle_no, grade, weight_kg::text, invoice_no from public.v_vehicle_register where dispatch_date is not null order by dispatch_date desc, row_no desc limit ${rowsMax}`);
    const ref = ctx.refs.add("Vehicle register", "/orders/vehicles", "app");
    return { answer: `So far this month we have sent **${s.trips} trips, ${kgs(s.kg)}** [${ref}]. The latest dispatches:\n\n${table(["Date", "Vehicle", "Grade", "Weight", "Invoice"], rows.map((r) => [day(r.dispatch_date), r.vehicle_no, r.grade, kgs(r.weight_kg), r.invoice_no]))}`, sources: ["Orders: vehicle register"], follow_ups: ["Which orders are open?", "Give me the overview"], confidence: "found" };
  }

  // ---------------------------------------------------------------- mail and leads
  if (/follow.?up/i.test(low) && /quot/i.test(low)) {
    await h.onTool("leads_mail_quotes", "Looking at mail and leads");
    const [c] = await q<{ n: string; v: string }>(`select count(*) n, coalesce(sum(price * 1000), 0) v from public.v_quotations where source_tab = 'Tracker' and not fu1 and days >= 3 and status = 'Open'`);
    const rows = await q<{ quote_no: string; client_name: string; material: string; days: string; quoted_at: string }>(`select quote_no, client_name, material, days::int::text days, quoted_at::text from public.v_quotations where source_tab = 'Tracker' and not fu1 and days >= 3 and status = 'Open' order by quoted_at asc limit ${rowsMax}`);
    h.used({ name: "leads_mail_quotes", rows: rows.length, ms: 120 });
    const ref = ctx.refs.add("Quotations with no follow-up", "/mail/quotations?show=followup", "app");
    return { answer: `**${c.n} quotations** were sent three or more days ago and have not been followed up yet [${ref}]. The oldest:

${table(["Quote", "Customer", "Material", "Sent", "Days"], rows.map((r) => [r.quote_no ?? "-", r.client_name, r.material, day(r.quoted_at), r.days]))}

Open **Mail and leads → Quotations** and choose the follow-up filter to work through them.`, sources: ["Mail and leads: quotations sent"], follow_ups: ["Show me the latest leads", "Who owes us money?", "Give me the overview"], confidence: "found" };
  }
  if (/quotation|quote|follow.?up|enquir|lead|inbox|mail/i.test(low)) {
    const kind = /lead|enquir/i.test(low) && !/quotation|quote/i.test(low) ? "leads" : /inbox|reply|waiting|mail/i.test(low) && !/quotation|quote|follow/i.test(low) ? "mail" : "quotations";
    const out = (await run(h, ctx, "leads_mail_quotes", "Looking at mail and leads", { kind, limit: rowsMax, ...(kind === "quotations" ? { status: /follow|open|pending/i.test(low) ? "Open" : undefined } : {}) })) as Row[];
    if (kind === "leads") return { answer: `The latest marketplace leads:\n\n${table(["Date", "Name", "Company", "Product", "City"], out.map((r) => [day(r.day), `${r.name} ${cite(r.refs)}`, String(r.company), String(r.product), String(r.city)]))}`, sources: ["Mail and leads: marketplace leads"], follow_ups: ["How many quotations are waiting for a follow-up?", "Give me the overview"], confidence: "found" };
    if (kind === "mail") return { answer: `Mails waiting in the tracker (newest first):\n\n${table(["Received", "From", "Subject", "Status"], out.map((r) => [day(r.day), `${r.from_name} ${cite(r.refs)}`, String(r.subject), String(r.status ?? "-")]))}`, sources: ["Mail and leads: inbox tracker"], follow_ups: ["How many quotations are waiting for a follow-up?", "Show me the latest leads"], confidence: "found" };
    return { answer: `Quotations that are still open (latest first):\n\n${table(["Quote", "Customer", "Material", "Price/kg", "Sent"], out.map((r) => [`${r.quote_no ?? "-"} ${cite(r.refs)}`, String(r.client_name), String(r.material), `₹${r.price}`, day(r.day)]))}\n\nQuotes with no follow-up are listed under **Mail and leads → Quotations**.`, sources: ["Mail and leads: quotations sent"], follow_ups: ["Show me the latest leads", "Who owes us money?"], confidence: "found" };
  }
  if (/tally/i.test(low)) {
    await h.onTool("tally_party", "Looking in Tally");
    const [s] = await q<{ ledgers: string; vouchers: string; last: string }>(`select (select count(*) from public.tally_ledgers where deleted_at is null) ledgers, (select count(*) from public.tally_vouchers where deleted_at is null) vouchers, (select max(voucher_date)::text from public.tally_vouchers) last`);
    h.used({ name: "tally_party", rows: 1, ms: 200 });
    const ref = ctx.refs.add("Tally status", "/tally", "app");
    return { answer: `Tally is connected and was last read this morning [${ref}]. The copy holds **${s.ledgers} ledgers** and **${s.vouchers} vouchers**, the latest dated ${day(s.last)}. Open **Tally → Debtors vs sheets** to see where the balances differ from the payment sheets.`, sources: ["Tally: status and vouchers"], follow_ups: ["Who owes us money?", "Give me the overview"], confidence: "found" };
  }
  // ---------------------------------------------------------------- the physical count
  if (/physical count|stock count|counting|how is the count/i.test(low)) {
    await h.onTool("count_status", "Checking the stock counts");
    const rows = await q<{ name: string; status: string; book: string; lines: string; kg: string; started: string | null }>(`select s.name, s.status, b.code book, (select count(*) from public.count_lines c where c.session_id = s.id and c.match_status <> 'rejected') lines, (select coalesce(sum(c.weight_kg), 0) from public.count_lines c where c.session_id = s.id and c.match_status <> 'rejected') kg, s.started_at::text started from public.count_sessions s join public.stock_books b on b.id = s.stock_book_id order by s.started_at desc nulls last limit 4`);
    h.used({ name: "count_status", rows: rows.length, ms: 150 });
    const ref = ctx.refs.add("Physical count", "/count", "app");
    return { answer: `There ${rows.length === 1 ? "is 1 count" : `are ${rows.length} counts`} on record [${ref}]:\n\n${table(["Count", "Book", "Status", "Plates counted", "Weight"], rows.map((r) => [r.name, r.book, r.status, r.lines, kgs(r.kg)]))}\n\nThe one in progress is counted plot by plot; differences are only posted after an approver agrees.`, sources: ["Physical count: sessions and counted plates"], follow_ups: ["What is the oldest stock we have?", "Give me the overview"], confidence: "found" };
  }
  // ---------------------------------------------------------------- mill orders
  if (/mill order|still to arrive|pending from (the )?mill|ordered from (the )?mill/i.test(low)) {
    await h.onTool("sheet_search", "Looking at the mill orders");
    const rows = await q<{ grade_raw: string; ordered: string; received: string; pending: string; n: string }>(`select grade_raw, sum(ordered_kg)::text ordered, sum(received_kg)::text received, sum(pending_kg)::text pending, count(*)::text n from public.mill_po_lines group by grade_raw order by sum(pending_kg) desc limit ${rowsMax}`);
    h.used({ name: "sheet_search", rows: rows.length, ms: 140 });
    const ref = ctx.refs.add("Mill orders", "/mill-orders", "app");
    const pend = rows.reduce((a, r) => a + Number(r.pending), 0);
    return { answer: `About **${kgs(pend)}** is still to arrive from the mill orders [${ref}]. By grade:\n\n${table(["Grade", "Order lines", "Ordered", "Received", "Still to come"], rows.map((r) => [r.grade_raw, r.n, kgs(r.ordered), kgs(r.received), kgs(r.pending)]))}`, sources: ["Mill orders: purchase order lines"], follow_ups: ["What is the oldest stock we have?", "Give me the overview"], confidence: "found" };
  }
  // ---------------------------------------------------------------- most / least stock by grade
  if (/(most|least|lowest|highest|biggest|smallest).*(stock)|which grade/i.test(low)) {
    await h.onTool("stock_summary", "Adding up stock");
    const least = /least|lowest|smallest/i.test(low);
    const rows = await q<{ grade: string; plates: string; kg: string }>(`select g.code grade, count(*)::text plates, round(sum(l.balance_kg))::text kg from public.v_lots_current l join public.grades g on g.id = l.grade_id where l.current_status = 'available' and l.balance_kg > 0 group by g.code order by sum(l.balance_kg) ${least ? "asc" : "desc"} limit ${rowsMax}`);
    h.used({ name: "stock_summary", rows: rows.length, ms: 130 });
    const ref = ctx.refs.add("Summary", "/summary", "app");
    return { answer: `${rows[0].grade} has the ${least ? "least" : "most"} stock: **${kgs(rows[0].kg)}** in ${rows[0].plates} plates [${ref}].\n\n${table(["Grade", "Plates", "Weight"], rows.map((r) => [r.grade, r.plates, kgs(r.kg)]))}`, sources: ["Stock: plates in stock"], follow_ups: ["What is the oldest stock we have?", "Give me the overview"], confidence: "found" };
  }
  // ---------------------------------------------------------------- what changed in stock lately
  if (/what changed|changed in stock|this week.*stock|stock.*this week|received.*(this|last) week|came in/i.test(low)) {
    await h.onTool("stock_movements", "Adding up what came in and went out");
    const [m] = await q<{ rin: string; kin: string; rout: string; kout: string; first: string }>(`select count(*) filter (where weight_kg > 0)::text rin, coalesce(sum(weight_kg) filter (where weight_kg > 0), 0)::text kin, count(*) filter (where weight_kg < 0)::text rout, coalesce(-sum(weight_kg) filter (where weight_kg < 0), 0)::text kout, (current_date - 7)::text first from public.stock_movements where movement_date >= current_date - 7`);
    const rows = await q<{ movement_date: string; movement_type: string; kg: string; note: string }>(`select movement_date::text, movement_type::text, abs(weight_kg)::text kg, note from public.stock_movements where movement_date >= current_date - 14 and movement_type::text not in ('opening_count') order by movement_date desc, seq desc limit ${rowsMax}`);
    h.used({ name: "stock_movements", rows: rows.length, ms: 160 });
    const ref = ctx.refs.add("Plates", "/plates", "app");
    return { answer: `In the last 7 days **${m.rin} receipts (${kgs(m.kin)})** came in and **${m.rout} sales (${kgs(m.kout)})** went out [${ref}]. The latest movements:\n\n${table(["Date", "Type", "Weight", "Note"], rows.map((r) => [day(r.movement_date), r.movement_type, kgs(r.kg), (r.note ?? "").slice(0, 60)]))}`, sources: ["Stock: movements"], follow_ups: ["What is the oldest stock we have?", "What did we dispatch this month?"], confidence: "found" };
  }
  // ---------------------------------------------------------------- documents and drafts waiting
  if (/document|draft|waiting for review|to review/i.test(low) && !/review items|serious/i.test(low)) {
    await h.onTool("documents_search", "Looking at documents");
    const rows = await q<{ id: string; original_filename: string; doc_type: string; received_at: string; extraction_status: string }>(`select id, original_filename, doc_type::text, received_at::text, extraction_status from public.documents where review_status = 'pending' order by received_at desc limit ${rowsMax}`);
    const [c] = await q<{ docs: string; drafts: string }>(`select (select count(*) from public.documents where review_status = 'pending') docs, (select count(*) from public.drafts where status = 'open') drafts`);
    h.used({ name: "documents_search", rows: rows.length, ms: 140 });
    return { answer: `**${c.docs} documents** are waiting to be checked and **${c.drafts} drafts** are open. The latest documents:\n\n${table(["File", "Kind", "Received", "Reading"], rows.map((r) => [`${r.original_filename} [${ctx.refs.add(`Document ${r.original_filename}`, `/documents/${r.id}`, "app")}]`, r.doc_type.replace(/_/g, " "), day(r.received_at), r.extraction_status === "needs_review" ? "ready to check" : r.extraction_status]))}\n\nOpen **Documents** to confirm each reading; nothing is saved until a person confirms it.`, sources: ["Documents: uploaded and read files"], follow_ups: ["Which orders are open?", "Give me the overview"], confidence: "found" };
  }
  // ---------------------------------------------------------------- things to review
  if (/review|serious|exception|needs attention/i.test(low)) {
    await h.onTool("paperwork_gaps", "Checking what needs review");
    const kinds = await q<{ severity: string; kind: string; n: string }>(`select severity::text, kind::text, count(*)::text n from public.exceptions where status = 'open' group by 1, 2 order by (case severity::text when 'error' then 0 when 'warning' then 1 else 2 end), count(*) desc`);
    const top = await q<{ severity: string; message: string }>(`select severity::text, message from public.exceptions where status = 'open' order by (case severity::text when 'error' then 0 when 'warning' then 1 else 2 end), raised_at limit ${quick ? 3 : 5}`);
    h.used({ name: "paperwork_gaps", rows: top.length, ms: 140 });
    const ref = ctx.refs.add("Needs review", "/review", "app");
    const total = kinds.reduce((a, k) => a + Number(k.n), 0);
    return { answer: `**${total} items** need a person to look at them [${ref}]. The most serious first:\n\n${top.map((t) => `- **${t.severity === "error" ? "Serious" : t.severity === "warning" ? "Check" : "Note"}:** ${t.message}`).join("\n")}\n\nOpen **Needs review** to decide each one; every decision is recorded.`, sources: ["Needs review: open items"], follow_ups: ["Which documents are waiting for review?", "Give me the overview"], confidence: "found" };
  }
  if (/hello|hi\b|hey|help|what can you|who are you|thank/i.test(low)) return HELP;

  // ---------------------------------------------------------------- not a sample question
  void looksStock; void input.history; void input.page;
  return HELP;
}

async function stockAge(h: Hooks, ctx: ToolCtx, grade: string | null, thk: number | null, rowsMax: number): Promise<Canned> {
  const out = (await run(h, ctx, "stock_age", "Checking how old the stock is", { ...(grade ? { grade } : {}), ...(thk ? { thickness_mm: thk } : {}), limit: rowsMax })) as Row;
  const old = (out.oldest_first as Row[]) ?? [];
  const bands = (out.stock_by_age as Row[]) ?? [];
  if (old.length === 0) return { answer: `I found no plates in stock${grade ? ` of ${grade}` : ""}.`, sources: ["Stock: plates in stock"], follow_ups: ["Give me the overview"], confidence: "found" };
  return {
    answer: `The oldest plates still in stock${grade ? ` of ${grade}` : ""}, by the date they were received:\n\n${table(["Plate", "Grade", "Size (mm)", "Received", "In stock", "Weight"], old.map((r) => [`${r.lot_no} ${cite(r.refs)}`, String(r.grade), `${r.thk} x ${r.width} x ${r.length}`, day(r.received), `${r.days_in_stock} days`, kgs(r.kg)]))}\n\n**By age:** ${bands.map((b) => `${b.age}: ${b.plates} plates (${kgs(b.kg)})`).join("; ")}.`,
    sources: ["Stock: plates in stock, received dates"], follow_ups: ["Who owes us money?", "Give me the overview", "Do we have SA 387 GR 22 CL2, 12 mm, 2000 x 6000?"], confidence: "found",
  };
}

function stockCheckAnswer(out: Row, grade: string, thk: number | null, size: { thk: number; w: number; l: number } | null, rowsMax: number): Canned {
  const best = ((out.best_plates as Row[]) ?? []).slice(0, rowsMax);
  const near = ((out.nearby_thickness as Row[]) ?? []).slice(0, 3);
  const verdict = String(out.verdict);
  const what = `${out.grade_read_as ?? grade}${thk ? `, ${thk} mm` : ""}${size ? `, ${size.w} x ${size.l}` : ""}`;
  const head = verdict === "enough" ? `**Yes, we have it.** ${what}: **${plural(Number(out.plates), "plate")}, ${plural(Number(out.pieces), "piece")}, ${kgs(out.kg)}** fit the size asked.`
    : verdict === "partly" ? `**Only part of it.** ${what}: we can cover **${plural(Number(out.plates), "plate")}, ${kgs(out.kg)}** of what was asked.`
    : `**No, not in that size.** ${what}: nothing in stock fits.`;
  const lines = [head, verdict === "enough" ? "" : String(out.summary ?? "")];
  if (best.length) lines.push(table(["Plate", "Size (mm)", "Pieces", "Weight", "Heat no.", "Company"], best.map((r) => [`${r.plate} ${cite(r.refs)}`, String(r.size_mm), String(r.pieces), kgs(r.kg), String(r.heat_no ?? "-"), String(r.company ?? "-")])));
  if (verdict !== "enough" && near.length) lines.push(`**Nearby thickness we do have:** ${near.map((r) => `${r.size_mm} mm, ${kgs(r.kg)} ${cite(r.refs)}`).join("; ")}.`);
  lines.push(`Stock figures are those of the stock book, loaded on ${day(((out.data_as_of as Row)?.stock_book_loaded_on as string) ?? new Date().toISOString())}.`);
  return { answer: lines.filter(Boolean).join("\n\n"), sources: ["Stock: plates in stock"], follow_ups: [`What is the oldest ${grade} we have?`, "Which orders are open?", "Who owes us money?"], confidence: verdict === "none" ? "partly" : "found" };
}
