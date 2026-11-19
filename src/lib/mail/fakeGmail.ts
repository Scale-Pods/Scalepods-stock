import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// A small stand-in for Gmail, for the demonstration. It answers the same calls the real Gmail API does (labels, conversations, a conversation in full,
// attachments, drafts, send, star / archive / read / trash), from sample mail made up when the server starts. Changes are kept in memory only,
// for as long as the server runs. Nothing leaves the server and no Google account is involved.

type Part = { mimeType?: string; filename?: string; headers?: { name: string; value: string }[]; body?: { size?: number; data?: string; attachmentId?: string }; parts?: Part[] };
type Att = { id: string; name: string; mime: string; file?: string; bytes?: Buffer };
type Msg = { id: string; threadId: string; at: number; from: string; to: string; cc: string; subject: string; html: string; text: string; labels: Set<string>; atts: Att[]; mid: string; refs: string };
type Box = { address: string; msgs: Map<string, Msg>; order: string[]; drafts: Map<string, string>; seq: number };

const g = globalThis as unknown as { __fakeGmail?: Map<string, Box> };
const boxes = () => (g.__fakeGmail ??= new Map());

const hex = (n: number) => { let s = ""; while (s.length < n) s += Math.floor(Math.random() * 16).toString(16); return s; };
const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const toText = (h: string) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\n{3,}/g, "\n\n").trim();

// ---------------------------------------------------------------- the sample mail
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const PEOPLE: [string, string, string][] = [
  ["Rohan Iyer", "Orion Boilers", "orionboilers"], ["Meera Kulkarni", "Vanguard Pressure Vessels", "vanguardpv"], ["Vikram Reddy", "Apex Heat Exchangers", "apexheat"], ["Anita Bhatt", "Sterling Process Engineers", "sterlingpe"],
  ["Sanjay Nair", "Kaveri Thermal Works", "kaverithermal"], ["Pooja Joshi", "Zenith Fabricators", "zenithfab"], ["Kiran Menon", "Lotus Engineering Works", "lotusengg"], ["Deepak Sinha", "Harbor Marine Fabrication", "harbormarine"],
  ["Neha Pillai", "Pinnacle Cryo Systems", "pinnaclecryo"], ["Arjun Desai", "Crestline Energy Projects", "crestlineenergy"], ["Sunita Chopra", "Summit Boilers & Tanks", "summitboilers"], ["Manish Rao", "BlueArc Industries", "bluearc"],
];
const GRADES = ["SA 387 GR 22 CL2", "SA 387 GR 11 CL2", "SA 516 GR 70", "16Mo3", "S690QL", "Rockstar 400", "SA 537 CL1", "A36"];
const THK = [8, 10, 12, 16, 20, 25, 32];

