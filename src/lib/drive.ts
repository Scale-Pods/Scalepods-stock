import "server-only";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

// In the real product this opens a supplier's bill in the company's Google Drive. In the demonstration the bills are sample files in /public/demo-docs, opened from there.

export const driveReady = () => true;

/** The sample bill a link points to ("/demo-docs/bill-2.pdf"), or null for any other link. */
export const driveId = (url: string | null | undefined): string | null => (url && /^\/demo-docs\/[\w.-]+$/.test(url) ? url : null);

/** The bytes of a sample bill and its type. */
export async function driveFile(id: string): Promise<{ bytes: Buffer; mime: string; name: string }> {
  const name = basename(id);
  try {
    const bytes = await readFile(join(/* turbopackIgnore: true */ process.cwd(), "public", "demo-docs", name));
    return { bytes, mime: /\.pdf$/i.test(name) ? "application/pdf" : "image/png", name };
  } catch { throw new Error("The bill could not be found."); }
}
