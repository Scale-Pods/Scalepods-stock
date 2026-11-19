// Digital Brain history: saved questions, a few past chats with their answers, and the log of questions asked (what they used and cost).
import { insert, R, dayStr, money, pad } from "../lib.mjs";

const ts = (d, h) => `${d} ${pad(h ?? R.int(9, 18))}:${pad(R.int(0, 59))}:00+05:30`;

export default async function (db) {
  const staff = (await db.query("select id, full_name, role from public.staff where full_name in ('Aarav Mehta', 'Demo Admin', 'Riya Shah')")).rows;
  const by = Object.fromEntries(staff.map((s) => [s.full_name, s.id]));
  const owners = [by["Aarav Mehta"], by["Demo Admin"]];

  const SAVED = [
    ["Who owes us money", "Who owes us money and who is the most overdue?"], ["Oldest stock", "What is the oldest stock we have?"],
    ["GR 22 availability", "Do we have SA 387 GR 22 CL2, 12 mm, 2000 x 6000?"], ["Open orders", "Which orders are open?"], ["Follow-ups", "How many quotations are waiting for a follow-up?"],
  ];
  await insert(db, "public.ask_saved", ["staff_id", "title", "question", "model", "scope"], owners.flatMap((o) => SAVED.map(([t, q]) => [o, t, q, "gpt-6-luna", "all"])));

  const CHATS = [
    { title: "Who owes us money", days: 1, q: "Who owes us money?", a: "Customers owe us several crore in total, and about half of it is past its due date. The biggest debtors are Summit Boilers & Tanks, Harbor Marine Fabrication, Kaveri Thermal Works, Orion Boilers and Apex Heat Exchangers.\n\nA payment reminder can be prepared for any of them under **Invoices and payments → Reminders**.", fu: ["What does Orion Boilers owe us?", "What do we owe our vendors?", "Give me the overview"] },
    { title: "Do we have SA 387 GR 22 CL2, 12 mm", days: 2, q: "Do we have SA 387 GR 22 CL2, 12 mm, 2000 x 6000?", a: "**Yes, we have it.** SA 387 GR 22 CL2, 12 mm, 2000 x 6000: one plate group of 14 pieces, 28.6 t, is in stock (heat 71658MK).\n\nStock figures are those of the stock book.", fu: ["What is the oldest SA 387 GR 22 CL2 we have?", "Which orders are open?"] },
    { title: "Oldest stock", days: 4, q: "What is the oldest stock we have?", a: "The oldest plates still in stock are a Rockstar 500 plate of 12 x 2500 x 12000 mm (17.0 t), followed by SA 537 CL 1 and SA 516 GR 70 plates. All were received well over a year ago.", fu: ["Who owes us money?", "Give me the overview"] },
    { title: "Open orders", days: 6, q: "Which orders are open?", a: "There are **14 open orders**. Several of them are already past their delivery date, so they are the ones to chase first.", fu: ["What did we dispatch this month?", "Who owes us money?"] },
  ];
  for (const owner of owners) {
    for (const c of CHATS) {
      const when = dayStr(c.days);
      const [chat] = (await db.query("insert into public.ask_chats (staff_id, title, model, scope, origin, created_at, updated_at) values ($1,$2,'auto','all','brain',$3,$3) returning id", [owner, c.title, ts(when, 11)])).rows;
      await insert(db, "public.ask_messages", ["chat_id", "role", "content", "meta", "created_at"], [
        [chat.id, "user", c.q, "{}", ts(when, 11)],
        [chat.id, "assistant", c.a, JSON.stringify({ sources: ["Stock", "Payments"], refs: [], follow_ups: c.fu, confidence: "found", used: [{ name: "overview", rows: 1 }], usd: 0.0007, model: "gpt-6-luna", auto: { tier: 1, picked: 1, upgraded: false, reasons: [] } }), ts(when, 11)],
      ]);
      await insert(db, "public.ask_log", ["staff_id", "question", "answer", "tools", "input_tokens", "output_tokens", "usd", "seconds", "model", "chat_id", "created_at"],
        [[owner, c.q, c.a, JSON.stringify([{ name: "overview", rows: 1, ms: 120 }]), 5200, 380, money(0.0007), money(3.2), "gpt-6-luna", chat.id, ts(when, 11)]]);
    }
  }
  await insert(db, "public.ask_projects", ["staff_id", "name", "instructions"], [[by["Aarav Mehta"], "Weekly money review", "Always give amounts in lakh or crore and list the five biggest names first."]]);
  console.log("ask: saved questions, chats and log");
}