type Scn = { cat: string; subject: (g: string, t: number) => string; first: (n: string, g: string, t: number) => string; reply?: (n: string, g: string, t: number) => string; again?: (n: string) => string; att?: string; ourAtt?: string };
const SCN: Scn[] = [
  { cat: "enquiry", subject: (g, t) => `Enquiry for ${g} plates ${t} mm`, first: (n, g, t) => `Dear Sir,<br><br>Please share your best price and delivery for ${g}, ${t} mm thick, 2000 x 6000, quantity about ${8 + (t % 5) * 3} tonnes. We need test certificates with the material.<br><br>Regards,<br>${n}`,
    reply: (n, g, t) => `Dear ${n.split(" ")[0]},<br><br>Thank you for your enquiry. We have ${g} ${t} mm ex stock. Our offer: Rs ${118 + t}/kg, delivery within 5 days of order, payment 30 days, mill test certificates included. Valid for 15 days.<br><br>Regards,<br>Sales Team<br>M/s. Northwind Pipes &amp; Fittings`, again: (n) => `Dear Sir,<br><br>Thank you. Can you do a better rate if we take the full quantity? Please revert today.<br><br>Regards,<br>${n}` },
  { cat: "po", subject: (g) => `Purchase order for ${g}`, first: (n, g, t) => `Dear Sir,<br><br>Please find our purchase order attached for ${g}, ${t} mm. Kindly confirm the delivery schedule and send the proforma invoice.<br><br>Regards,<br>${n}`, att: "po-1.pdf",
    reply: (n) => `Dear ${n.split(" ")[0]},<br><br>Thank you for the order. We have noted it and will dispatch within 4 days. The invoice will follow with the vehicle details.<br><br>Regards,<br>Sales Team` },
  { cat: "mtc", subject: (_g, t) => `Test certificates required, heat ${40000 + t * 137}K`, first: (n) => `Dear Sir,<br><br>Please send the mill test certificates for the last supply. Our third-party inspector is coming on Friday and needs them before the material is accepted.<br><br>Thanks,<br>${n}`,
    reply: (n) => `Dear ${n.split(" ")[0]},<br><br>Please find the mill test certificates attached for your reference.<br><br>Regards,<br>Sales Team`, ourAtt: "mtc-2.pdf" },
  { cat: "payment", subject: () => `Payment advice against invoice 3${40 + Math.floor(Math.random() * 40)}/26-27`, first: (n) => `Dear Sir,<br><br>We have released the payment today by RTGS. UTR number and the remittance advice are attached. Please confirm receipt.<br><br>Regards,<br>${n}<br>Accounts`, att: "bill-3.pdf" },
  { cat: "quote", subject: (g, t) => `Quotation request: ${g} ${t} mm`, first: (n, g, t) => `Dear Sir/Madam,<br><br>We are looking for ${g}, ${t} mm, ${12 + t % 7} tonnes, delivery to Pune. Please quote your lowest price.<br><br>Regards,<br>${n}`,
    reply: (n, g) => `Dear ${n.split(" ")[0]},<br><br>Please find our quotation for ${g} below. Rate and delivery terms are as discussed on the phone.<br><br>Regards,<br>Sales Team` },
  { cat: "delivery", subject: () => `Delivery schedule for PO 4500${3100 + Math.floor(Math.random() * 300)}`, first: (n) => `Dear Sir,<br><br>Our site needs the plates by next Wednesday. Can you confirm the vehicle number and expected time of arrival?<br><br>Regards,<br>${n}`,
    reply: (n) => `Dear ${n.split(" ")[0]},<br><br>The vehicle MH04AB4321 leaves our yard tomorrow morning and should reach you by Wednesday noon.<br><br>Regards,<br>Dispatch Team` },
];

function table(rows: string[][]) { return `<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-size:13px"><tr style="background:#eee">${rows[0].map((c) => `<th>${c}</th>`).join("")}</tr>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`; }

