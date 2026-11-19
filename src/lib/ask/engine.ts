import "server-only";
import { call } from "../db";
import { canSeeBusiness, canUploadDocs } from "../auth";
import { RefBook, citeRefs, type RefView } from "./refs";
import { defaultModel, modelByKey, type ModelDef } from "./models";
import { answerSoFar } from "./answerSoFar";
import { cannedAnswer } from "./canned";
import type { Scope } from "./tools";

export { answerSoFar };

// The Ask box of the demonstration. Nothing here calls an AI service: the question is matched to one of the sample question types
// (canned.ts), the same read-only lookups as the real product are run against the demo's made-up data, and the answer is written from a
// template around the rows that came back. The screens, the saved chats, the references and the costs shown behave as they always did.

export type ModelKey = string; // a model's API id, see models.ts

export type Answer = {
  answer: string; sources: string[]; follow_ups: string[]; confidence: "found" | "partly" | "not_found";
  used: { name: string; rows: number | null; ms: number }[]; usd: number; model: ModelKey; tokens: { in: number; cached: number; out: number };
  refs: RefView[]; // where the facts were taken from: the answer cites them as [r3]; the screen shows them as numbered links
  auto?: { tier: number; picked: number; upgraded: boolean; reasons: string[] }; // Auto mode: the level used, the level first picked, whether it had to be raised, and why
};
export type AskEvent =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "reset" }
  | { type: "done"; result: Answer }
  | { type: "error"; error: string };

/** A file attached to one question: a PDF or picture (base64) or text. */
export type AskFile = { name: string; kind: "pdf" | "image" | "text"; mime: string; data: string; label?: string };
export const FILE_LIMITS = { count: 5, bytes: 3_000_000, textChars: 60_000, totalTextChars: 120_000 };
export const DEFAULT_FILE_QUESTION = "Read the attached file and tell me what it contains. Then check the important details against our records.";

/** Where the person is when they ask from AI mode: the page and its filters ("this plate", "these invoices" mean what that page shows). */
export type PageCtx = { path: string; title: string; params: Record<string, string> };

export type AskInput = { mode?: "quick"; page?: PageCtx; files?: AskFile[]; project?: { name: string; instructions: string }; question: string; history: { role: "user" | "assistant"; content: string }[]; role: string; model: ModelKey; scope: Scope; chatId: string | null };

/** What the tokens cost on this model, in dollars: input not served from the provider's cache, cached input, and output. */
export const cost = (m: ModelDef, inTok: number, cachedTok: number, outTok: number) => ((inTok - cachedTok) * m.in + cachedTok * (m.cached ?? m.in) + outTok * m.out) / 1e6;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runAsk(input: AskInput, emit: (e: AskEvent) => void): Promise<Answer | null> {
  const t0 = Date.now();
  const m = modelByKey(input.model) ?? defaultModel();
  const used: Answer["used"] = [];
  try {
    const book = new RefBook();
    const ctx = { refs: book, admin: canSeeBusiness(input.role), docs: canUploadDocs(input.role) };
    emit({ type: "status", text: "Thinking" });
    await sleep(350);
    const out = await cannedAnswer({ question: input.question, history: input.history, files: input.files ?? [], quick: input.mode === "quick", page: input.page, role: input.role, ctx }, {
      onTool: async (name, label) => { emit({ type: "status", text: label }); await sleep(450); void name; },
      used: (u) => used.push(u),
    });
    emit({ type: "status", text: "Writing the answer" });
    await sleep(200);
    // the answer appears a few words at a time, as a written answer would
    const words = out.answer.split(/(\s+)/);
    for (let i = 0; i < words.length; i += 6) { emit({ type: "delta", text: words.slice(i, i + 6).join("") }); await sleep(28); }
    const cited = await citeRefs(out.answer, book);
    const inTok = 4200 + Math.round(input.question.length * 3) + used.length * 900, outTok = Math.round(out.answer.length / 3.6);
    const usd = cost(m, inTok, Math.round(inTok * 0.4), outTok);
    const res: Answer = { answer: cited.answer, refs: cited.refs, sources: out.sources, follow_ups: out.follow_ups, confidence: out.confidence, used, usd, model: m.key, tokens: { in: inTok, cached: Math.round(inTok * 0.4), out: outTok } };
    await call(`select public.record_ask2($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10)`,
      [input.question, res.answer, JSON.stringify(used), inTok, outTok, usd.toFixed(5), ((Date.now() - t0) / 1000).toFixed(1), null, m.key, input.chatId]).catch(() => {});
    emit({ type: "done", result: res });
    return res;
  } catch (e) {
    console.error(`[ask] failed: ${e instanceof Error ? e.message.slice(0, 300) : "failed"}`);
    emit({ type: "error", error: "The question could not be answered right now. Please try again." });
    return null;
  }
}
