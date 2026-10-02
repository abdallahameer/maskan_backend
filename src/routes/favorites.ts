import { Hono } from "hono";
import { requireAuth } from "../utils/auth";

type Bindings = { DB: D1Database; JWT_SECRET: string };

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

// List my saved properties
favorites.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");

  const { results } = await c.env.DB.prepare(
    `SELECT p.* FROM properties p
     INNER JOIN favorites f ON f.property_id = p.id
     WHERE f.user_id = ?
     ORDER BY f.created_at DESC`,
  )
    .bind(userId)
    .all();

  return c.json({ properties: results });
});

export default favorites;
