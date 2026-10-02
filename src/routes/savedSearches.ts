import { Hono } from "hono";
import { requireAuth } from "../utils/auth";

type Bindings = { DB: D1Database; JWT_SECRET: string };

const savedSearches = new Hono<{ Bindings: Bindings }>();

savedSearches.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const {
    listingType,
    propertyType,
    familyOrSingle,
    cityId,
    areaId,
    minPrice,
    maxPrice,
  } = body;

  const result = await c.env.DB.prepare(
    `INSERT INTO saved_searches
      (user_id, listing_type, property_type, family_or_single, city_id, area_id, min_price, max_price)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      userId,
      listingType ?? null,
      propertyType ?? null,
      familyOrSingle ?? null,
      cityId ?? null,
      areaId ?? null,
      minPrice ?? null,
      maxPrice ?? null,
    )
    .run();

  return c.json({ id: result.meta.last_row_id }, 201);
});

savedSearches.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC",
  )
    .bind(userId)
    .all();

  return c.json({ savedSearches: results });
});

savedSearches.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  await c.env.DB.prepare(
    "DELETE FROM saved_searches WHERE id = ? AND user_id = ?",
  )
    .bind(id, userId)
    .run();

  return c.json({ success: true });
});

export default savedSearches;
