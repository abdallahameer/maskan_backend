import { Hono } from "hono";
import { requireAuth } from "../../utils/auth";
import type { Bindings } from "../../types";
import {
  FILE_EXTENSIONS,
  MAX_TOTAL_BYTES,
} from "../../utils/property/constants";
import {
  checkMedia,
  missingFields,
  resolveLocation,
} from "../../utils/property/validation";

const create = new Hono<{ Bindings: Bindings }>();

// Create a property. Send multipart/form-data with:
//  - "data": the fields as JSON text
//  - "images": 1 to 10 photo files
//  - "video": one video file, at most 40 MB, any length (optional)
// (A plain JSON request is refused, because it cannot carry any photo.)
create.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const contentType = c.req.header("Content-Type") || "";

  let body: any;
  let imageFiles: File[] = [];
  let videoFile: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const declaredSize = Number(c.req.header("Content-Length") || 0);
    if (declaredSize > MAX_TOTAL_BYTES + 1024 * 1024) {
      return c.json({ error: "حجم الملفات كبير جداً" }, 413);
    }

    const form = await c.req.formData();

    const raw = form.get("data");
    if (typeof raw !== "string") {
      return c.json({ error: "بيانات الإعلان مفقودة" }, 400);
    }
    try {
      body = JSON.parse(raw);
    } catch {
      return c.json({ error: "بيانات الإعلان غير صالحة" }, 400);
    }

    imageFiles = form
      .getAll("images")
      .filter((f): f is File => typeof f !== "string");

    const videos = form
      .getAll("video")
      .filter((f): f is File => typeof f !== "string");
    if (videos.length > 1) {
      return c.json({ error: "يمكن إرفاق فيديو واحد فقط" }, 400);
    }
    videoFile = videos[0] ?? null;
  } else {
    body = await c.req.json();
  }

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

  const mediaError = checkMedia(imageFiles, videoFile);
  if (mediaError) {
    return c.json({ error: mediaError }, 400);
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO properties (
      owner_id, title, description, price, listing_type, property_type,
      property_status, family_or_single, payment_type, rooms, bathrooms,
      living_room, floor_number, property_age, area_size, furnished, kitchen,
      annex, car_entrance, elevator, air_conditioners, water, roof,
      electricity, solar_system, city_id, area_id,
      latitude, longitude, contact_phone, phone_key,
      contact_whatsapp, whatsapp_key
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
      areaId,
      latitude ?? null,
      longitude ?? null,
      phone.trim(),
      phoneKey.trim(),
      whatsapp.trim(),
      whatsAppKey.trim(),
    )
    .run();

  const newPropertyId = result.meta.last_row_id;

  // Save the photos and the video. If anything fails we undo everything,
  // so the user never ends up with a half-published ad.
  const uploadedKeys: string[] = [];
  try {
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const ext = FILE_EXTENSIONS[file.type] ?? "jpg";
      const key = `properties/${newPropertyId}/photo-${Date.now()}-${i}.${ext}`;

      await c.env.BUCKET.put(key, file, {
        httpMetadata: { contentType: file.type },
      });
      uploadedKeys.push(key);

      await c.env.DB.prepare(
        "INSERT INTO property_images (property_id, url, position) VALUES (?, ?, ?)",
      )
        .bind(newPropertyId, key, i)
        .run();
    }

    if (videoFile) {
      const ext = FILE_EXTENSIONS[videoFile.type] ?? "mp4";
      const key = `properties/${newPropertyId}/video-${Date.now()}.${ext}`;

      await c.env.BUCKET.put(key, videoFile, {
        httpMetadata: { contentType: videoFile.type },
      });
      uploadedKeys.push(key);

      await c.env.DB.prepare("UPDATE properties SET video_url = ? WHERE id = ?")
        .bind(key, newPropertyId)
        .run();
    }
  } catch (err) {
    console.log("Media upload failed:", err);
    for (const key of uploadedKeys) {
      await c.env.BUCKET.delete(key).catch(() => {});
    }
    await c.env.DB.prepare("DELETE FROM property_images WHERE property_id = ?")
      .bind(newPropertyId)
      .run();
    await c.env.DB.prepare("DELETE FROM properties WHERE id = ?")
      .bind(newPropertyId)
      .run();
    return c.json({ error: "فشل رفع الملفات، لم يتم نشر الإعلان" }, 500);
  }

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
      cityId ?? null,
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

export default create;
