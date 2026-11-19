// Steel grades with their names, and the made-up companies the business deals with.
import { insert, CUSTOMERS, VENDORS, BROKERS, TRANSPORTERS, PLACES, R } from "../lib.mjs";

export const GRADES = [
  // book, tab (the sheet tab the plates sit in), code, family, spec, thicknesses, rate per kg
  { book: "WB1", tab: "GR. 11", code: "SA 387 GR 11 CL2", family: "Alloy plate", spec: "ASTM A387", thk: [5, 6, 8, 10, 12, 14, 16, 20, 25, 32, 36, 40, 50], rate: 141, aliases: ["SA387 GR11 CL2", "SA 387 Gr 11", "Gr 11 Cl2", "GR 11"] },
  { book: "WB1", tab: "GR. 22", code: "SA 387 GR 22 CL2", family: "Alloy plate", spec: "ASTM A387", thk: [5, 6, 8, 10, 12, 16, 20, 25, 30, 32, 40, 50], rate: 136, aliases: ["SA387 GR22 CL2", "SA 387 Gr 22", "Gr 22 Cl2", "GR 22"] },
  { book: "WB1", tab: "16M03", code: "16MO3", family: "Alloy plate", spec: "EN 10028-2", thk: [3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 25], rate: 112, aliases: ["16M03", "16 Mo 3", "16MO 3", "16Mo3"] },
  { book: "WB1", tab: "GR. 12  W", code: "SA 387 GR 12 CL2", family: "Alloy plate", spec: "ASTM A387", thk: [5, 6, 8, 10, 12, 16, 20, 25], rate: 126, aliases: ["SA387 GR12 CL2", "SA 387 Gr 12", "Gr 12 Cl2", "GR 12"] },
  { book: "WB1", tab: "A36", code: "A36", family: "Structural", spec: "ASTM A36", thk: [6, 8, 10, 12, 16, 20, 25], rate: 78, aliases: ["A 36", "SA36", "A36/275 JR"] },
  { book: "WB1", tab: "SA 516 GR 70", code: "SA 516 GR 70", family: "Pressure vessel", spec: "ASTM A516", thk: [10, 12, 16, 20, 25, 32], rate: 92, aliases: ["SA516 GR70", "SA 516 Gr 70", "516 Gr 70", "SA516 Gr.70"] },
  { book: "WB2", tab: "SA 537", code: "SA 537 CL 1", family: "Pressure vessel", spec: "ASTM A537", thk: [8, 10, 12, 14, 16, 20, 25], rate: 84, aliases: ["SA537 CL1", "SA 537 Cl1", "SA 537"] },
  { book: "WB2", tab: "690 QL", code: "S690QL", family: "High strength", spec: "EN 10025-6", thk: [8, 10, 12, 16, 20, 25, 32], rate: 131, aliases: ["S 690 QL", "690QL", "S690 QL"] },
  { book: "WB2", tab: "ROCKSTAR 400", code: "ROCKSTAR 400", family: "Wear resistant", spec: "Brinell 400", thk: [8, 10, 12, 16, 20, 25], rate: 98, aliases: ["ROCKSTAR400", "Rockstar 400"] },
  { book: "WB2", tab: "ROCKSTAR 500", code: "ROCKSTAR 500", family: "Wear resistant", spec: "Brinell 500", thk: [8, 10, 12, 16], rate: 128, aliases: ["ROCKSTAR500", "Rockstar 500"] },
];

export default async function (db) {
  const g = await insert(db, "public.grades", ["code", "family", "spec"], GRADES.map((x) => [x.code, x.family, x.spec]), { returning: "id, code" });
  const byCode = new Map(g.map((r) => [r.code, r.id]));
  const seen = new Set();
  const norm = (a) => a.toLowerCase().replace(/[^a-z0-9]/g, "");
  await insert(db, "public.grade_aliases", ["grade_id", "alias"], GRADES.flatMap((x) => [x.code, ...x.aliases].filter((a) => !seen.has(norm(a)) && seen.add(norm(a))).map((a) => [byCode.get(x.code), a])));

  const city = () => R.pick(PLACES);
  const cust = CUSTOMERS.map((n) => [n, ["customer"], city()]);
  const ven = VENDORS.map((n, i) => [n, [i === 0 ? "mill" : "vendor"], city()]);
  const bro = BROKERS.map((n) => [n, ["broker"], city()]);
  const trn = TRANSPORTERS.map((n) => [n, ["transporter"], city()]);
  await insert(db, "public.parties", ["name", "roles", "city"], [...cust, ...ven, ...bro, ...trn].map(([n, roles, c]) => [n, `{${roles.join(",")}}`, c]));
}
