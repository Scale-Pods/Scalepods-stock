// Builds the demo's embedded database and saves it as demo-db/snapshot.tgz (the app loads that file when it starts).
//   npm run db:build
// Order: platform stubs -> migrations -> extra structure -> dummy data (demo-db/seed/*.sql, then demo-db/seed/*.mjs) -> grants -> snapshot.
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB = join(ROOT, "demo-db");
const db = new PGlite({ extensions: { pg_trgm } });

const run = async (label, sql) => {
  try { await db.exec(sql); }
  catch (e) { console.error(`FAILED ${label}: ${String(e.message).split("\n")[0]}`); process.exit(1); }
};

const t0 = Date.now();
await run("stubs", readFileSync(join(DB, "stubs.sql"), "utf8"));
for (const f of readdirSync(join(DB, "migrations")).filter((f) => f.endsWith(".sql")).sort()) await run(f, readFileSync(join(DB, "migrations", f), "utf8"));
// the enum values must be committed before anything uses them, so the extra structure goes in as separate statements
const extras = readFileSync(join(DB, "extras.sql"), "utf8").split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
for (const s of extras) await run("extras: " + s.slice(0, 60), s.replace(/\n--[^\n]*/g, "") + ";");
console.log(`structure ready in ${Math.round((Date.now() - t0) / 1000)} s`);

const seedDir = join(DB, "seed");
if (existsSync(seedDir)) {
  for (const f of readdirSync(seedDir).sort()) {
    if (f.endsWith(".sql")) await run(f, readFileSync(join(seedDir, f), "utf8"));
    else if (f.endsWith(".mjs")) {
      try { await (await import(pathToFileURL(join(seedDir, f)).href)).default(db); }
      catch (e) { console.error(`FAILED ${f}: ${String(e.message ?? e).split("\n")[0].slice(0, 300)}`); process.exit(1); }
    }
  }
}

// the app reads as "authenticated" (row rules apply) and runs its own functions as the owner
await run("grants", `
  grant usage on schema public, app, auth, extensions to authenticated, anon;
  grant select on all tables in schema public to authenticated;
  grant usage, select on all sequences in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;
  alter database postgres set search_path = public, extensions;
  alter role authenticated set search_path = public, extensions;
  alter role anon set search_path = public, extensions;
`);

const out = join(DB, "snapshot.tgz");
const dump = await db.dumpDataDir("gzip");
writeFileSync(out, Buffer.from(await dump.arrayBuffer()));
const n = await db.query("select count(*)::int n from information_schema.tables where table_schema = 'public'");
console.log(`snapshot written: ${out} (${Math.round(Buffer.from(await dump.arrayBuffer()).length / 1024)} KB, ${n.rows[0].n} public tables and views) in ${Math.round((Date.now() - t0) / 1000)} s`);
await db.close();
