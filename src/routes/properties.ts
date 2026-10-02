import { Hono } from "hono";
import { requireAuth } from "../utils/auth";

type Bindings = { DB: D1Database; JWT_SECRET: string; BUCKET: R2Bucket };

const properties = new Hono<{ Bindings: Bindings }>();

properties.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const {
    title,
    description,
    price,
    listingType,
    propertyType,
    propertyStatus,
    familyOrSingle,
    paymentType,
    rooms,
    bathrooms,
    livingRoom,
    floorNumber,
    propertyAge,
    areaSize,
    furnished,
    kitchen,
    annex,
    carEntrance,
    elevator,
    airConditioners,
    water,
    roof,
    electricity,
    solarSystem,
    cityId,
    areaId,
    addressDetail,
    latitude,
    longitude,
  } = body;

  if (
    !title ||
    !description ||
    !price ||
    !listingType ||
    !propertyType ||
    !propertyStatus ||
    !cityId
  ) {
    return c.json({ error: "الرجاء تعبئة الحقول المطلوبة" }, 400);
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO properties (
      owner_id, title, description, price, listing_type, property_type,
      property_status, family_or_single, payment_type, rooms, bathrooms,
      living_room, floor_number, property_age, area_size, furnished, kitchen,
      annex, car_entrance, elevator, air_conditioners, water, roof,
      electricity, solar_system, city_id, area_id, address_detail,
      latitude, longitude
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      userId,
      title,
      description,
      price,
      listingType,
      propertyType,
      propertyStatus,
      familyOrSingle ?? null,
      paymentType ?? null,
      rooms ?? 0,
      bathrooms ?? 0,
      livingRoom ?? 0,
      floorNumber ?? 0,
      propertyAge ?? 0,
      areaSize ?? null,
      furnished ? 1 : 0,
      kitchen ? 1 : 0,
      annex ? 1 : 0,
      carEntrance ? 1 : 0,
      elevator ? 1 : 0,
      airConditioners ? 1 : 0,
      water ? 1 : 0,
      roof ? 1 : 0,
      electricity ? 1 : 0,
      solarSystem ? 1 : 0,
      cityId,
      areaId ?? null,
      addressDetail ?? null,
      latitude ?? null,
      longitude ?? null,
    )
    .run();

  const newPropertyId = result.meta.last_row_id;

  const matches = await c.env.DB.prepare(
    `SELECT DISTINCT user_id FROM saved_searches
     WHERE (listing_type IS NULL OR listing_type = ?)
       AND (property_type IS NULL OR property_type = ?)
       AND (family_or_single IS NULL OR family_or_single = ?)
       AND (city_id IS NULL OR city_id = ?)
       AND (area_id IS NULL OR area_id = ?)
       AND (min_price IS NULL OR min_price <= ?)
       AND (max_price IS NULL OR max_price >= ?)
       AND user_id != ?`,
  )
    .bind(
      listingType,
      propertyType,
      familyOrSingle ?? null,
      cityId,
      areaId ?? null,
      price,
      price,
      userId,
    )
    .all();

  for (const row of matches.results as { user_id: number }[]) {
    await c.env.DB.prepare(
      "INSERT INTO notifications (user_id, property_id) VALUES (?, ?)",
    )
      .bind(row.user_id, newPropertyId)
      .run();
  }

  return c.json({ id: newPropertyId }, 201);
});

properties.post("/:id/photos", requireAuth, async (c) => {
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

  const contentType = c.req.header("Content-Type") || "image/jpeg";
  const key = `properties/${id}/photo-${Date.now()}.jpg`;

  await c.env.BUCKET.put(key, c.req.raw.body, {
    httpMetadata: { contentType },
  });

  const publicUrl = `https://files-dev.maskan.app/${key}`;

  const result = await c.env.DB.prepare(
    "INSERT INTO property_images (property_id, url, position) VALUES (?, ?, 0)",
  )
    .bind(id, publicUrl)
    .run();

  return c.json({ id: result.meta.last_row_id, url: publicUrl }, 201);
});

properties.post("/:id/video", requireAuth, async (c) => {
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

  const contentType = c.req.header("Content-Type") || "video/mp4";
  const key = `properties/${id}/video-${Date.now()}.mp4`;

  await c.env.BUCKET.put(key, c.req.raw.body, {
    httpMetadata: { contentType },
  });

  const publicUrl = `https://files-dev.maskan.app/${key}`;

  await c.env.DB.prepare("UPDATE properties SET video_url = ? WHERE id = ?")
    .bind(publicUrl, id)
    .run();

  return c.json({ url: publicUrl }, 201);
});

properties.delete("/:id/video", requireAuth, async (c) => {
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

  await c.env.DB.prepare("UPDATE properties SET video_url = NULL WHERE id = ?")
    .bind(id)
    .run();

  return c.json({ success: true });
});

properties.delete("/:id/photos/:photoId", requireAuth, async (c) => {
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

  await c.env.DB.prepare(
    "DELETE FROM property_images WHERE id = ? AND property_id = ?",
  )
    .bind(photoId, id)
    .run();

  return c.json({ success: true });
});

