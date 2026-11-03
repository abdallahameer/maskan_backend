import { Hono } from "hono";
import { requireAuth } from "../../utils/auth";
import type { Bindings } from "../../types";
import { missingFields, resolveLocation } from "../../utils/property/validation";

const update = new Hono<{ Bindings: Bindings }>();

update.put("/:id", requireAuth, async (c) => {
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
    city,
    neighborhood,
    latitude,
    longitude,
    phone,
    phoneKey,
    whatsapp,
    whatsAppKey,
  } = body;

  const missing = missingFields(body);
  if (missing.length > 0) {
    return c.json({ error: "الرجاء تعبئة الحقول المطلوبة", missing }, 400);
  }

  const location = await resolveLocation(c.env.DB, city, neighborhood);
  if ("error" in location) {
    return c.json({ error: location.error }, 400);
  }
  const { cityId, areaId } = location;

  await c.env.DB.prepare(
    `UPDATE properties SET
      title = ?, description = ?, price = ?, listing_type = ?, property_type = ?,
      property_status = ?, family_or_single = ?, payment_type = ?, rooms = ?,
      bathrooms = ?, living_room = ?, floor_number = ?, property_age = ?,
      area_size = ?, furnished = ?, kitchen = ?, annex = ?, car_entrance = ?,
      elevator = ?, air_conditioners = ?, water = ?, roof = ?, electricity = ?,
      solar_system = ?, city_id = ?, area_id = ?,
      latitude = ?, longitude = ?, contact_phone = ?, phone_key = ?,
      contact_whatsapp = ?, whatsapp_key = ?,
      updated_at = datetime('now')
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
      areaId,
      latitude ?? null,
      longitude ?? null,
      phone.trim(),
      phoneKey.trim(),
      whatsapp.trim(),
      whatsAppKey.trim(),
      id,
    )
    .run();

  return c.json({ success: true });
});

export default update;
