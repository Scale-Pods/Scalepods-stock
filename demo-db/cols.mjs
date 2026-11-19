import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFileSync } from "node:fs";
const db = new PGlite({ loadDataDir: new Blob([readFileSync("snapshot.tgz")]), extensions: { pg_trgm } });
const want = process.argv.slice(2);
for (const t of want) {
  const [s, n] = t.includes(".") ? t.split(".") : ["public", t];
  const r = await db.query("select a.attname c, format_type(a.atttypid,a.atttypmod) ty, a.attnotnull nn, pg_get_expr(d.adbin,d.adrelid) df, a.attgenerated g from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace ns on ns.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where ns.nspname=$1 and c.relname=$2 and a.attnum>0 and not a.attisdropped order by a.attnum", [s, n]);
  console.log("== " + t + ": " + r.rows.map(x => `${x.c} ${x.ty}${x.nn ? "!" : ""}${x.g ? "(gen)" : x.df ? "=" + x.df.slice(0, 18) : ""}`).join(", "));
}