function build(address: string): Box {
  const box: Box = { address, msgs: new Map(), order: [], drafts: new Map(), seq: 0 };
  const sales = /sales|demo/.test(address) ? address : "sales@northwindpipes.example";
  const R = rng([...address].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const now = Date.now();
  const add = (m: Omit<Msg, "id" | "text" | "mid" | "refs"> & { refs?: string }) => { const id = hex(16); const msg: Msg = { ...m, id, text: toText(m.html), mid: `<${hex(20)}@mail.example>`, refs: m.refs ?? "" }; box.msgs.set(id, msg); box.order.push(id); return msg; };
  const count = address.startsWith("accounts") ? 12 : address.startsWith("sales") ? 16 : 28;
  for (let i = 0; i < count; i++) {
    const s = address.startsWith("accounts") ? SCN[[3, 3, 1, 5][i % 4]] : SCN[Math.floor(R() * SCN.length)];
    const p = PEOPLE[Math.floor(R() * PEOPLE.length)], gr = GRADES[Math.floor(R() * GRADES.length)], t = THK[Math.floor(R() * THK.length)];
    const who = `${p[0]} <${p[0].split(" ")[0].toLowerCase()}@${p[2]}.example>`, tid = hex(16);
    const age = i < 4 ? i * 3 + 1 : 6 + i * 17 + Math.floor(R() * 10); // hours
    const t0 = now - age * 3_600_000;
    const unread = i < 6;
    const subject = s.subject(gr, t);
    const first = add({ threadId: tid, at: t0, from: who, to: address, cc: "", subject, html: s.first(p[0], gr, t), labels: new Set(["INBOX", ...(unread ? ["UNREAD"] : []), ...(i % 7 === 3 ? ["STARRED"] : [])]), atts: s.att ? [{ id: "", name: s.att.replace(/-\d/, "-" + p[2]).replace(/^po/, "PO"), mime: "application/pdf", file: s.att }] : [] });
    if (s.reply && i % 3 !== 0) {
      const rep = add({ threadId: tid, at: t0 + 2.5 * 3_600_000, from: `Sales Team <${sales}>`, to: who, cc: "", subject: `Re: ${subject}`, html: s.reply(p[0], gr, t), labels: new Set(["SENT"]), atts: s.ourAtt ? [{ id: "", name: "Mill test certificates.pdf", mime: "application/pdf", file: s.ourAtt }] : [], refs: first.mid });
      if (s.again && i % 2 === 0) add({ threadId: tid, at: t0 + 20 * 3_600_000, from: who, to: address, cc: "", subject: `Re: ${subject}`, html: s.again(p[0]), labels: new Set(["INBOX", ...(unread ? ["UNREAD"] : [])]), atts: [], refs: `${first.mid} ${rep.mid}` });
      else first.labels.delete("UNREAD");
    }
  }
  // the mill's dispatch mail, with the table in the body
  const mill = ["Meridian Steel Works Dispatch <dispatch@meridian-steel.example>"];
  for (let k = 0; k < 2; k++) {
    const date = new Date(now - (30 + k * 190) * 3_600_000).toLocaleDateString("en-GB").replace(/\//g, "-");
    const rows = [["Cust Name", "Material Desc", "Material", "SO No Item", "Thick", "Width", "Length", "Pieces", "Quantity", "Inv No Item", "Invoice Value", "Inv Date", "Batch", "UPR", "Freight Per Ton", "Cus Grade", "Order Type", "Ship To Party Name", "Destination", "Trans Name", "Truck No", "TC Number"], ...Array.from({ length: 3 }, (_, r) => { const thk = THK[(k + r) % 7], q = 2.4 + r * 1.1, upr = 131000 + r * 500; return ["NORTHWIND PIPES & FITTINGS", "SA 387 GR 22 CL2 PLATE", "MC" + (41000 + k * 7 + r), `${6100000 + k * 31 + r}-${(r + 1) * 10}`, String(thk), "2000", "6000", String(2 + r), q.toFixed(3), `${7100000000 + k * 977 + r}-${(r + 1) * 10}`, String(Math.round(q * upr * 1.18)), date, `${52000 + k * 311 + r * 17}SA`, String(upr), "1100", "SA387 GR22 CL2", "Standard", "NORTHWIND PIPES & FITTINGS", "Mumbai", "Rapid Road Carriers", "MH04CD2211", `TC${400000 + k * 91 + r}`]; })];
    add({ threadId: hex(16), at: now - (30 + k * 190) * 3_600_000, from: mill[0], to: address, cc: "", subject: `Dispatch details ${date}`, html: `<p>Dear Customer,</p><p>Please find the dispatch details below.</p>${table(rows)}<p>Regards,<br>Meridian Steel Works</p>`, labels: new Set(["INBOX"]), atts: [] });
  }
  // a draft and one in spam
  const dt = hex(16), dm = add({ threadId: dt, at: now - 5 * 3_600_000, from: `Sales Team <${sales}>`, to: "Rohan Iyer <rohan@orionboilers.example>", cc: "", subject: "Quotation for SA 387 GR 11 CL2", html: "<p>Dear Rohan,</p><p>Please find our quotation below. Rate: [to be confirmed]</p>", labels: new Set(["DRAFT"]), atts: [] });
  box.drafts.set(`r${hex(12)}`, dm.id);
  add({ threadId: hex(16), at: now - 70 * 3_600_000, from: "Global Metals Offer <offers@cheapmetals.example>", to: address, cc: "", subject: "Bulk steel offer, limited time", html: "<p>Cheapest steel plates direct from factory. Reply for a catalogue.</p>", labels: new Set(["SPAM"]), atts: [] });
  return box;
}

const boxOf = (token: string): Box => {
  const address = token.replace(/^demo:/, "") || "demo@northwindpipes.example";
  let b = boxes().get(address);
  if (!b) { b = build(address); boxes().set(address, b); }
  return b;
};

// ---------------------------------------------------------------- Gmail shapes
const hdr = (name: string, value: string) => ({ name, value });
function payload(m: Msg): Part {
  const alt: Part = { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { size: m.text.length, data: b64url(m.text) } }, { mimeType: "text/html", body: { size: m.html.length, data: b64url(m.html) } }] };
  const headers = [hdr("From", m.from), hdr("To", m.to), ...(m.cc ? [hdr("Cc", m.cc)] : []), hdr("Subject", m.subject), hdr("Date", new Date(m.at).toUTCString()), hdr("Message-ID", m.mid), ...(m.refs ? [hdr("References", m.refs)] : [])];
  if (m.atts.length === 0) return { ...alt, headers };
  return { mimeType: "multipart/mixed", headers, parts: [alt, ...m.atts.map((a, i): Part => ({ mimeType: a.mime, filename: a.name, body: { size: a.bytes?.length ?? 60000, attachmentId: `${m.id}-${i}` } }))] };
}
const shape = (m: Msg) => ({ id: m.id, threadId: m.threadId, internalDate: String(m.at), snippet: m.text.replace(/\s+/g, " ").slice(0, 110), labelIds: [...m.labels], payload: payload(m) });
const threadMsgs = (b: Box, id: string) => b.order.map((i) => b.msgs.get(i)!).filter((m) => m.threadId === id).sort((x, y) => x.at - y.at);
const ids = (b: Box) => [...new Set(b.order.map((i) => b.msgs.get(i)!.threadId))];

