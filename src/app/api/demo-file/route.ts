import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/lib/db";
import { demoFile } from "@/lib/storage";

/** A stored document (an upload of this session or a sample file), for signed-in people only. */
export async function GET(req: NextRequest) {
  if (!(await currentUserId())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const f = await demoFile(req.nextUrl.searchParams.get("path") ?? "");
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(f.bytes), { headers: { "content-type": f.type, "content-disposition": "inline", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
