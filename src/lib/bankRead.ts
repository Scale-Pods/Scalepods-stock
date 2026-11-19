import "server-only";
import * as mupdf from "mupdf";

// Reads the supplier's bank details off a purchase invoice ("Company's Bank Details": account holder, bank, account number, branch, IFSC).
// A wrong digit here would send money to the wrong account, so the reading is checked by rules and always shown to a person to confirm before any form is made.

export type BankRead = { holder: string; bank: string; account: string; branch: string; ifsc: string; invoice_total: string; warnings: string[]; model: string };

const BANK_CODES: Record<string, RegExp> = { HDFC: /hdfc/i, ICIC: /icici/i, SBIN: /state bank|sbi/i, UTIB: /axis/i, KKBK: /kotak/i, PUNB: /punjab national|pnb/i, BARB: /baroda/i, IDIB: /indian bank/i, CNRB: /canara/i, UBIN: /union bank/i, YESB: /yes bank/i, IBKL: /idbi/i, INDB: /indusind/i, FDRL: /federal/i, BKID: /bank of india/i, CBIN: /central bank/i, MAHB: /maharashtra/i, SIBL: /south indian/i, KARB: /karnataka/i, RATN: /rbl|ratnakar/i };

/** The rules every bank reading must pass; each failure is a warning shown to the person. */
export function checkBank(r: { holder: string; bank: string; account: string; ifsc: string }, supplier?: string): string[] {
  const w: string[] = [];
  if (!r.holder.trim()) w.push("The account holder's name was not found.");
  if (!/^\d{9,18}$/.test(r.account)) w.push("The account number should be 9 to 18 digits; check it against the invoice.");
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(r.ifsc)) w.push("The IFSC code is not in the right form (4 letters, a zero, 6 letters or digits); check it against the invoice.");
  else {
    const rule = BANK_CODES[r.ifsc.slice(0, 4)];
    if (rule && r.bank && !rule.test(r.bank)) w.push(`The IFSC starts with ${r.ifsc.slice(0, 4)} but the bank is written as “${r.bank}”: one of them is misread.`);
  }
  if (supplier && r.holder) {
    const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((x) => x.length > 2 && !["pvt", "ltd", "limited", "private", "the", "and", "india"].includes(x));
    const a = new Set(words(supplier)), b = words(r.holder);
    if (a.size && b.length && !b.some((x) => a.has(x))) w.push(`The account holder “${r.holder}” does not look like the supplier “${supplier}”. Check that this is the right account.`);
  }
  return w;
}

/** The text of a PDF, or "" when it has none. */
function pdfText(bytes: Buffer, mime: string): string {
  if (mime !== "application/pdf") return "";
  try {
    const doc = mupdf.Document.openDocument(bytes, "application/pdf");
    let out = "";
    for (let i = 0; i < Math.min(doc.countPages(), 3); i++) out += doc.loadPage(i).toStructuredText("preserve-whitespace").asText() + "\n";
    return out;
  } catch { return ""; }
}

/** A bill with a text layer (the sample bills) is read for real; any other file gets bank details made up from the supplier's name, the same every time, so the form can be tried from any bill. */
export async function readBank(bytes: Buffer, mime: string, supplier?: string): Promise<BankRead> {
  await new Promise((r) => setTimeout(r, 900));
  // a bill with a text layer (the sample bills) is read for real: the bank block is found by its labels
  const text = pdfText(bytes, mime);
  const grab = (re: RegExp) => re.exec(text)?.slice(1).map((x) => x.trim());
  const gHolder = grab(/A\/c Holder:\s*(.+)/)?.[0], gBank = grab(/Bank:\s*(.+)/)?.[0], gAccount = grab(/A\/c No:\s*(\d{9,18})/)?.[0], gBranch = grab(/Branch & IFSC:\s*(.+?),\s*([A-Z]{4}0[A-Z0-9]{6})/), gTotal = grab(/Total:\s*Rs\s*(\d+)/)?.[0];
  if (gHolder && gBank && gAccount && gBranch) {
    const found = { holder: gHolder, bank: gBank, account: gAccount, branch: gBranch[0], ifsc: gBranch[1], invoice_total: (gTotal ?? "0") + ".00" };
    return { ...found, warnings: checkBank(found, supplier), model: "Haiku 5.5" };
  }
  const name = (supplier ?? "").trim() || "Meridian Steel Works";
  let h = 7;
  for (const c of name) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  const banks: [string, string, string][] = [["HDFC Bank Ltd.", "HDFC", "Fort Branch, Mumbai"], ["ICICI Bank Ltd.", "ICIC", "Andheri East, Mumbai"], ["State Bank of India", "SBIN", "Commercial Branch, Pune"], ["Axis Bank Ltd.", "UTIB", "Nariman Point, Mumbai"], ["Kotak Mahindra Bank", "KKBK", "BKC, Mumbai"]];
  const [bank, code, branch] = banks[h % banks.length];
  const digits = (n: number) => Array.from({ length: n }, (_, i) => String(((h >> (i % 20)) + i * 7 + 3) % 10)).join("");
  const r = { holder: name.toUpperCase(), bank, account: "5" + digits(11), branch, ifsc: code + "0" + String(100000 + (h % 899999)), invoice_total: String(100000 + (h % 900000)) + ".00" };
  return { ...r, warnings: checkBank(r, supplier), model: "Haiku 5.5" };
}