function matches(b: Box, tid: string, q: string): boolean {
  const ms = threadMsgs(b, tid);
  const text = ms.map((m) => `${m.subject} ${m.from} ${m.to} ${m.text}`).join(" ").toLowerCase();
  let rest = q;
  const take = (re: RegExp, fn: (v: string) => boolean) => { rest = rest.replace(re, (_m, v: string) => { if (!fn((v ?? "").replace(/^"|"$/g, "").toLowerCase())) ok = false; return " "; }); };
  let ok = true;
  take(/subject:("[^"]*"|\S+)/gi, (v) => ms.some((m) => m.subject.toLowerCase().includes(v)));
  take(/from:("[^"]*"|\S+)/gi, (v) => ms.some((m) => m.from.toLowerCase().includes(v)));
  take(/to:("[^"]*"|\S+)/gi, (v) => ms.some((m) => m.to.toLowerCase().includes(v)));
  rest = rest.replace(/has:attachment/gi, () => { if (!ms.some((m) => m.atts.length)) ok = false; return " "; }).replace(/is:unread/gi, () => { if (!ms.some((m) => m.labels.has("UNREAD"))) ok = false; return " "; }).replace(/is:starred/gi, () => { if (!ms.some((m) => m.labels.has("STARRED"))) ok = false; return " "; });
  rest = rest.replace(/(-?)in:(\w+)/gi, (_m, neg: string, l: string) => { const has = ms.some((m) => m.labels.has(l.toUpperCase())); if (neg ? has : !has) ok = false; return " "; });
  for (const w of rest.toLowerCase().split(/\s+/).filter(Boolean)) if (!text.includes(w)) ok = false;
  return ok;
}

// ---------------------------------------------------------------- reading a sent mail (the raw text the app builds)
function parseRaw(raw: string): { headers: Record<string, string>; html: string; text: string; atts: Att[] } {
  const s = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const split = (x: string) => { const i = x.indexOf("\r\n\r\n"); return i < 0 ? [x, ""] : [x.slice(0, i), x.slice(i + 4)]; };
  const heads = (h: string) => Object.fromEntries(h.replace(/\r\n[ \t]+/g, " ").split("\r\n").map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).toLowerCase(), l.slice(i + 1).trim()]; }));
  const out = { html: "", text: "", atts: [] as Att[] };
  const walk = (h: Record<string, string>, body: string) => {
    const ct = h["content-type"] ?? "text/plain", boundary = /boundary="?([^";]+)"?/i.exec(ct)?.[1];
    if (boundary && /multipart/i.test(ct)) { for (const part of body.split(`--${boundary}`).slice(1)) { if (part.startsWith("--")) break; const [ph, pb] = split(part.replace(/^\r\n/, "")); walk(heads(ph), pb.replace(/\r\n$/, "")); } return; }
    const data = /base64/i.test(h["content-transfer-encoding"] ?? "") ? Buffer.from(body.replace(/\s+/g, ""), "base64") : Buffer.from(body, "utf8");
    const name = /filename="?([^";]+)"?/i.exec(h["content-disposition"] ?? "")?.[1];
    if (name) out.atts.push({ id: "", name, mime: ct.split(";")[0].trim(), bytes: data });
    else if (/text\/html/i.test(ct)) out.html = data.toString("utf8");
    else if (/text\/plain/i.test(ct)) out.text = data.toString("utf8");
  };
  const [h, b] = split(s);
  const hh = heads(h);
  walk(hh, b);
  return { headers: hh, html: out.html, text: out.text, atts: out.atts };
}
const decodeWord = (v: string) => v.replace(/=\?UTF-8\?B\?([^?]*)\?=/gi, (_m, x: string) => Buffer.from(x, "base64").toString("utf8"));

