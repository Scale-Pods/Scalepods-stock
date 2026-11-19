import "server-only";
import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";

// The real product keeps uploaded documents in hosted file storage. The demo has none: files a visitor uploads are kept in memory for as long as the server runs,
// and the sample documents of the dummy data are plain files in /public/demo-docs. This gives the document screens the same few calls they always used.
const g = globalThis as unknown as { __demoFiles?: Map<string, { bytes: Buffer; type: string }> };
const files = () => (g.__demoFiles ??= new Map());

export const putDemoFile = (path: string, bytes: Buffer, type: string) => { files().set(path, { bytes, type }); };

/** The bytes of a stored document: an upload from this session, or one of the sample files. */
export async function demoFile(path: string): Promise<{ bytes: Buffer; type: string } | null> {
  const up = files().get(path);
  if (up) return up;
  try {
    const name = basename(path);
    const bytes = await readFile(join(/* turbopackIgnore: true */ process.cwd(), "public", "demo-docs", name));
    return { bytes, type: /\.pdf$/i.test(name) ? "application/pdf" : /\.png$/i.test(name) ? "image/png" : "image/jpeg" };
  } catch { return null; }
}

export async function storageServer() {
  return {
    storage: {
      from: (_bucket: string) => ({
        createSignedUrl: async (path: string, _secs: number) => ({ data: { signedUrl: `/api/demo-file?path=${encodeURIComponent(path)}` }, error: null }),
        createSignedUploadUrl: async (path: string) => ({ data: { token: "demo", path }, error: null }),
        download: async (path: string) => {
          const f = await demoFile(path);
          return f ? { data: new Blob([new Uint8Array(f.bytes)], { type: f.type }), error: null } : { data: null, error: new Error("Not found") };
        },
        remove: async (paths: string[]) => { paths.forEach((p) => files().delete(p)); return { data: null, error: null }; },
      }),
    },
  };
}
