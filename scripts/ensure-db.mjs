// Before `npm run dev`: builds the demo database if its saved copy is missing.
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(join(root, "demo-db", "snapshot.tgz"))) {
  console.log("Building the demo database (first run only)...");
  execFileSync(process.execPath, [join(root, "scripts", "build-db.mjs")], { stdio: "inherit" });
}
