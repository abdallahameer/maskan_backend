import { Hono } from "hono";
import { getOptionalUserId } from "../../utils/auth";
import type { Bindings } from "../../types";
import { PROPERTY_SELECT, toProperties } from "../../utils/property/mapper";

const detail = new Hono<{ Bindings: Bindings }>();

detail.get("/:id", async (c) => {
  const id = c.req.param("id");

  const row = await c.env.DB.prepare(`${PROPERTY_SELECT} WHERE p.id = ?`)
    .bind(id)
    .first();

  if (!row) {
    return c.json({ error: "العقار غير موجود" }, 404);
  }

  await c.env.DB.prepare("UPDATE properties SET views = views + 1 WHERE id = ?")
    .bind(id)
    .run();

  const userId = await getOptionalUserId(c);
  const [property] = await toProperties(c, [row], userId);

  return c.json({ property });
});

export default detail;
