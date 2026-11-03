import { Hono } from "hono";
import { requireAuth } from "../../utils/auth";
import type { Bindings } from "../../types";

const remove = new Hono<{ Bindings: Bindings }>();

remove.delete("/:id", requireAuth, async (c) => {
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
    return c.json({ error: "غير مصرح لك بحذف هذا الإعلان" }, 403);
  }

  await c.env.DB.prepare("DELETE FROM property_images WHERE property_id = ?")
    .bind(id)
    .run();
  await c.env.DB.prepare("DELETE FROM favorites WHERE property_id = ?")
    .bind(id)
    .run();
  await c.env.DB.prepare("DELETE FROM properties WHERE id = ?").bind(id).run();

  return c.json({ success: true });
});

export default remove;
