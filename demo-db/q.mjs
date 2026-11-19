import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFileSync } from "node:fs";
const db = new PGlite({ loadDataDir: new Blob([readFileSync("snapshot.tgz")]), extensions: { pg_trgm } });
await db.exec("set search_path = public, extensions");
for (const sql of process.argv.slice(2)) {
  try { const r = await db.query(sql); console.log(JSON.stringify(r.rows).slice(0, 3000)); }
  catch (e) { console.log("ERR:", String(e.message).slice(0, 300)); }
}
