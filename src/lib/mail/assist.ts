import "server-only";

// The AI help of the mail window, in the demonstration: write a mail from a few words, polish what a person wrote, summarise a conversation.
// Nothing is sent to any AI service: the answers are written from templates around the person's own words, so the same request always gives the same result.
// The answer is shown for the person to read, change and approve: nothing is sent by it.

export type Done = { text: string; usd: number; model: string };

export const writeSystem = (name: string) => `write|${name.replace(/[<>"\r\n|]/g, "")}`;
export const refineSystem = "refine";
export const summariseSystem = "summarise";

/** What the model returns, made safe to show: no code fences, no script. */
export const tidy = (s: string) => s.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").replace(/<script[\s\S]*?<\/script>/gi, "").trim();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unesc = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const plain = (h: string) => unesc(h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr)>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\n{3,}/g, "\n\n").trim();
const cap = (s: string) => s.replace(/(^\s*|[.!?]\s+)([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
const sentences = (t: string) => (t.replace(/\s+/g, " ").match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
const para = (lines: string[]) => lines.map((l) => `<p>${esc(l)}</p>`).join("");

const TYPOS: [RegExp, string][] = [[/\brecieve(d?)\b/gi, "receive$1"], [/\bkindly do the needful\b/gi, "kindly take the necessary action"], [/\bplz\b|\bpls\b/gi, "please"], [/\bu\b/g, "you"], [/\bur\b/g, "your"], [/\bthanx\b|\bthnx\b/gi, "thanks"], [/\bdilivery\b|\bdelivary\b/gi, "delivery"], [/\bqoutation\b|\bquotaion\b/gi, "quotation"], [/\bmaterail\b|\bmateral\b/gi, "material"], [/\bpayement\b/gi, "payment"], [/\bshedule\b/gi, "schedule"], [/\bi am\b/g, "I am"], [/\bi\b/g, "I"], [/\bdont\b/gi, "don't"], [/\bcant\b/gi, "can't"], [/\bwont\b/gi, "won't"]];

function write(name: string, user: string): string {
  const instruction = /What the e-mail should say: ([\s\S]*?)(?:\nSubject:|\nThe mail being answered:|$)/.exec(user)?.[1]?.trim() ?? "";
  const original = /<mail>\n([\s\S]*?)\n<\/mail>/.exec(user)?.[1]?.toLowerCase() ?? "";
  const subject = /\nSubject: ([^\n]*)/.exec(user)?.[1]?.trim() ?? "";
  const sign = `<p>Regards,<br>${esc(name)}<br>M/s. Northwind Pipes &amp; Fittings</p>`;
  if (instruction) {
    // "tell Rohan that the plates go on Friday" -> a greeting by name and the message itself
    const addr = /^(?:please\s+)?(?:tell|inform|let|ask|remind|write to|mail|email|message)\s+([A-Za-z]+)\s+(?:that\s+|to\s+|know\s+(?:that\s+)?)?(.*)$/i.exec(instruction);
    const asks = /^(?:please\s+)?ask\b/i.test(instruction), remind = /^(?:please\s+)?remind\b/i.test(instruction);
    const rest = (addr?.[2] ?? instruction).replace(/\band (send|share|attach)\b/gi, "and we will $1").replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, (d) => d[0].toUpperCase() + d.slice(1).toLowerCase());
    const name = addr?.[1] && !/^(the|them|us|him|her|all)$/i.test(addr[1]) ? addr[1][0].toUpperCase() + addr[1].slice(1) : null;
    const lead = asks ? "Could you please " : remind ? "This is a gentle reminder " + (/^to\b/i.test(addr?.[2] ?? "") ? "" : "that ") : "";
    const body = sentences(cap(lead + (asks ? rest.replace(/^(you\s+)?to\s+/i, "") : rest))).map((s) => (/[.!?]$/.test(s) ? s : s + (asks ? "?" : ".")));
    return `<p>${name ? `Dear ${esc(name)},` : "Dear Sir/Madam,"}</p>${para(body)}${para(["Please let us know if you need any further information."])}${sign}`;
  }
  const about = subject ? ` regarding "${subject.replace(/^\s*((re|fwd?):\s*)+/i, "")}"` : "";
  if (/price|quot|rate|enquiry|inquiry|offer/.test(original)) return `<p>Dear Sir/Madam,</p>${para([`Thank you for your enquiry${about}.`, "We have the material in stock and can offer it as below:", "Rate: [rate per kg, to be confirmed]", "Delivery: ex stock, within [number] days of your order", "Payment: [payment terms]", "The offer is valid for 15 days. Test certificates will be supplied with the material."])}${sign}`;
  if (/certificate|mtc|test cert|heat/.test(original)) return `<p>Dear Sir/Madam,</p>${para([`Thank you for your mail${about}.`, "Please find the mill test certificates for the heat numbers you asked about attached with this mail. Let us know if you need anything further for your inspection."])}${sign}`;
  if (/payment|paid|utr|neft|rtgs|remittance/.test(original)) return `<p>Dear Sir/Madam,</p>${para([`Thank you for your payment advice${about}.`, "We will check the receipt in our bank account and confirm it to you shortly."])}${sign}`;
  if (/purchase order|\bpo\b|order/.test(original)) return `<p>Dear Sir/Madam,</p>${para([`Thank you for your order${about}.`, "We have noted the purchase order and will confirm the delivery schedule shortly."])}${sign}`;
  return `<p>Dear Sir/Madam,</p>${para([`Thank you for your mail${about}.`, "We have noted the points raised and will get back to you shortly."])}${sign}`;
}

function refine(user: string): string {
  const instruction = /Instruction: ([^\n]*)/.exec(user)?.[1]?.toLowerCase() ?? "";
  const html = /<mail>\n([\s\S]*?)\n<\/mail>/.exec(user)?.[1] ?? "";
  let lines = plain(html).split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const isGreet = (l: string) => /^(dear|hi|hello|hey)\b/i.test(l), isClose = (l: string) => l.length < 40 && /^(regards|thanks|thank you|best|sincerely|yours)/i.test(l);
  const greet = lines.find(isGreet), ci = lines.findIndex(isClose);
  const closing = ci >= 0 ? lines.slice(ci) : [], body = lines.filter((l, i) => !isGreet(l) && (ci < 0 || i < ci));
  let g = greet ?? "Dear Sir/Madam,";
  let b = body;
  if (/grammar|spell|correct|fix|proof/.test(instruction)) b = body.map((l) => cap(TYPOS.reduce((t, [re, to]) => t.replace(re, to), l)).replace(/\s+([,.!?])/g, "$1").replace(/([.!?])(?=[A-Za-z])/g, "$1 ").replace(/\s{2,}/g, " ")).map((l) => (/[.!?:,]$/.test(l) || l.length < 25 ? l : l + "."));
  else if (/short|brief|concise|trim/.test(instruction)) b = [sentences(body.join(" ")).slice(0, 3).join(" ")];
  else if (/formal|professional|polite/.test(instruction)) { g = g.replace(/^(hi|hello|hey)\b[ ,]*/i, "Dear ").replace(/^Dear\s*$/, "Dear Sir/Madam,"); b = body.map((l) => l.replace(/\bthanks\b/gi, "thank you").replace(/\bcan't\b/gi, "cannot").replace(/\bdon't\b/gi, "do not").replace(/\bwon't\b/gi, "will not").replace(/\bASAP\b/g, "at the earliest").replace(/\bpls\b|\bplz\b/gi, "please").replace(/\bI want\b/g, "We would like").replace(/\bsend\b/gi, "please send")); }
  else if (/friend|warm|casual|simple/.test(instruction)) { g = g.replace(/^dear\b\s*/i, "Hi ").replace(/^Hi\s*(sir\/madam)?,?$/i, "Hi,"); b = ["Hope you are doing well.", ...body]; }
  else b = body.map((l) => cap(l));
  const close = closing.length ? closing : ["Regards,"];
  return `<p>${esc(g)}</p>${para(b)}<p>${close.map(esc).join("<br>")}</p>`;
}

function summarise(user: string): string {
  const subject = /^Subject: ([^\n]*)/.exec(user)?.[1]?.trim() || "this conversation";
  const blocks = (/<mail>\n([\s\S]*?)\n<\/mail>/.exec(user)?.[1] ?? "").split(/\n\n----\n\n/).map((b) => {
    const from = /^From: ([^\n]*)/.exec(b)?.[1] ?? "", date = /\nDate: ([^\n]*)/.exec(b)?.[1] ?? "";
    const text = b.replace(/^From:[^\n]*\nDate:[^\n]*\n/, "");
    return { from: from.replace(/<[^>]*>/, "").trim() || "Someone", date, first: sentences(text.replace(/^(dear|hi|hello)[^\n]*\n/i, ""))[0] ?? "" };
  }).filter((b) => b.first);
  if (blocks.length === 0) return `The conversation "${subject}" has no readable text to summarise.`;
  const day = (d: string) => { const x = new Date(d); return Number.isNaN(+x) ? "" : ` (${x.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })})`; };
  const last = blocks[blocks.length - 1];
  return `${blocks.length} message${blocks.length === 1 ? "" : "s"} about "${subject}".\n${blocks.slice(-5).map((b) => `- ${b.from}${day(b.date)}: ${b.first.slice(0, 160)}`).join("\n")}\n- Latest word is from ${last.from}; ${/\?/.test(last.first) || /please|kindly|request/i.test(last.first) ? "it asks for a response from us." : "no action is asked of us right now."}`;
}

export async function complete(system: string, user: string, _maxTokens = 1200): Promise<Done> {
  void _maxTokens;
  await sleep(700);
  const text = system.startsWith("write|") ? write(system.slice(6), user) : system === refineSystem ? refine(user) : summarise(user);
  return { text, usd: 0.0004 + user.length * 1.2e-7, model: "Luna" };
}