properties.get("/", async (c) => {
  const q = c.req.query();

  const conditions: string[] = [];
  const params: any[] = [];

  if (q.listingType) {
    conditions.push("listing_type = ?");
    params.push(q.listingType);
  }
  if (q.propertyType) {
    conditions.push("property_type = ?");
    params.push(q.propertyType);
  }
  if (q.propertyStatus) {
    conditions.push("property_status = ?");
    params.push(q.propertyStatus);
  }
  if (q.familyOrSingle) {
    conditions.push("family_or_single = ?");
    params.push(q.familyOrSingle);
  }
  if (q.paymentType) {
    conditions.push("payment_type = ?");
    params.push(q.paymentType);
  }
  if (q.furnished === "true" || q.furnished === "false") {
    conditions.push("furnished = ?");
    params.push(q.furnished === "true" ? 1 : 0);
  }
  if (q.rooms) {
    conditions.push("rooms = ?");
    params.push(Number(q.rooms));
  }
  if (q.bathrooms) {
    conditions.push("bathrooms = ?");
    params.push(Number(q.bathrooms));
  }
  if (q.minPrice) {
    conditions.push("price >= ?");
    params.push(Number(q.minPrice));
  }
  if (q.maxPrice) {
    conditions.push("price <= ?");
    params.push(Number(q.maxPrice));
  }
  if (q.minArea) {
    conditions.push("area_size >= ?");
    params.push(Number(q.minArea));
  }
  if (q.maxArea) {
    conditions.push("area_size <= ?");
    params.push(Number(q.maxArea));
  }
  if (q.cityId) {
    conditions.push("city_id = ?");
    params.push(Number(q.cityId));
  }
  if (q.areaId) {
    conditions.push("area_id = ?");
    params.push(Number(q.areaId));
  }
  if (q.search) {
    conditions.push(`(
      title LIKE ? OR
      description LIKE ? OR
      address_detail LIKE ? OR
      city_id IN (SELECT id FROM cities WHERE name LIKE ?) OR
      area_id IN (SELECT id FROM areas WHERE name LIKE ?)
    )`);
    const term = `%${q.search}%`;
    params.push(term, term, term, term, term);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const lat = c.req.query("lat");
  const lng = c.req.query("lng");

  let orderBy = "ORDER BY created_at DESC";
  let selectExtra = "";
  const finalParams = [...params];

  if (lat && lng) {
    selectExtra = `, (
      ((latitude - ?) * (latitude - ?)) +
      ((longitude - ?) * (longitude - ?))
    ) AS distance_sq`;
    finalParams.push(Number(lat), Number(lat), Number(lng), Number(lng));
    orderBy = "ORDER BY latitude IS NULL, distance_sq ASC";
  }

  const { results } = await c.env.DB.prepare(
    `SELECT * ${selectExtra} FROM properties ${where} ${orderBy} LIMIT 50`,
  )
    .bind(...finalParams)
    .all();

  return c.json({ properties: results });
});

properties.get("/:id", async (c) => {
  const id = c.req.param("id");

  const property = await c.env.DB.prepare(
    "SELECT * FROM properties WHERE id = ?",
  )
    .bind(id)
    .first();

  if (!property) {
    return c.json({ error: "العقار غير موجود" }, 404);
  }

  await c.env.DB.prepare("UPDATE properties SET views = views + 1 WHERE id = ?")
    .bind(id)
    .run();

  return c.json({ property });
});

properties.put("/:id", requireAuth, async (c) => {
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
    return c.json({ error: "غير مصرح لك بتعديل هذا الإعلان" }, 403);
  }

  const body = await c.req.json();
  const {
    title,
    description,
    price,
    listingType,
    propertyType,
    propertyStatus,
    familyOrSingle,
    paymentType,
    rooms,
    bathrooms,
    livingRoom,
    floorNumber,
    propertyAge,
    areaSize,
    furnished,
    kitchen,
    annex,
    carEntrance,
    elevator,
    airConditioners,
    water,
    roof,
    electricity,
    solarSystem,
    cityId,
    areaId,
    addressDetail,
    latitude,
    longitude,
  } = body;

  await c.env.DB.prepare(
    `UPDATE properties SET
      title = ?, description = ?, price = ?, listing_type = ?, property_type = ?,
      property_status = ?, family_or_single = ?, payment_type = ?, rooms = ?,
      bathrooms = ?, living_room = ?, floor_number = ?, property_age = ?,
      area_size = ?, furnished = ?, kitchen = ?, annex = ?, car_entrance = ?,
      elevator = ?, air_conditioners = ?, water = ?, roof = ?, electricity = ?,
      solar_system = ?, city_id = ?, area_id = ?, address_detail = ?,
      latitude = ?, longitude = ?, updated_at = datetime('now')
    WHERE id = ?`,
  )
    .bind(
      title,
      description,
      price,
      listingType,
      propertyType,
      propertyStatus,
      familyOrSingle ?? null,
      paymentType ?? null,
      rooms ?? 0,
      bathrooms ?? 0,
      livingRoom ?? 0,
      floorNumber ?? 0,
      propertyAge ?? 0,
      areaSize ?? null,
      furnished ? 1 : 0,
      kitchen ? 1 : 0,
      annex ? 1 : 0,
      carEntrance ? 1 : 0,
      elevator ? 1 : 0,
      airConditioners ? 1 : 0,
      water ? 1 : 0,
      roof ? 1 : 0,
      electricity ? 1 : 0,
      solarSystem ? 1 : 0,
      cityId,
      areaId ?? null,
      addressDetail ?? null,
      latitude ?? null,
      longitude ?? null,
      id,
    )
    .run();

  return c.json({ success: true });
});

properties.delete("/:id", requireAuth, async (c) => {
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

properties.get("/mine/list", requireAuth, async (c) => {
  const userId = c.get("userId");

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM properties WHERE owner_id = ? ORDER BY created_at DESC",
  )
    .bind(userId)
    .all();

  return c.json({ properties: results });
});

export default properties;
