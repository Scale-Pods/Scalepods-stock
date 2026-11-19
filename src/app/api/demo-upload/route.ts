import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/lib/db";
import { putDemoFile } from "@/lib/storage";

/** The upload box sends the file here (the real product sends it straight to hosted storage). Kept in memory; gone when the server restarts. */
export async function POST(req: NextRequest) {
  if (!(await currentUserId())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!/^[\w./-]{3,200}$/.test(path)) return NextResponse.json({ error: "Bad path" }, { status: 400 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0 || buf.length > 25_000_000) return NextResponse.json({ error: "The file must be between 1 byte and 25 MB" }, { status: 400 });
  putDemoFile(path, buf, req.headers.get("content-type") ?? "application/octet-stream");
  return NextResponse.json({ ok: true });
}
