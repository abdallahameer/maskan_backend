import { Hono } from "hono";
import { requireAuth } from "../utils/auth";
import { PROPERTY_SELECT } from "../utils/property/mapper";
import {
  limitPart,
  listResponse,
  readPaging,
} from "../utils/property/paging";

type Bindings = { DB: D1Database; JWT_SECRET: string; BUCKET: R2Bucket };

const favorites = new Hono<{ Bindings: Bindings }>();

// Save a property
favorites.post("/:propertyId", requireAuth, async (c) => {
  const userId = c.get("userId");
  const propertyId = c.req.param("propertyId");

  const property = await c.env.DB.prepare(
    "SELECT id FROM properties WHERE id = ?",
  )
    .bind(propertyId)
    .first();

  if (!property) {
    return c.json({ error: "العقار غير موجود" }, 404);
  }

  try {
    await c.env.DB.prepare(
      "INSERT INTO favorites (user_id, property_id) VALUES (?, ?)",
    )
      .bind(userId, propertyId)
      .run();
  } catch {
    // Already saved before — that's fine, not an error for the user.
  }

  return c.json({ success: true });
});

// Unsave a property
favorites.delete("/:propertyId", requireAuth, async (c) => {
  const userId = c.get("userId");
  const propertyId = c.req.param("propertyId");

  await c.env.DB.prepare(
    "DELETE FROM favorites WHERE user_id = ? AND property_id = ?",
  )
    .bind(userId, propertyId)
    .run();

  return c.json({ success: true });
});

// List my saved properties.
// Same answer as GET /properties: the same Property objects (camelCase, with
// images, videos, location...), every one with isFavorite = true.
//   GET /favorites                  -> all of them: { properties: [...] }
//   GET /favorites?page=2&limit=20  -> one page: { properties, pagination }
// Newest saved first.
favorites.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");

  const paging = readPaging(c.req.query());
  if (paging && "error" in paging) {
    return c.json({ error: paging.error }, 400);
  }
  const limit = limitPart(paging);

  const { results } = await c.env.DB.prepare(
    `${PROPERTY_SELECT}
     INNER JOIN favorites f ON f.property_id = p.id
     WHERE f.user_id = ?
     ORDER BY f.created_at DESC, f.id DESC ${limit.sql}`,
  )
    .bind(userId, ...limit.params)
    .all();

  return listResponse(c, results, Number(userId), paging, async () => {
    const counted = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM favorites WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ total: number }>();
    return counted?.total ?? 0;
  });
});

export default favorites;
