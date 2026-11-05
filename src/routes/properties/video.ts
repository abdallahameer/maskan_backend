import { Hono } from "hono";
import { requireAuth } from "../../utils/auth";
import type { Bindings } from "../../types";
import {
  FILE_EXTENSIONS,
  MAX_VIDEO_BYTES,
} from "../../utils/property/constants";
import { toPublicUrl } from "../../utils/property/mapper";
import { deleteStoredFiles } from "../../utils/property/storage";

const video = new Hono<{ Bindings: Bindings }>();

// Add (or replace) the video of an existing property
video.post("/:id/video", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const existing = await c.env.DB.prepare(
    "SELECT owner_id, video_url FROM properties WHERE id = ?",
  )
    .bind(id)
    .first<{ owner_id: number; video_url: string | null }>();

  if (!existing) {
    return c.json({ error: "العقار غير موجود" }, 404);
  }
  if (existing.owner_id !== userId) {
    return c.json({ error: "غير مصرح لك" }, 403);
  }

  const contentType = c.req.header("Content-Type") || "video/mp4";
  if (!contentType.startsWith("video/")) {
    return c.json({ error: "ملف الفيديو غير صالح" }, 400);
  }
  if (Number(c.req.header("Content-Length") || 0) > MAX_VIDEO_BYTES) {
    return c.json({ error: "حجم الفيديو كبير جداً" }, 400);
  }

  const data = await c.req.arrayBuffer();
  if (data.byteLength === 0) {
    return c.json({ error: "ملف الفيديو غير صالح" }, 400);
  }
  if (data.byteLength > MAX_VIDEO_BYTES) {
    return c.json({ error: "حجم الفيديو كبير جداً" }, 400);
  }

  const ext = FILE_EXTENSIONS[contentType] ?? "mp4";
  const key = `properties/${id}/video-${Date.now()}.${ext}`;

  await c.env.BUCKET.put(key, data, {
    httpMetadata: { contentType },
  });

  await c.env.DB.prepare("UPDATE properties SET video_url = ? WHERE id = ?")
    .bind(key, id)
    .run();

  // The old video (if there was one) is replaced, so remove its file.
  await deleteStoredFiles(c.env.BUCKET, [existing.video_url]);

  const publicUrl = toPublicUrl(key, new URL(c.req.url).origin);
  return c.json({ url: publicUrl }, 201);
});

video.delete("/:id/video", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const existing = await c.env.DB.prepare(
    "SELECT owner_id, video_url FROM properties WHERE id = ?",
  )
    .bind(id)
    .first<{ owner_id: number; video_url: string | null }>();

  if (!existing) {
    return c.json({ error: "العقار غير موجود" }, 404);
  }
  if (existing.owner_id !== userId) {
    return c.json({ error: "غير مصرح لك" }, 403);
  }

  await c.env.DB.prepare("UPDATE properties SET video_url = NULL WHERE id = ?")
    .bind(id)
    .run();

  // Remove the video file from R2 too.
  await deleteStoredFiles(c.env.BUCKET, [existing.video_url]);

  return c.json({ success: true });
});

export default video;
