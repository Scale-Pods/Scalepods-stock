import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cache } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { PGlite, types } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { DEMO_COOKIE, UUID } from "./demoAuth";

// The demo's database: an embedded PostgreSQL (PGlite) that lives inside the app and starts from a saved copy filled with dummy data (demo-db/snapshot.tgz).
// Nothing is hosted and nothing outside the app is reached. The rest of the app asks questions exactly as the real product does: every query runs as the
// signed-in person, inside a transaction, with the same row-level security rules.
const g = globalThis as unknown as { __demoDb?: Promise<PGlite> };

function open(): Promise<PGlite> {
  return (g.__demoDb ??= (async () => {
    const snapshot = readFileSync(join(/* turbopackIgnore: true */ process.cwd(), "demo-db", "snapshot.tgz"));
    const db = new PGlite({
      loadDataDir: new Blob([new Uint8Array(snapshot)]),
      extensions: { pg_trgm },
      // answer with the same kinds of values the hosted version gives (numbers and big counts as text, dates as Date objects)
      parsers: {
        [types.INT8]: (v: string) => v,
        [types.NUMERIC]: (v: string) => v,
        [types.DATE]: (v: string) => { const [y, m, d] = v.split("-").map(Number); return new Date(y, m - 1, d); },
      },
    });
    await db.exec("set search_path = public, extensions"); // the text-matching functions (pg_trgm) live in "extensions", as on the hosted platform
    return db;
  })());
}

/** Is the database up? (for the uptime check) */
export async function ping(): Promise<boolean> {
  try { await (await open()).query("select 1"); return true; } catch { return false; }
}

export type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

// A streamed answer keeps working after the request handler has returned, when the cookie can no longer be read: the handler reads the person once and runs the rest as them.
const asUser = new AsyncLocalStorage<string>();
export const runAs = <T,>(userId: string, fn: () => Promise<T>) => asUser.run(userId, fn);

/** The signed-in person's id (from the demo sign-in cookie), or null. */
export const currentUserId = cache(async (): Promise<string | null> => {
  const forced = asUser.getStore();
  if (forced) return forced;
  await connection(); // everything here is per person: render at request time, never in the prerendered shell
  const v = (await cookies()).get(DEMO_COOKIE)?.value;
  return v && UUID.test(v) ? v : null;
});

export class NotSignedIn extends Error {
  constructor() {
    super("Not signed in");
  }
}

// one statement with values, or several statements without
const run = async (db: Pick<PGlite, "query" | "exec">, sql: string, params: unknown[] = []) => {
  if (params.length === 0 && /;\s*\S/.test(sql)) {
    const r = await db.exec(sql);
    return { rows: (r[r.length - 1]?.rows ?? []) as Record<string, unknown>[] };
  }
  const r = await db.query(sql, params as never[]);
  return { rows: r.rows as Record<string, unknown>[] };
};

async function inTx<T>(userId: string, readOnly: boolean, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(userId)) throw new NotSignedIn();
  const db = await open();
  return db.transaction(async (t) => {
    const claims = JSON.stringify({ sub: userId, role: "authenticated" });
    await t.exec(`${readOnly ? "set transaction read only; " : ""}select set_config('request.jwt.claims', '${claims}', true); set local role authenticated; set local search_path = public, extensions`);
    return fn({ query: (sql, params) => run(t, sql, params) });
  });
}

/** Read as the signed-in person. */
export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const id = await currentUserId();
  if (!id) throw new NotSignedIn();
  return inTx(id, true, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

/** Several reads as the signed-in person in one transaction. */
export async function qTx<T>(fn: (q: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  const id = await currentUserId();
  if (!id) throw new NotSignedIn();
  return inTx(id, true, (tx) => {
    let chain: Promise<unknown> = Promise.resolve();
    return fn(<R,>(sql: string, params: unknown[] = []) => {
      const next = chain.then(() => tx.query(sql, params));
      chain = next.catch(() => undefined);
      return next.then((r) => r.rows as R[]);
    });
  });
}

/** For the server's own work with nobody signed in (the owner of the database, so the row rules are skipped). */
export async function serviceQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await open();
  return (await run(db, sql, params)).rows as T[];
}

/** Write as the signed-in person (the checked functions in the database). */
export async function call<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const id = await currentUserId();
  if (!id) throw new NotSignedIn();
  return inTx(id, false, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

/** A message that is safe to show: only our own "raise exception" texts and permission errors, never raw database detail. */
export function userMessage(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (e instanceof NotSignedIn) return "Your session has ended. Please sign in again.";
  if ((err.code === "P0001" || err.code === "42501" || err.code === "23514") && err.message) return err.message;
  return "Something went wrong. Nothing was saved.";
}