function fromRaw(b: Box, raw: string, threadId: string | undefined, labels: string[]): Msg {
  const p = parseRaw(raw);
  const m: Msg = { id: hex(16), threadId: threadId && ids(b).includes(threadId) ? threadId : hex(16), at: Date.now(), from: p.headers.from || b.address, to: p.headers.to ?? "", cc: p.headers.cc ?? "", subject: decodeWord(p.headers.subject ?? ""), html: p.html || `<p>${esc(p.text)}</p>`, text: p.text || toText(p.html), labels: new Set(labels), atts: p.atts, mid: `<${hex(20)}@mail.example>`, refs: [p.headers.references, p.headers["in-reply-to"]].filter(Boolean).join(" ") };
  b.msgs.set(m.id, m); b.order.push(m.id);
  return m;
}

// ---------------------------------------------------------------- the calls the app makes
export async function fakeGet<T>(token: string, path: string, params: Record<string, string | string[]>): Promise<T> {
  const b = boxOf(token);
  const one = (k: string) => { const v = params[k]; return Array.isArray(v) ? v[0] : v; };
  let m: RegExpExecArray | null;
  if ((m = /^\/labels\/(\w+)$/.exec(path))) {
    const l = m[1], tids = ids(b).filter((t) => threadMsgs(b, t).some((x) => x.labels.has(l)));
    return { id: l, threadsTotal: l === "DRAFT" ? b.drafts.size : tids.length, threadsUnread: tids.filter((t) => threadMsgs(b, t).some((x) => x.labels.has("UNREAD"))).length } as T;
  }
  if (path === "/threads") {
    const label = one("labelIds"), q = one("q") ?? "", max = Number(one("maxResults") ?? 25), off = Number(one("pageToken") ?? 0);
    const all = ids(b).filter((t) => (!label || threadMsgs(b, t).some((x) => x.labels.has(label))) && matches(b, t, q))
      .sort((x, y) => threadMsgs(b, y).at(-1)!.at - threadMsgs(b, x).at(-1)!.at);
    const page = all.slice(off, off + max);
    return { threads: page.map((id) => ({ id })), nextPageToken: off + max < all.length ? String(off + max) : undefined, resultSizeEstimate: all.length } as T;
  }
  if (path === "/messages") {
    const qq = (one("q") ?? "").replace(/newer_than:\S+/g, " ").replace(/[()]/g, " ");
    const out = b.order.map((i) => b.msgs.get(i)!).filter((x) => x.labels.has("INBOX") && matches(b, x.threadId, qq)).sort((x, y) => y.at - x.at).slice(0, Number(one("maxResults") ?? 50));
    return { messages: out.map((x) => ({ id: x.id, threadId: x.threadId })) } as T;
  }
  if ((m = /^\/threads\/([0-9a-f]+)$/.exec(path))) { const ms = threadMsgs(b, m[1]); if (!ms.length) throw new Error("Gmail said 404 for /threads"); return { id: m[1], messages: ms.map(shape) } as T; }
  if ((m = /^\/messages\/([0-9a-f]+)$/.exec(path))) { const x = b.msgs.get(m[1]); if (!x) throw new Error("Gmail said 404 for /messages"); return shape(x) as T; }
  if ((m = /^\/messages\/([0-9a-f]+)\/attachments\/([\w-]+)$/.exec(path))) {
    const x = b.msgs.get(m[1]), n = Number(m[2].split("-").pop());
    const a = x?.atts[n];
    if (!a) throw new Error("Gmail said 404 for /messages");
    let bytes = a.bytes;
    if (!bytes && a.file) { try { bytes = await readFile(join(/* turbopackIgnore: true */ process.cwd(), "public", "demo-docs", a.file)); } catch { bytes = Buffer.from("%PDF-1.4\n"); } }
    return { data: b64url(bytes ?? Buffer.alloc(0)), size: bytes?.length ?? 0 } as T;
  }
  if (path === "/drafts") return { drafts: [...b.drafts].map(([id, mid]) => ({ id, message: { id: mid, threadId: b.msgs.get(mid)?.threadId } })) } as T;
  throw new Error(`Gmail said 404 for ${path}`);
}

