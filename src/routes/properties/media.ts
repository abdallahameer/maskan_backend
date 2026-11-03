import { Hono } from "hono";
import type { Bindings } from "../../types";

const media = new Hono<{ Bindings: Bindings }>();

// Serves photos and videos stored in R2 (supports "Range" so videos can play
// and seek). Anyone can view them, just like the ads themselves.
media.get("/media/*", async (c) => {
  const marker = "/media/";
  const path = c.req.path;
  const key = decodeURIComponent(
    path.slice(path.indexOf(marker) + marker.length),
  );

  if (!key.startsWith("properties/") || key.includes("..")) {
    return c.json({ error: "الملف غير موجود" }, 404);
  }

  const rangeHeader = c.req.header("Range");
  const object = await c.env.BUCKET.get(
    key,
    rangeHeader ? { range: c.req.raw.headers } : undefined,
  );

  if (!object || !("body" in object)) {
    return c.json({ error: "الملف غير موجود" }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  let status = 200;
  const range: any = object.range;
  if (rangeHeader && range) {
    const length =
      range.suffix !== undefined
        ? Math.min(range.suffix, object.size)
        : (range.length ?? object.size - (range.offset ?? 0));
    const offset =
      range.suffix !== undefined ? object.size - length : (range.offset ?? 0);
    headers.set(
      "Content-Range",
      `bytes ${offset}-${offset + length - 1}/${object.size}`,
    );
    headers.set("Content-Length", String(length));
    status = 206;
  } else {
    headers.set("Content-Length", String(object.size));
  }

  return new Response(object.body, { status, headers });
});

export default media;
