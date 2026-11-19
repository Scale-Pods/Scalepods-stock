// The remaining small things: a physical count in progress and one finished, items that need review, payment reminders already sent, client profiles.
import { insert, R, TODAY, iso, dayStr, addDays, money, pad } from "../lib.mjs";

const q1 = async (db, sql, p) => (await db.query(sql, p)).rows;
const ts = (d, h) => `${d} ${pad(h ?? R.int(8, 19))}:${pad(R.int(0, 59))}:00+05:30`;

export default async function (db) {
  const { lots, invoices } = globalThis.__demo;
  const staff = Object.fromEntries((await q1(db, "select id, full_name from public.staff")).map((x) => [x.full_name, x.id]));
  const books = Object.fromEntries((await q1(db, "select id, code from public.stock_books")).map((b) => [b.code, b.id]));
  const grades = Object.fromEntries((await q1(db, "select id, code from public.grades")).map((g) => [g.code, g.id]));
  const yards = (await q1(db, "select id, code from public.yards")).map((y) => y.id);

  // ---------------------------------------------------------------- physical count
  const sess = await insert(db, "public.count_sessions", ["stock_book_id", "name", "planned_date", "started_at", "closed_at", "status", "notes", "created_by"], [
    [books.WB1, "Alloy plates: Plot D15 count", dayStr(3), ts(dayStr(3), 9), null, "counting", "Counting plot by plot, heavy plates first", staff["Kabir Nair"]],
    [books.WB2, "Wear plates quarterly count", dayStr(62), ts(dayStr(62), 9), ts(dayStr(60), 17), "posted", "Posted after approval", staff["Kabir Nair"]]], { returning: "id" });
  const live = lots.filter((l) => l.g.book === "WB1" && l.age < 200);
  const picks = R.shuffle(live).slice(0, 26);
  await insert(db, "public.count_lines", ["session_id", "yard_id", "grade_id", "grade_raw", "heat_no", "plate_no", "thickness_mm", "width_mm", "length_mm", "pieces", "weight_kg", "counted_by", "counted_at", "matched_lot_id", "match_status"],
    picks.map((l, i) => [sess[0].id, l.yard, grades[l.g.code], l.g.code, l.heat, l.plate, l.thk, l.width, l.length, i % 9 === 4 ? Math.max(1, l.pieces - 1) : l.pieces, money(l.perPiece * (i % 9 === 4 ? Math.max(1, l.pieces - 1) : l.pieces)),
      staff["Kabir Nair"], ts(dayStr(R.int(0, 2)), R.int(9, 17)), i === 7 ? null : l.id, i === 7 ? "unmatched" : "matched"]));

  // ---------------------------------------------------------------- needs review
  const some = R.shuffle(lots).slice(0, 18);
  const ex = [];
  some.forEach((l, i) => {
    const k = ["weight_warning", "duplicate_key", "legacy_data", "legacy_data", "blocked_entry", "other"][i % 6];
    const sev = k === "legacy_data" ? "info" : k === "weight_warning" ? "warning" : k === "duplicate_key" ? "error" : "warning";
    const msg = {
      weight_warning: `Weight sold is 1.4% above the weight received for heat ${l.heat}: please confirm the weighbridge slip`,
      duplicate_key: `Plate number ${l.plate ?? "P" + R.int(100, 999)} appears on two different heats in ${l.g.tab}`,
      legacy_data: `A note in the old sheet for heat ${l.heat} could not be matched to a column ("${R.pick(["waiting for TC", "cut piece", "see Ramesh", "hold for order"])}")`,
      blocked_entry: `An entry for heat ${l.heat} was blocked: the plate is marked on hold in the sheet`,
      other: `The yard for heat ${l.heat} is blank in the sheet; it was set to the main yard`,
    }[k];
    ex.push([k, sev, msg, "lots", l.id, ts(dayStr(R.int(0, 40)), 10)]);
  });
  await insert(db, "public.exceptions", ["kind", "severity", "message", "related_table", "related_id", "raised_at"], ex);

  // ---------------------------------------------------------------- reminders already sent
  const mb = (await q1(db, "select id from public.mailboxes where address like 'accounts@%'"))[0].id;
  const late = new Map();
  for (const x of invoices) if (x.pending > 0 && x.due < iso(TODAY)) { const e = late.get(x.client) ?? { n: 0, sum: 0, oldest: 0, nos: [] }; e.n++; e.sum += x.pending; e.nos.push(x.no); e.oldest = Math.max(e.oldest, Math.round((TODAY - new Date(x.due + "T00:00:00Z")) / 86400000)); late.set(x.client, e); }
  const sent = [...late.entries()].sort((a, b) => b[1].sum - a[1].sum).slice(0, 8);
  await insert(db, "public.payment_reminders", ["party", "entity", "mailbox_id", "to_emails", "cc_emails", "subject", "invoice_nos", "overdue_count", "total_pending", "oldest_days", "tone", "gmail_message_id", "gmail_thread_id", "sent_by", "sent_at"],
    sent.map(([name, e], i) => [name, "NPF", mb, `accounts@${name.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 14)}.example`, "", `Payment reminder: ${e.n} overdue invoice${e.n > 1 ? "s" : ""} (Rs ${Math.round(e.sum).toLocaleString("en-IN")})`, `{${e.nos.slice(0, 6).join(",")}}`, e.n, money(e.sum), e.oldest, i < 3 ? "firm" : "statement", `demo-rem-${i}`, `demo-rem-thread-${i}`, staff["Kabir Nair"], ts(dayStr(R.int(1, 25)), 11)]));

  // ---------------------------------------------------------------- client profiles
  const parties = await q1(db, "select id, name from public.parties where 'customer' = any(roles)");
  await insert(db, "public.client_profiles", ["party_id", "owner_staff_id", "lifecycle", "last_order_date", "last_contact_at", "notes"],
    parties.map((p, i) => [p.id, R.pick([staff["Riya Shah"], staff["Aarav Mehta"], staff["Kabir Nair"]]), i < 18 ? "active" : i < 21 ? "lost_client" : i < 23 ? "dead_lead" : "prospect",
      i < 18 ? dayStr(R.int(2, 70)) : i < 21 ? dayStr(R.int(130, 260)) : null, ts(dayStr(R.int(1, 60)), 12), R.chance(0.3) ? "Prefers material with test certificates attached" : null]));
  console.log(`misc: 2 counts, ${ex.length} review items, ${sent.length} reminders, ${parties.length} client profiles`);
}
