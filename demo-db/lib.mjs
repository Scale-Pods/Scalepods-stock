// Helpers for the dummy-data scripts in demo-db/seed. Everything is made up and repeatable: the same numbers come out every time the database is built.

/** A small seeded random generator (mulberry32), so the dummy data is the same on every build. */
export function rng(seed = 20261114) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = (list) => list[Math.floor(next() * list.length)];
  const chance = (p) => next() < p;
  const shuffle = (list) => { const x = [...list]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
  return { next, int, pick, chance, shuffle };
}
export const R = rng();

// "today" of the dummy world: the date the demo was designed on. Dates in the data are counted back from it.
// the day the data is built; the last few days before it hold the freshest records
const now = new Date();
export const TODAY = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 1));
export const iso = (d) => d.toISOString().slice(0, 10);
export const daysAgo = (n) => new Date(TODAY.getTime() - n * 86400000);
export const dayStr = (n) => iso(daysAgo(n));
export const addDays = (isoDate, n) => iso(new Date(new Date(isoDate + "T00:00:00Z").getTime() + n * 86400000));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** 05-Nov-26, the way the sheets show a date */
export const sheetDate = (isoDate) => { const [y, m, d] = isoDate.split("-"); return `${d}-${MON[Number(m) - 1]}-${y.slice(2)}`; };
export const fyOf = (isoDate) => { const y = Number(isoDate.slice(0, 4)), m = Number(isoDate.slice(5, 7)); const s = m >= 4 ? y : y - 1; return `FY ${s}-${String(s + 1).slice(2)}`; };
/** 26-27 : the part of an invoice number after the slash */
export const fyShort = (isoDate) => fyOf(isoDate).slice(5);

/** Insert many rows at once. rows are arrays in the order of cols. */
export async function insert(db, table, cols, rows, { returning = "", conflict = "" } = {}) {
  const out = [];
  for (let i = 0; i < rows.length; i += 200) {
    const part = rows.slice(i, i + 200);
    const params = [];
    const tuples = part.map((r) => "(" + r.map((v) => { params.push(v === undefined ? null : v); return `$${params.length}`; }).join(",") + ")");
    const res = await db.query(`insert into ${table} (${cols.join(",")}) values ${tuples.join(",")} ${conflict} ${returning ? "returning " + returning : ""}`, params);
    if (returning) out.push(...res.rows);
  }
  return out;
}

export const money = (n) => Math.round(n * 100) / 100;
export const rounded = (n, step = 1) => Math.round(n / step) * step;
export const pad = (n, w = 2) => String(n).padStart(w, "0");

// ---------------------------------------------------------------- made-up people and companies
export const SALES_PEOPLE = ["Riya", "Kabir", "Aarav", "Nikhil", "Sana"];
export const CUSTOMERS = [
  "Orion Boilers Pvt Ltd", "Vanguard Pressure Vessels Ltd", "Apex Heat Exchangers Pvt Ltd", "Meridian Power Equipments Ltd", "Sterling Process Engineers",
  "Kaveri Thermal Works Pvt Ltd", "Zenith Fabricators", "Lotus Engineering Works", "Harbor Marine Fabrication Pvt Ltd", "Pinnacle Cryo Systems Ltd",
  "Crestline Energy Projects", "Summit Boilers & Tanks Pvt Ltd", "BlueArc Industries Ltd", "Ironwood Projects Pvt Ltd", "Skyline Structurals Ltd",
  "Granite Refractories & Steel", "Evergreen Power Systems", "Falcon Industrial Services", "Horizon Reactors Pvt Ltd", "Trident Piping Solutions",
  "Maple Heavy Fabrication", "Nimbus Process Equipments", "Quartz Thermal Engineering", "Redwood Tanks & Vessels", "Sapphire Plant Engineering",
];
export const VENDORS = [
  "Meridian Steel Works", "Atlas Alloy Steels Ltd", "Jaipur Metals & Plates", "Eastern Plate Traders", "Coastal Tubes & Plates Pvt Ltd", "Delta Steel Trading Co",
  "Prime Plate Distributors", "Orchid Steel Corporation", "Standard Alloys & Metals", "Lakeview Steel Traders", "Crown Steel Industries", "Navkar Metal Traders",
];
export const BROKERS = ["Arvind Desai", "Pratik Shah", "Lalit Kothari", "Meena Traders", "Rohan Kapadia", "Suresh Patel"];
export const TRANSPORTERS = ["Shree Ganesh Transport", "Blue Dart Freight Lines", "Rapid Road Carriers", "Western Roadways", "Metro Cargo Movers", "Jai Hind Logistics"];
export const PLACES = ["Vadodara", "Pune", "Ahmedabad", "Surat", "Mumbai", "Nashik", "Aurangabad", "Bharuch", "Rajkot", "Coimbatore", "Hyderabad", "Chennai", "Kolkata", "Bhilai", "Nagpur"];
export const EXPENSE_TYPES = ["Freight", "Loading charges", "Office rent", "Electricity", "Courier", "Professional fees", "Insurance", "Telephone and internet", "Repairs", "Packing material"];
export const VEHICLE_STATES = ["MH04", "MH12", "GJ06", "GJ01", "MH43", "GJ05", "MH14", "KA01"];
export const vehicle = () => `${R.pick(VEHICLE_STATES)}${["AB", "CD", "EF", "GH", "JK", "KL", "MN", "PQ"][R.int(0, 7)]}${pad(R.int(1, 9999), 4)}`;