export async function fakeWrite<T>(token: string, method: string, path: string, body?: unknown): Promise<T | null> {
  const b = boxOf(token);
  const bd = (body ?? {}) as { addLabelIds?: string[]; removeLabelIds?: string[]; raw?: string; threadId?: string; message?: { raw: string; threadId?: string }; id?: string };
  let m: RegExpExecArray | null;
  const all = (tid: string) => threadMsgs(b, tid);
  if ((m = /^\/threads\/([0-9a-f]+)\/modify$/.exec(path))) { for (const x of all(m[1])) { bd.addLabelIds?.forEach((l) => x.labels.add(l)); bd.removeLabelIds?.forEach((l) => x.labels.delete(l)); } return {} as T; }
  if ((m = /^\/threads\/([0-9a-f]+)\/trash$/.exec(path))) { for (const x of all(m[1])) { x.labels.add("TRASH"); x.labels.delete("INBOX"); } return {} as T; }
  if ((m = /^\/threads\/([0-9a-f]+)\/untrash$/.exec(path))) { for (const x of all(m[1])) { x.labels.delete("TRASH"); if (!x.labels.has("SENT") && !x.labels.has("DRAFT")) x.labels.add("INBOX"); } return {} as T; }
  if (path === "/messages/send") { const x = fromRaw(b, bd.raw ?? "", bd.threadId, ["SENT"]); return { id: x.id, threadId: x.threadId } as T; }
  if (path === "/drafts" && method === "POST") { const x = fromRaw(b, bd.message?.raw ?? "", bd.message?.threadId, ["DRAFT"]); const id = `r${hex(12)}`; b.drafts.set(id, x.id); return { id, message: { id: x.id, threadId: x.threadId } } as T; }
  if ((m = /^\/drafts\/(\w+)$/.exec(path))) {
    const old = b.drafts.get(m[1]);
    if (method === "DELETE") { if (old) { b.msgs.delete(old); b.order = b.order.filter((i) => i !== old); b.drafts.delete(m[1]); } return null; }
    const prev = old ? b.msgs.get(old) : undefined;
    if (old) { b.msgs.delete(old); b.order = b.order.filter((i) => i !== old); }
    const x = fromRaw(b, bd.message?.raw ?? "", prev?.threadId ?? bd.message?.threadId, ["DRAFT"]);
    b.drafts.set(m[1], x.id);
    return { id: m[1], message: { id: x.id, threadId: x.threadId } } as T;
  }
  if (path === "/drafts/send") {
    const mid = b.drafts.get(bd.id ?? "");
    const x = mid ? b.msgs.get(mid) : undefined;
    if (!x) throw new Error("Gmail said 404 for /drafts");
    x.labels.delete("DRAFT"); x.labels.add("SENT"); x.at = Date.now(); b.drafts.delete(bd.id!);
    return { id: x.id, threadId: x.threadId } as T;
  }
  throw new Error(`Gmail said 404 for ${path}`);
}
