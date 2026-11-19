// Mail trackers: the inbox to answer, quotations sent, leads from the website / marketplaces, and the client list.
import { insert, R, TODAY, iso, dayStr, money, pad, CUSTOMERS, PLACES, SALES_PEOPLE } from "../lib.mjs";
import { GRADES } from "./10_masters.mjs";

const at = (d, h) => `${d} ${pad(h ?? R.int(8, 19))}:${pad(R.int(0, 59))}:00`;
const FIRST = ["Rohan", "Meera", "Vikram", "Anita", "Sanjay", "Pooja", "Kiran", "Deepak", "Neha", "Arjun", "Sunita", "Manish", "Farah", "Gaurav", "Latha"];
const LAST = ["Iyer", "Kulkarni", "Reddy", "Bhatt", "Nair", "Joshi", "Menon", "Sinha", "Pillai", "Desai", "Chopra", "Rao"];
const STATES = ["Gujarat", "Maharashtra", "Tamil Nadu", "Telangana", "Karnataka", "West Bengal", "Rajasthan", "Madhya Pradesh", "Uttar Pradesh", "Chhattisgarh"];
const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
const person = () => `${R.pick(FIRST)} ${R.pick(LAST)}`;
const mailOf = (name, company) => `${slug(name.split(" ")[0])}.${slug(name.split(" ")[1])}@${slug(company).slice(0, 14)}.example`;
const SUBJECTS = ["Enquiry for {g} plates", "Quotation request: {g}", "Need price for {g} {t} mm", "Urgent requirement {g}", "Re: Quotation for {g}", "Delivery schedule for PO {p}", "Test certificates required for {g}", "Stock availability {g} {t} mm"];

export default async function (db) {
  const company = R.shuffle(CUSTOMERS);
  const contacts = company.map((c) => { const n = person(); return { company: c, name: n, email: mailOf(n, c) }; });
  const subj = (g, t) => R.pick(SUBJECTS).replace("{g}", g).replace("{t}", t).replace("{p}", `PO/26-27/${R.int(100, 480)}`);

  // the inbox to answer
  const inbox = [];
  for (let i = 0; i < 60; i++) {
    const age = i < 12 ? R.int(0, 3) : R.int(1, 60), c = R.pick(contacts), g = R.pick(GRADES), done = i >= 12 && R.chance(0.65);
    const d = dayStr(age);
    inbox.push([done ? "Done" : "Pending", i + 2, done, !done && R.chance(0.05), subj(g.code, R.pick(g.thk)), `https://mail.example.com/thread/${R.int(1e9, 9e9)}`, c.name, c.email, at(d), age, done ? "Replied" : age <= 1 ? R.pick(["New", "New", "URGENT"]) : age > 4 ? "Follow Up" : "New", done ? null : R.chance(0.15) ? "Call back after 4 pm" : null, `thread-${R.int(1e6, 9e6)}`, null]);
  }
  await insert(db, "app.v_mail_inbox_store", ["state", "row_no", "marked_done", "no_reply", "subject", "gmail_url", "from_name", "from_email", "received_at", "days", "status", "remarks", "thread_id", "moved_at"], inbox);

  // quotations sent: some open, some won, some lost
  const quotes = [];
  for (let i = 0; i < 110; i++) {
    const age = Math.round(i * 2.2 + R.int(0, 3)), c = R.pick(contacts), g = R.pick(GRADES), thk = R.pick(g.thk), kg = R.int(2, 40) * 1000;
    const price = money(g.rate * (1.08 + R.next() * 0.06));
    const roll = R.next();
    const status = age < 12 ? "Open" : roll < 0.3 ? "Won" : roll < 0.62 ? "Lost" : "Open";
    const tab = status === "Won" ? "Won" : "Tracker";
    quotes.push([tab, i + 2, status === "Open" && age < 6 ? "High" : null, status !== "Open" || age > 4 && R.chance(0.6), status !== "Open" || age > 9 && R.chance(0.4), subj(g.code, thk), `https://mail.example.com/thread/${R.int(1e9, 9e9)}`, R.chance(0.85) ? `QT/26-27/${pad(900 - i, 4)}` : null, c.company, c.email, at(dayStr(age)), age, g.code, `${kg.toLocaleString("en-IN")} kg of ${thk} mm`, price, R.pick(["Ex stock", "7 days", "15 days", "Ex works"]), R.pick(["15 days", "7 days", "30 days"]), status, status === "Won" ? Math.round(kg * price) : null, status === "Lost" ? R.pick(["Price", "Delivery time", "Bought elsewhere", "Project on hold"]) : null, status === "Open" ? null : "Yes", R.chance(0.5) ? "Yes" : null, R.chance(0.12) ? "Customer asked for 2% discount" : null, `thread-${R.int(1e6, 9e6)}`]);
  }
  await insert(db, "app.v_quotations_store", ["source_tab", "row_no", "priority", "fu1", "fu2", "subject", "gmail_url", "quote_no", "client_name", "client_email", "quoted_at", "days", "material", "qty", "price", "delivery", "validity", "status", "order_value", "lost_reason", "client_replied", "repeat_client", "remarks", "thread_id"], quotes);

  // leads from the website and marketplaces
  const leads = [];
  for (let i = 0; i < 120; i++) {
    const age = Math.round(i * 1.8 + R.int(0, 2)), n = person(), c = R.pick(["Rathod Engineering", "Kalyan Fabricators", "Mistry Boilers", "Tanna Industries", "Vora Steel Works", "Shetty Projects", "Naik Tanks", "Gill Heavy Engg", "Pawar Equipments", "Sen Process Plant", "Bose Industrial Works", "Hegde Fabrication"]);
    const g = R.pick(GRADES), kind = R.pick(["Website form", "Website form", "Marketplace buy lead", "Marketplace buy lead", "Phone call", "Marketplace enquiry"]);
    leads.push([i + 2, `Q${R.int(100000, 999999)}`, kind.includes("buy") ? "B" : "E", kind, at(dayStr(age)), n, mailOf(n, c), c, R.pick(PLACES), R.pick(STATES), "India", `+91 9${R.int(100000000, 999999999)}`, `${g.code} plates`, `Please share the best price for ${R.int(2, 30)} tonnes of ${g.code}, ${R.pick(g.thk)} mm thick, delivery to ${R.pick(PLACES)}.`]);
  }
  await insert(db, "app.v_leads_store", ["row_no", "query_id", "query_type", "query_kind", "received_at", "name", "email", "company", "city", "state", "country", "mobile", "product", "message"], leads);

  // the client list, built from the quotations
  const by = new Map();
  for (const q of quotes) {
    const x = by.get(q[9]) ?? { name: q[8], email: q[9], quotes: 0, won: 0, pipe: 0, last: q[10], grade: q[12] };
    x.quotes++; if (q[17] === "Won") x.won++; if (q[17] === "Open") x.pipe += Math.round(R.int(2, 30) * 1000 * q[14]);
    by.set(q[9], x);
  }
  const clients = [...by.values()].map((x, i) => [i + 2, x.name, x.email, x.grade, x.quotes + R.int(0, 6), x.quotes, x.won, x.pipe, x.last]);
  await insert(db, "app.v_mail_clients_store", ["row_no", "client_name", "email", "grade", "enquiries", "quotations", "orders_won", "pipeline_value", "last_contact"], clients);
  globalThis.__demo.contacts = contacts;
  console.log(`mail: ${inbox.length} inbox, ${quotes.length} quotations, ${leads.length} leads, ${clients.length} clients`);
}
