// Customer orders (with their lines) and the vehicle / outward register.
import { insert, R, TODAY, iso, dayStr, addDays, money, vehicle, pad, CUSTOMERS, TRANSPORTERS, PLACES, SALES_PEOPLE } from "../lib.mjs";
import { GRADES } from "./10_masters.mjs";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const todayStr = iso(TODAY);
const at = (d, h = 10) => `${d} ${pad(h)}:${pad(R.int(0, 59))}:00`;

export default async function (db) {
  const { sales } = globalThis.__demo;
  const orders = [];
  const lines = [];
  let no = 1200;
  for (let i = 0; i < 72; i++) {
    const age = Math.round(150 - i * 2 + R.int(-1, 2));
    const date = dayStr(Math.max(0, age));
    const etd = addDays(date, R.int(7, 30));
    const open = etd >= dayStr(14) ? R.chance(0.8) : R.chance(0.12);
    const n = R.int(1, 4);
    const client = R.pick(CUSTOMERS);
    const person = R.pick(SALES_PEOPLE);
    const company = R.chance(0.8) ? "NPF" : "BSE";
    const o = { no: String(++no), date, etd, open, client, person, company, place: R.pick(PLACES), po: `PO/26-27/${pad(R.int(100, 480), 4)}`, lineIdx: [] };
    const gs = [], trs = [], vs = [];
    let done = 0;
    for (let k = 1; k <= n; k++) {
      const g = R.pick(GRADES), thk = R.pick(g.thk), w = R.pick([1250, 1500, 1800, 2000]), l = R.pick([6000, 8000, 10000, 12000]);
      const complete = !open || (k < n && R.chance(0.5));
      if (complete) done++;
      const tr = R.pick(TRANSPORTERS), veh = complete ? vehicle() : null;
      gs.push(g.code); if (veh) { trs.push(tr); vs.push(veh); }
      lines.push([o.no, String(k), g.code, `${thk} x ${w} x ${l}`, R.int(1, 12) * 1000, "KG", money(g.rate * (1.06 + R.next() * 0.05)), R.pick(["stock", "stock", "purchase"]), o.date, o.etd, o.client, o.po, o.person, o.company, o.place, complete, veh ? tr : null, veh, R.chance(0.2) ? "MTC and third party inspection required" : null, R.chance(0.2)]);
    }
    o.grades = [...new Set(gs)].join(", ");
    o.transporters = [...new Set(trs)].join(", ") || null;
    o.vehicles = vs.join(", ") || null;
    o.nLines = n; o.done = done;
    orders.push(o);
  }

  await insert(db, "app.v_orders_store",
    ["order_no", "order_no_num", "company", "salesperson", "po_no", "client", "delivery_location", "order_date", "etd", "entered_at", "po_url", "lines", "done_lines", "status", "grades", "material", "transporters", "vehicles", "has_testing"],
    orders.map((o) => [o.no, Number(o.no), o.company, o.person, o.po, o.client, o.place, o.date, o.etd, at(o.date), `/demo-docs/po-${(Number(o.no) % 4) + 1}.pdf`, o.nLines, o.done, o.open ? "Open" : "Complete", o.grades, R.chance(0.7) ? "stock" : "stock, purchase", o.transporters, o.vehicles, R.chance(0.2)]));

  await insert(db, "app.v_order_lines_store",
    ["row_no", "entered_at", "order_no", "sr_no", "salesperson", "company", "po_no", "order_date", "client", "delivery_location", "etd", "po_url", "grade", "size", "qty", "unit", "rate", "material", "instructions", "done", "transporter", "vehicle_no", "tests", "third_party_testing", "checked"],
    lines.map((x, i) => [i + 2, at(x[8]), x[0], x[1], x[12], x[13], x[11], x[8], x[10], x[14], x[9], `/demo-docs/po-${(Number(x[0]) % 4) + 1}.pdf`, x[2], x[3], x[4], x[5], x[6], x[7], R.chance(0.25) ? R.pick(["Cut to size before dispatch", "Wrap in waterproof sheet", "Mark heat number on each plate"]) : null, x[15], x[16], x[17], x[18], x[19] ? "Required" : null, x[15] ? true : R.chance(0.5)]));

  // the vehicle register: one trip for each sale in the stock book, plus the orders' own trips
  const trips = sales.map((s) => ({ date: s.date, plot: s.plot, veh: vehicle(), grade: s.lot.g.code, inv: String(s.inv), kg: s.kg, ent: "NPF" }));
  trips.sort((a, b) => a.date.localeCompare(b.date));
  const rowIn = {};
  await insert(db, "app.v_vehicle_register_store", ["month_tab", "row_no", "plot", "vehicle_no", "grade", "dispatch_date", "invoice_no", "weight_kg", "entity"],
    trips.map((t) => {
      const [y, m] = t.date.split("-");
      const tab = `${MONTHS[Number(m) - 1].toUpperCase()} ${y.slice(2)}`;
      rowIn[tab] = (rowIn[tab] ?? 1) + 1;
      return [tab, rowIn[tab], t.plot, t.veh, t.grade, t.date, t.inv, Math.round(t.kg), t.ent];
    }));
  console.log(`orders: ${orders.length} orders, ${lines.length} lines, ${trips.length} trips`);
}
