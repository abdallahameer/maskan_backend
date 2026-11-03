import { Hono } from "hono";
import { requireAuth } from "../../utils/auth";
import type { Bindings } from "../../types";
import {
  FILE_EXTENSIONS,
  MAX_IMAGES,
  MIN_IMAGES,
} from "../../utils/property/constants";
import { toPublicUrl } from "../../utils/property/mapper";

const photos = new Hono<{ Bindings: Bindings }>();

// Add one more photo to an existing property
photos.post("/:id/photos", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const existing = await c.env.DB.prepare(
    "SELECT owner_id FROM properties WHERE id = ?",
  )
    .bind(id)
    .first<{ owner_id: number }>();

  if (!existing) {
    return c.json({ error: "العقار غير موجود" }, 404);
  }
  if (existing.owner_id !== userId) {
    return c.json({ error: "غير مصرح لك" }, 403);
  }

  const current = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM property_images WHERE property_id = ?",
  )
    .bind(id)
    .first<{ total: number }>();
  if ((current?.total ?? 0) >= MAX_IMAGES) {
    return c.json({ error: `الحد الأقصى ${MAX_IMAGES} صور لكل إعلان` }, 400);
  }

  const contentType = c.req.header("Content-Type") || "image/jpeg";
  const ext = FILE_EXTENSIONS[contentType] ?? "jpg";
  const key = `properties/${id}/photo-${Date.now()}.${ext}`;

  await c.env.BUCKET.put(key, c.req.raw.body, {
    httpMetadata: { contentType },
  });

  const result = await c.env.DB.prepare(
    "INSERT INTO property_images (property_id, url, position) VALUES (?, ?, 0)",
  )
    .bind(id, key)
    .run();

  const publicUrl = toPublicUrl(key, new URL(c.req.url).origin);
  return c.json({ id: result.meta.last_row_id, url: publicUrl }, 201);
});

photos.delete("/:id/photos/:photoId", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const photoId = c.req.param("photoId");

  const existing = await c.env.DB.prepare(
    "SELECT owner_id FROM properties WHERE id = ?",
  )
    .bind(id)
    .first<{ owner_id: number }>();

  if (!existing) {
    return c.json({ error: "العقار غير موجود" }, 404);
  }
  if (existing.owner_id !== userId) {
    return c.json({ error: "غير مصرح لك" }, 403);
  }

  const photo = await c.env.DB.prepare(
    "SELECT id FROM property_images WHERE id = ? AND property_id = ?",
  )
    .bind(photoId, id)
    .first();
  if (!photo) {
    return c.json({ error: "الصورة غير موجودة" }, 404);
  }

  const current = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM property_images WHERE property_id = ?",
  )
    .bind(id)
    .first<{ total: number }>();
  if ((current?.total ?? 0) <= MIN_IMAGES) {
    return c.json(
      {
        error:
          "لا يمكن حذف آخر صورة، يجب أن يحتوي الإعلان على صورة واحدة على الأقل",
      },
      400,
    );
  }

  await c.env.DB.prepare(
    "DELETE FROM property_images WHERE id = ? AND property_id = ?",
  )
    .bind(photoId, id)
    .run();

  return c.json({ success: true });
});

export default photos;
