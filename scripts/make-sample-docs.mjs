// Makes the sample documents (customer orders, vendor bills, mill test certificates, delivery challans) as plain PDF files in public/demo-docs.
// Everything on them is made up. No packages: a PDF is written by hand (Helvetica text and ruled lines).
//   node scripts/make-sample-docs.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "demo-docs");
mkdirSync(OUT, { recursive: true });

class Page {
  constructor() { this.ops = []; }
  esc(s) { return String(s).replace(/[\\()]/g, (c) => "\\" + c).replace(/[^\x20-\x7e]/g, (c) => (c === "₹" ? "Rs" : "?")); }
  text(x, y, s, size = 10, bold = false) { this.ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${this.esc(s)}) Tj ET`); return this; }
  line(x1, y1, x2, y2, w = 0.6) { this.ops.push(`${w} w ${x1} ${y1} m ${x2} ${y2} l S`); return this; }
  rect(x, y, w, h, fill) { this.ops.push(fill ? `${fill} rg ${x} ${y} ${w} ${h} re f 0 g` : `0.6 w ${x} ${y} ${w} ${h} re S`); return this; }
  // a ruled table: cols = [[label, width], ...], rows = arrays of strings
  table(x, y, cols, rows, size = 9) {
    const h = 18, total = cols.reduce((a, c) => a + c[1], 0);
    this.rect(x, y - h, total, h, "0.92 0.92 0.92");
    let cx = x;
    cols.forEach(([label, w]) => { this.text(cx + 4, y - 12, label, size, true); cx += w; });
    rows.forEach((r, i) => { cx = x; r.forEach((cell, j) => { this.text(cx + 4, y - h * (i + 2) + 5, cell, size); cx += cols[j][1]; }); });
    const n = rows.length + 1;
    for (let i = 0; i <= n; i++) this.line(x, y - h * i, x + total, y - h * i);
    cx = x; for (let j = 0; j <= cols.length; j++) { this.line(cx, y, cx, y - h * n); cx += cols[j]?.[1] ?? 0; }
    return y - h * n;
  }
}

function pdf(page) {
  const stream = page.ops.join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  let out = "%PDF-1.4\n"; const off = [];
  objs.forEach((o, i) => { off.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
const save = (name, page) => writeFileSync(join(OUT, name), pdf(page));
const head = (p, title, org, sub) => { p.rect(0, 770, 595, 72, "0.12 0.20 0.35"); p.ops.push("1 g"); p.text(40, 810, org, 17, true); p.text(40, 790, sub, 9); p.ops.push("0 g"); p.text(40, 745, title, 15, true); };

const CUST = [
  ["Orion Boilers Pvt Ltd", "Plot 14, Industrial Estate, Vadodara, Gujarat", "24ABCDE1234F1Z5"], ["Vanguard Pressure Vessels Ltd", "B-22 MIDC, Pune, Maharashtra", "27FGHIJ5678K1Z2"],
  ["Apex Heat Exchangers Pvt Ltd", "Survey 88, Bharuch, Gujarat", "24LMNOP9012Q1Z8"], ["Kaveri Thermal Works Pvt Ltd", "Unit 5, SIPCOT Park, Coimbatore, Tamil Nadu", "33QRSTU3456V1Z1"],
];
const NPF = ["NORTHWIND PIPES & FITTINGS", "Steel plate stockists  |  Yard: Plot 753 and D15  |  Mumbai, Maharashtra  |  GSTIN 27AAAFN1234A1Z5"];

// customer purchase orders
for (let i = 0; i < 4; i++) {
  const [name, addr, gst] = CUST[i], p = new Page();
  head(p, "PURCHASE ORDER", name.toUpperCase(), addr + "  |  GSTIN " + gst);
  p.text(380, 745, `PO No: PO/26-27/${130 + i * 47}`, 10, true).text(380, 730, `Date: ${12 + i} Nov 2026`, 10);
  p.text(40, 715, "To: Northwind Pipes & Fittings, Mumbai", 10).text(40, 700, "Please supply the following material as per the terms below.", 10);
  const g = ["SA 387 GR 22 CL2", "SA 516 GR 70", "16Mo3", "SA 387 GR 11 CL2"][i];
  const y = p.table(40, 670, [["Sr", 30], ["Description", 190], ["Size (mm)", 110], ["Qty (kg)", 70], ["Rate / kg", 60], ["Amount", 70]],
    [["1", `${g} plate`, `${[12, 16, 10, 20][i]} x 2000 x 6000`, `${8000 + i * 2500}`, `${136 + i * 4}`, `${(8000 + i * 2500) * (136 + i * 4)}`], ["2", `${g} plate`, `${[16, 20, 12, 25][i]} x 2000 x 8000`, `${5000 + i * 1000}`, `${136 + i * 4}`, `${(5000 + i * 1000) * (136 + i * 4)}`]]);
  p.text(40, y - 30, "Payment: 30 days from invoice date", 10).text(40, y - 45, "Delivery: ex stock, within 7 days of order", 10).text(40, y - 60, "Test certificates (EN 10204 3.1) to accompany the material.", 10);
  p.text(40, y - 110, "For " + name, 10, true).text(40, y - 150, "Authorised signatory", 9);
  save(`po-${i + 1}.pdf`, p);
}

// vendor bills
const VEND = [["Meridian Steel Works", "Works: Industrial Area, Bhilai, Chhattisgarh", "22AAAMS1111A1Z3"], ["Atlas Alloy Steels Ltd", "Atlas House, Fort, Mumbai", "27AAAAT2222B1Z9"], ["Jaipur Metals & Plates", "RIICO Area, Jaipur, Rajasthan", "08AAAJM3333C1Z4"]];
for (let i = 0; i < 6; i++) {
  const [vn, va, vg] = VEND[i % 3], p = new Page();
  head(p, "TAX INVOICE", vn.toUpperCase(), va + "  |  GSTIN " + vg);
  const taxable = (14000 + i * 1800) * (128 + i * 3), gst = Math.round(taxable * 0.18);
  p.text(380, 745, `Invoice No: MSW/26-27/${1200 + i * 31}`, 10, true).text(380, 730, `Date: ${3 + i * 2} Nov 2026`, 10);
  p.text(40, 715, "Billed to: Northwind Pipes & Fittings, Mumbai  |  GSTIN 27AAAFN1234A1Z5", 10);
  const y = p.table(40, 690, [["Description", 170], ["HSN", 45], ["Heat no", 70], ["Size (mm)", 100], ["Weight kg", 60], ["Rate", 40], ["Amount", 70]],
    [[["SA 387 GR 22 CL2", "SA 516 GR 70", "16Mo3"][i % 3] + " plate", "7225", `${40100 + i * 233}SA`, `${[12, 16, 20][i % 3]} x 2000 x 6000`, `${14000 + i * 1800}`, `${128 + i * 3}`, `${taxable}`]]);
  p.text(380, y - 25, `Taxable value: Rs ${taxable}`, 10).text(380, y - 40, `CGST 9%: Rs ${Math.round(gst / 2)}`, 10).text(380, y - 55, `SGST 9%: Rs ${Math.round(gst / 2)}`, 10).text(380, y - 72, `Total: Rs ${taxable + gst}`, 11, true);
  p.text(40, y - 25, "Company's Bank Details", 10, true).text(40, y - 40, `A/c Holder: ${vn.toUpperCase()}`, 9).text(40, y - 53, `Bank: ${["HDFC Bank Ltd.", "ICICI Bank Ltd.", "State Bank of India"][i % 3]}`, 9);
  p.text(40, y - 66, `A/c No: ${["50200012345678", "000405012345", "39812345678"][i % 3]}`, 9).text(40, y - 79, `Branch & IFSC: Main Branch, ${["HDFC0000212", "ICIC0000004", "SBIN0001234"][i % 3]}`, 9);
  p.text(40, y - 120, "Declaration: goods are supplied against the order of the buyer. Subject to Mumbai jurisdiction.", 8);
  save(`bill-${i + 1}.pdf`, p);
}

// mill test certificates and inspection certificates
for (let i = 0; i < 5; i++) {
  const p = new Page();
  head(p, "MILL TEST CERTIFICATE (EN 10204 3.1)", "MERIDIAN STEEL WORKS", "Quality Assurance Department  |  Bhilai, Chhattisgarh");
  const g = ["SA 387 GR 22 CL2", "SA 387 GR 11 CL2", "SA 516 GR 70", "16Mo3", "S690QL"][i];
  p.text(380, 745, `Certificate No: TC${410000 + i * 77}`, 10, true).text(380, 730, `Date: ${5 + i} Nov 2026`, 10);
  p.text(40, 715, `Customer: Northwind Pipes & Fittings    Grade / Specification: ${g}`, 10);
  const y = p.table(40, 690, [["Heat no", 80], ["Plate no", 70], ["Size (mm)", 110], ["Pieces", 50], ["Weight kg", 70], ["Condition", 100]], [[`${40100 + i * 233}SA`, `P${210 + i}A`, `${[12, 16, 20, 10, 25][i]} x 2000 x 6000`, `${3 + i}`, `${5400 + i * 900}`, "Normalised"]]);
  const y2 = p.table(40, y - 25, [["C", 60], ["Mn", 60], ["Si", 60], ["P", 60], ["S", 60], ["Cr", 60], ["Mo", 60], ["Cu", 60]], [["0.14", "0.52", "0.28", "0.012", "0.004", "2.18", "0.97", "0.08"]]);
  p.text(40, y2 - 18, "Chemical composition, % by weight (ladle analysis)", 8);
  const y3 = p.table(40, y2 - 45, [["Yield MPa", 90], ["Tensile MPa", 90], ["Elongation %", 90], ["Impact J (-20C)", 110], ["Hardness HB", 90]], [[`${310 + i * 8}`, `${510 + i * 10}`, "24", "92 / 98 / 95", "168"]]);
  p.text(40, y3 - 18, "Mechanical properties", 8).text(40, y3 - 70, "We certify that the material described above conforms to the specification and the order.", 9).text(380, y3 - 110, "Authorised signatory, Quality Assurance", 9);
  save(`mtc-${i + 1}.pdf`, p);
}
for (let i = 0; i < 3; i++) {
  const p = new Page();
  head(p, "THIRD PARTY INSPECTION CERTIFICATE", "BUREAU OF STEEL INSPECTION", "Independent inspection agency  |  Mumbai");
  p.text(380, 745, `Certificate No: TPI/${2210 + i * 9}`, 10, true).text(380, 730, `Date: ${8 + i} Nov 2026`, 10);
  p.text(40, 715, "Material inspected at the yard of Northwind Pipes & Fittings", 10).text(40, 698, "The plates below were inspected for dimensions, surface condition and identification marks.", 10);
  const y = p.table(40, 670, [["Heat no", 90], ["Grade", 140], ["Size (mm)", 120], ["Pieces", 60], ["Result", 100]], [[`${40100 + i * 411}SA`, ["SA 387 GR 22 CL2", "SA 516 GR 70", "16Mo3"][i], `${[12, 16, 20][i]} x 2000 x 6000`, `${4 + i}`, "Accepted"]]);
  p.text(40, y - 40, "Inspector's remark: dimensions within tolerance, no visible defects, heat numbers match the mill certificate.", 9).text(380, y - 100, "Inspector", 9);
  save(`tc-${i + 1}.pdf`, p);
}

// delivery challans (the pad slip, typed)
for (let i = 0; i < 3; i++) {
  const p = new Page();
  head(p, "OUTWARD DELIVERY CHALLAN", NPF[0], NPF[1]);
  const [name] = CUST[i];
  p.text(380, 745, `V.No: T${2200 + i * 13}`, 12, true).text(380, 728, `Date: ${9 + i} Nov 2026`, 10);
  p.text(40, 715, `To: ${name}`, 10).text(40, 700, `Vehicle: GJ06AB${4000 + i * 311}    Plot: ${i % 2 ? "753" : "D15"}    Loaded by: Ramesh`, 10);
  const y = p.table(40, 675, [["Grade", 120], ["Thk", 45], ["Width", 55], ["Length", 55], ["Nos", 40], ["Heat no", 90], ["Weight kg", 80]],
    [[["SA 387 GR 22 CL2", "SA 516 GR 70", "16Mo3"][i], `${[12, 16, 10][i]}`, "2000", "6000", `${2 + i}`, `${40100 + i * 233}SA`, `${4710 + i * 1180}`]]);
  p.text(40, y - 30, `Total weight: ${4710 + i * 1180} kg`, 11, true).text(40, y - 90, "Receiver's signature", 9).text(380, y - 90, "For Northwind Pipes & Fittings", 9);
  save(`challan-${i + 1}.pdf`, p);
}
console.log("sample documents written to public/demo-docs");
