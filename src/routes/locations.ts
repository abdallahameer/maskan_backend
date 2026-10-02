import { Hono } from "hono";

type Bindings = { DB: D1Database };

const locations = new Hono<{ Bindings: Bindings }>();

locations.get("/cities", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name FROM cities ORDER BY name",
  ).all();
  return c.json({ cities: results });
});

locations.get("/areas", async (c) => {
  const cityId = c.req.query("cityId");

  if (!cityId) {
    return c.json({ error: "cityId مطلوب" }, 400);
  }

  const { results } = await c.env.DB.prepare(
    "SELECT id, name FROM areas WHERE city_id = ? ORDER BY name",
  )
    .bind(cityId)
    .all();

  return c.json({ areas: results });
});

locations.get("/areas/all", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT areas.id, areas.name, cities.name AS city_name
     FROM areas
     JOIN cities ON cities.id = areas.city_id
     ORDER BY areas.name`,
  ).all();

  return c.json({ areas: results });
});

export default locations;
