import { Hono } from "hono";
import { requireAuth } from "../../utils/auth";
import type { Bindings } from "../../types";
import { deleteStoredFiles } from "../../utils/property/storage";

const remove = new Hono<{ Bindings: Bindings }>();

remove.delete("/:id", requireAuth, async (c) => {
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
    return c.json({ error: "غير مصرح لك بحذف هذا الإعلان" }, 403);
  }

  // Remember the files before the rows that point to them are gone.
  const images = await c.env.DB.prepare(
    "SELECT url FROM property_images WHERE property_id = ?",
  )
    .bind(id)
    .all<{ url: string }>();

  // Everything that points to the ad is deleted first (notifications too:
  // D1 refuses to delete a row while another row still points to it), and
  // the ad itself last. A batch runs as one unit: all of it or none of it.
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM notifications WHERE property_id = ?").bind(
      id,
    ),
    c.env.DB.prepare("DELETE FROM favorites WHERE property_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM property_images WHERE property_id = ?").bind(
      id,
    ),
    c.env.DB.prepare("DELETE FROM properties WHERE id = ?").bind(id),
  ]);

  // Only now delete the files from R2 (the ad is already gone for good).
  await deleteStoredFiles(c.env.BUCKET, [
    ...images.results.map((row) => row.url),
    existing.video_url,
  ]);

  return c.json({ success: true });
});

export default remove;
