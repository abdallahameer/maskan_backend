import { Hono } from "hono";
import type { Context } from "hono";
import { verify } from "hono/jwt";
import { requireAuth } from "../utils/auth";

type Bindings = { DB: D1Database; JWT_SECRET: string; BUCKET: R2Bucket };

// ---------------------------------------------------------------------------
// What the app receives for every property
// ---------------------------------------------------------------------------

export type ListingType = "sale" | "rent";
export type PropertyCategory = "residential" | "commercial";
export type PropertyStatus = "ready" | "underConstruction";
export type FamilyOrSingle = "family" | "single";
export type PaymentFrequency = "monthly" | "yearly" | "daily";

export type PropertyLocation = {
  city: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
};

export type Property = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  price: number;
  area: number;
  listingType: ListingType;
  propertyType: PropertyCategory;
  propertyStatus: PropertyStatus;
  familyOrSingle: FamilyOrSingle;
  paymentType: PaymentFrequency;
  rooms: number;
  bathrooms: number;
  livingRoom: number;
  floorNumber: number;
  propertyAge: number;
  furnished: boolean;
  kitchen: boolean;
  annex: boolean;
  carEntrance: boolean;
  elevator: boolean;
  airConditioners: boolean;
  water: boolean;
  roof: boolean;
  electricity: boolean;
  solarSystem: boolean;
  images: string[];
  videos: string[];
  location: PropertyLocation;
  phone?: string;
  phoneKey?: string;
  whatsapp?: string;
  whatsAppKey?: string;
  originalPrice?: number;
  views: number;
  createdAt: string;
  updatedAt: string;
  isFavorite?: boolean;
  postedAt?: string;
};

// ---------------------------------------------------------------------------
// Limits for files sent together with a new property
// (a Worker has limited memory, so keep videos small)
// ---------------------------------------------------------------------------

const MIN_IMAGES = 1; // every ad needs at least one photo
const MAX_IMAGES = 10; // ...and at most ten (storage is small)
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB per photo
const MAX_VIDEO_BYTES = 40 * 1024 * 1024; // 40 MB for the video
const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB for everything together

const FILE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Treat missing/empty placeholder values as if the filter was not supplied.
// Query parameters arrive as strings, so literal "null" and "undefined" are
// handled here as well as actual undefined values.
function hasFilterValue(value: string | undefined): value is string {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized !== "" && normalized !== "null" && normalized !== "undefined"
  );
}

// Files are stored in R2 under a "key" (like properties/12/photo-1.jpg).
// The app gets a full link that this same server can serve (see /media below).
const OLD_PUBLIC_BASE = "https://files-dev.maskan.app/";

function toPublicUrl(stored: string, origin: string): string {
  let key = stored;
  if (key.startsWith(OLD_PUBLIC_BASE)) {
    key = key.slice(OLD_PUBLIC_BASE.length); // older rows saved the full link
  } else if (/^https?:\/\//.test(key)) {
    return key;
  }
  return `${origin}/properties/media/${key}`;
}

// SQLite gives "YYYY-MM-DD HH:MM:SS" (UTC). Convert it to an ISO string.
function toIso(value: string | null | undefined): string {
  if (!value) return "";
  return value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
}

// A property row plus the names of its city and area (both are optional).
export const PROPERTY_SELECT = `
  SELECT p.*, c.name AS city_name, a.name AS area_name
  FROM properties p
  LEFT JOIN cities c ON c.id = p.city_id
  LEFT JOIN areas a ON a.id = p.area_id
`;

function toProperty(
  row: Record<string, any>,
  images: string[],
  origin: string,
  isFavorite?: boolean,
): Property {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    title: row.title,
    description: row.description,
    price: row.price,
    area: row.area_size ?? 0,
    listingType: row.listing_type,
    propertyType: row.property_type,
    propertyStatus: row.property_status,
    familyOrSingle: row.family_or_single ?? undefined,
    paymentType: row.payment_type ?? undefined,
    rooms: row.rooms,
    bathrooms: row.bathrooms,
    livingRoom: row.living_room,
    floorNumber: row.floor_number,
    propertyAge: row.property_age,
    furnished: !!row.furnished,
    kitchen: !!row.kitchen,
    annex: !!row.annex,
    carEntrance: !!row.car_entrance,
    elevator: !!row.elevator,
    airConditioners: !!row.air_conditioners,
    water: !!row.water,
    roof: !!row.roof,
    electricity: !!row.electricity,
    solarSystem: !!row.solar_system,
    images,
    videos: row.video_url ? [toPublicUrl(row.video_url, origin)] : [],
    location: {
      city: row.city_name ?? "",
      neighborhood: row.area_name ?? "",
      latitude: row.latitude ?? 0,
      longitude: row.longitude ?? 0,
    },
    phone: row.contact_phone ?? undefined,
    phoneKey: row.phone_key ?? undefined,
    whatsapp: row.contact_whatsapp ?? undefined,
    whatsAppKey: row.whatsapp_key ?? undefined,
    views: row.views,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    isFavorite,
  } as Property;
}

// Reads the logged-in user from the token if there is one (no error if not).
async function getOptionalUserId(
  c: Context<{ Bindings: Bindings }>,
): Promise<number | null> {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) return null;

  try {
    const payload = await verify(
      header.replace("Bearer ", ""),
      c.env.JWT_SECRET,
      "HS256",
    );
    return Number(payload.sub);
  } catch {
    return null;
  }
}

// Turns database rows into Property objects, adding each one's images
// (and isFavorite when we know who is asking) with only two extra queries.
async function toProperties(
  c: Context<{ Bindings: Bindings }>,
  rows: Record<string, any>[],
  userId: number | null,
): Promise<Property[]> {
  if (rows.length === 0) return [];

  const db = c.env.DB;
  const origin = new URL(c.req.url).origin;
  // The ids are whole numbers from our own database, so they are written
  // straight into the queries. (D1 allows only 100 bound values per query,
  // which would break lists of more than 100 ads.)
  const idList = rows
    .map((r) => Number(r.id))
    .filter((n) => Number.isInteger(n))
    .join(",");

  const imageRows = await db
    .prepare(
      `SELECT property_id, url FROM property_images
       WHERE property_id IN (${idList})
       ORDER BY position ASC, id ASC`,
    )
    .all<{ property_id: number; url: string }>();

  const imagesByProperty = new Map<number, string[]>();
  for (const img of imageRows.results) {
    const list = imagesByProperty.get(img.property_id) ?? [];
    list.push(toPublicUrl(img.url, origin));
    imagesByProperty.set(img.property_id, list);
  }

  let favoriteIds: Set<number> | null = null;
  if (userId !== null) {
    const favRows = await db
      .prepare(
        `SELECT property_id FROM favorites
         WHERE user_id = ? AND property_id IN (${idList})`,
      )
      .bind(userId)
      .all<{ property_id: number }>();
    favoriteIds = new Set(favRows.results.map((f) => f.property_id));
  }

  return rows.map((row) =>
    toProperty(
      row,
      imagesByProperty.get(row.id) ?? [],
      origin,
      favoriteIds ? favoriteIds.has(row.id) : undefined,
    ),
  );
}

// Returns an error message (Arabic) if the files are not acceptable.
function checkMedia(images: File[], video: File | null): string | null {
  if (images.length < MIN_IMAGES) {
    return "الرجاء إضافة صورة واحدة على الأقل";
  }
  if (images.length > MAX_IMAGES) {
    return `الحد الأقصى ${MAX_IMAGES} صور`;
  }
  let total = 0;
  for (const image of images) {
    if (!image.type.startsWith("image/")) return "أحد الملفات ليس صورة";
    if (image.size > MAX_IMAGE_BYTES) return "حجم إحدى الصور كبير جداً";
    total += image.size;
  }
  if (video) {
    if (!video.type.startsWith("video/")) return "ملف الفيديو غير صالح";
    if (video.size > MAX_VIDEO_BYTES) return "حجم الفيديو كبير جداً";
    total += video.size;
  }
  if (total > MAX_TOTAL_BYTES) return "حجم الملفات كبير جداً";
  return null;
}

// The app sends the city and area NAMES the user picked from the fixed list
// (the cities / areas tables). This finds their ids, and rejects names that
// are not in the list or an area that does not belong to the city.
async function resolveLocation(
  db: D1Database,
  city: unknown,
  neighborhood: unknown,
): Promise<{ cityId: number; areaId: number } | { error: string }> {
  const cityName = typeof city === "string" ? city.trim() : "";
  const areaName = typeof neighborhood === "string" ? neighborhood.trim() : "";

  if (!cityName || !areaName) {
    return { error: "الرجاء اختيار المدينة والمنطقة" };
  }

  const cityRow = await db
    .prepare("SELECT id FROM cities WHERE name = ?")
    .bind(cityName)
    .first<{ id: number }>();
  if (!cityRow) {
    return { error: "المدينة غير موجودة" };
  }

  const areaRow = await db
    .prepare("SELECT id FROM areas WHERE city_id = ? AND name = ?")
    .bind(cityRow.id, areaName)
    .first<{ id: number }>();
  if (!areaRow) {
    return { error: "المنطقة غير موجودة في هذه المدينة" };
  }

  return { cityId: cityRow.id, areaId: areaRow.id };
}

const LISTING_TYPES = ["rent", "sale"];
const PROPERTY_TYPES = ["residential", "commercial"];
const PROPERTY_STATUSES = ["ready", "underConstruction"];
const FAMILY_OR_SINGLE = ["family", "single"];
const PAYMENT_TYPES = ["monthly", "yearly", "daily"];

// Every ad must have these. Returns the names of the fields that are
// missing or not valid (an empty list means the ad is fine).
// (City and neighborhood are checked separately, in resolveLocation.)
function missingFields(body: any): string[] {
  const missing: string[] = [];

  const text = (v: unknown) => typeof v === "string" && v.trim() !== "";
  const positive = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v > 0;
  // country calling code, like "+249" (Sudan) or "+966" (Saudi Arabia)
  const callingCode = (v: unknown) =>
    typeof v === "string" && /^\+[0-9]{1,4}$/.test(v.trim());
  const oneOf = (v: unknown, list: string[]) =>
    typeof v === "string" && list.includes(v);

  if (!text(body.title)) missing.push("title");
  if (!positive(body.price)) missing.push("price");
  if (!positive(body.areaSize)) missing.push("areaSize");
  if (!text(body.description)) missing.push("description");
  if (!text(body.phone)) missing.push("phone");
  if (!callingCode(body.phoneKey)) missing.push("phoneKey");
  if (!text(body.whatsapp)) missing.push("whatsapp");
  if (!callingCode(body.whatsAppKey)) missing.push("whatsAppKey");

  if (!oneOf(body.listingType, LISTING_TYPES)) missing.push("listingType");
  if (!oneOf(body.propertyType, PROPERTY_TYPES)) missing.push("propertyType");
  if (!oneOf(body.propertyStatus, PROPERTY_STATUSES)) {
    missing.push("propertyStatus");
  }

  // optional, but if it is sent it must be one of the allowed words
  if (
    body.familyOrSingle != null &&
    !oneOf(body.familyOrSingle, FAMILY_OR_SINGLE)
  ) {
    missing.push("familyOrSingle");
  }
  if (body.paymentType != null && !oneOf(body.paymentType, PAYMENT_TYPES)) {
    missing.push("paymentType");
  }

  return missing;
}

// ---------------------------------------------------------------------------
// Lists: all in one response, or page by page (the app chooses)
//   GET /properties                    -> every matching ad in one response
//   GET /properties?page=2&limit=20    -> only that page, plus "pagination"
// Sending page or limit (or both) turns paging on.
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_SIZE = 20; // used when only ?page= is sent
const MAX_PAGE_SIZE = 100; // the biggest page that can be asked for
const MAX_UNPAGED = 1000; // safety limit for the "everything" mode

type Paging = { page: number; limit: number; offset: number };

// Returns null when paging is not asked for. A limit above MAX_PAGE_SIZE is
// lowered to it; a page or limit that is not a whole number of 1+ is an error.
export function readPaging(
  query: Record<string, string>,
): Paging | { error: string } | null {
  if ((query.page ?? "") === "" && (query.limit ?? "") === "") return null;

  const toInt = (value: string | undefined, fallback: number) => {
    if (value === undefined || value === "") return fallback;
    return /^[0-9]+$/.test(value) ? Number(value) : NaN;
  };

  const page = toInt(query.page, 1);
  const limit = toInt(query.limit, DEFAULT_PAGE_SIZE);

  if (!Number.isSafeInteger(page) || page < 1) {
    return { error: "رقم الصفحة غير صالح" };
  }
  if (!Number.isSafeInteger(limit) || limit < 1) {
    return { error: "عدد العناصر في الصفحة غير صالح" };
  }

  const size = Math.min(limit, MAX_PAGE_SIZE);
  return { page, limit: size, offset: (page - 1) * size };
}

// The LIMIT part of the query. Without paging we ask for one ad more than the
// safety limit, only to find out whether there were more.
export function limitPart(paging: Paging | null) {
  return paging
    ? { sql: "LIMIT ? OFFSET ?", params: [paging.limit, paging.offset] }
    : { sql: "LIMIT ?", params: [MAX_UNPAGED + 1] };
}

// What the app gets next to the list when it asked for pages
function pageInfo(page: number, limit: number, total: number) {
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasMore: page < totalPages };
}

// Builds the answer of a list endpoint, with or without paging
export async function listResponse(
  c: Context<{ Bindings: Bindings }>,
  rows: Record<string, any>[],
  userId: number | null,
  paging: Paging | null,
  countTotal: () => Promise<number>,
) {
  if (paging) {
    const list = await toProperties(c, rows, userId);
    const total = await countTotal();
    return c.json({
      properties: list,
      pagination: pageInfo(paging.page, paging.limit, total),
    });
  }

  const truncated = rows.length > MAX_UNPAGED;
  const list = await toProperties(
    c,
    truncated ? rows.slice(0, MAX_UNPAGED) : rows,
    userId,
  );
  // "truncated" only appears when there were more ads than the safety limit
  return c.json(
    truncated ? { properties: list, truncated: true } : { properties: list },
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const properties = new Hono<{ Bindings: Bindings }>();

// Serves photos and videos stored in R2 (supports "Range" so videos can play
// and seek). Anyone can view them, just like the ads themselves.
properties.get("/media/*", async (c) => {
  const marker = "/media/";
  const path = c.req.path;
  const key = decodeURIComponent(
    path.slice(path.indexOf(marker) + marker.length),
  );

  if (!key.startsWith("properties/") || key.includes("..")) {
    return c.json({ error: "الملف غير موجود" }, 404);
  }

  const rangeHeader = c.req.header("Range");
  const object = await c.env.BUCKET.get(
    key,
    rangeHeader ? { range: c.req.raw.headers } : undefined,
  );

  if (!object || !("body" in object)) {
    return c.json({ error: "الملف غير موجود" }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  let status = 200;
  const range: any = object.range;
  if (rangeHeader && range) {
    const length =
      range.suffix !== undefined
        ? Math.min(range.suffix, object.size)
        : (range.length ?? object.size - (range.offset ?? 0));
    const offset =
      range.suffix !== undefined ? object.size - length : (range.offset ?? 0);
    headers.set(
      "Content-Range",
      `bytes ${offset}-${offset + length - 1}/${object.size}`,
    );
    headers.set("Content-Length", String(length));
    status = 206;
  } else {
    headers.set("Content-Length", String(object.size));
  }

  return new Response(object.body, { status, headers });
});

// Create a property. Send multipart/form-data with:
//  - "data": the fields as JSON text
//  - "images": 1 to 10 photo files
//  - "video": one video file, at most 40 MB, any length (optional)
// (A plain JSON request is refused, because it cannot carry any photo.)
properties.post("/", requireAuth, async (c) => {
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

// Add one more photo to an existing property
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

// Add (or replace) the video of an existing property
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
  if (!contentType.startsWith("video/")) {
    return c.json({ error: "ملف الفيديو غير صالح" }, 400);
  }
  if (Number(c.req.header("Content-Length") || 0) > MAX_VIDEO_BYTES) {
    return c.json({ error: "حجم الفيديو كبير جداً" }, 400);
  }

  const data = await c.req.arrayBuffer();
  if (data.byteLength === 0) {
    return c.json({ error: "ملف الفيديو غير صالح" }, 400);
  }
  if (data.byteLength > MAX_VIDEO_BYTES) {
    return c.json({ error: "حجم الفيديو كبير جداً" }, 400);
  }

  const ext = FILE_EXTENSIONS[contentType] ?? "mp4";
  const key = `properties/${id}/video-${Date.now()}.${ext}`;

  await c.env.BUCKET.put(key, data, {
    httpMetadata: { contentType },
  });

  await c.env.DB.prepare("UPDATE properties SET video_url = ? WHERE id = ?")
    .bind(key, id)
    .run();

  const publicUrl = toPublicUrl(key, new URL(c.req.url).origin);
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

properties.get("/", async (c) => {
  const q = c.req.query();

  const paging = readPaging(q);
  if (paging && "error" in paging) {
    return c.json({ error: paging.error }, 400);
  }

  const conditions: string[] = [];
  const params: any[] = [];

  if (hasFilterValue(q.listingType)) {
    conditions.push("p.listing_type = ?");
    params.push(q.listingType);
  }
  if (hasFilterValue(q.propertyType)) {
    conditions.push("p.property_type = ?");
    params.push(q.propertyType);
  }
  if (
    hasFilterValue(q.propertyStatus) &&
    q.propertyStatus.toLowerCase() !== "all"
  ) {
    conditions.push("p.property_status = ?");
    params.push(q.propertyStatus);
  }
  if (hasFilterValue(q.familyOrSingle)) {
    conditions.push("p.family_or_single = ?");
    params.push(q.familyOrSingle);
  }
  if (hasFilterValue(q.paymentType)) {
    conditions.push("p.payment_type = ?");
    params.push(q.paymentType);
  }
  if (
    hasFilterValue(q.furnished) &&
    (q.furnished === "true" || q.furnished === "false")
  ) {
    conditions.push("p.furnished = ?");
    params.push(q.furnished === "true" ? 1 : 0);
  }
  if (hasFilterValue(q.rooms)) {
    conditions.push("p.rooms = ?");
    params.push(Number(q.rooms));
  }
  if (hasFilterValue(q.bathrooms)) {
    conditions.push("p.bathrooms = ?");
    params.push(Number(q.bathrooms));
  }
  if (hasFilterValue(q.minPrice)) {
    conditions.push("p.price >= ?");
    params.push(Number(q.minPrice));
  }
  if (hasFilterValue(q.maxPrice)) {
    conditions.push("p.price <= ?");
    params.push(Number(q.maxPrice));
  }
  if (hasFilterValue(q.minArea)) {
    conditions.push("p.area_size >= ?");
    params.push(Number(q.minArea));
  }
  if (hasFilterValue(q.maxArea)) {
    conditions.push("p.area_size <= ?");
    params.push(Number(q.maxArea));
  }
  if (hasFilterValue(q.city)) {
    conditions.push("c.name = ?");
    params.push(q.city);
  }
  if (hasFilterValue(q.neighborhood)) {
    conditions.push("a.name = ?");
    params.push(q.neighborhood);
  }
  // ?hasLocation=true -> only ads that have both a latitude and a longitude
  if (q.hasLocation === "true") {
    conditions.push("(p.latitude IS NOT NULL AND p.longitude IS NOT NULL)");
  }
  if (hasFilterValue(q.cityId)) {
    conditions.push("p.city_id = ?");
    params.push(Number(q.cityId));
  }
  if (hasFilterValue(q.areaId)) {
    conditions.push("p.area_id = ?");
    params.push(Number(q.areaId));
  }
  if (hasFilterValue(q.search)) {
    conditions.push(`(
      p.title LIKE ? OR
      p.description LIKE ? OR
      c.name LIKE ? OR
      a.name LIKE ?
    )`);
    const term = `%${q.search}%`;
    params.push(term, term, term, term);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const lat = c.req.query("lat");
  const lng = c.req.query("lng");

  let orderBy = "ORDER BY p.created_at DESC, p.id DESC";
  let selectExtra = "";
  const selectParams: any[] = [];

  if (lat && lng) {
    selectExtra = `, (
      ((p.latitude - ?) * (p.latitude - ?)) +
      ((p.longitude - ?) * (p.longitude - ?))
    ) AS distance_sq`;
    selectParams.push(Number(lat), Number(lat), Number(lng), Number(lng));
    orderBy = "ORDER BY p.latitude IS NULL, distance_sq ASC, p.id DESC";
  }

  // The distance placeholders sit in the SELECT part, so they are bound first.
  const finalParams = [...selectParams, ...params];

  const limit = limitPart(paging);

  const { results } = await c.env.DB.prepare(
    `SELECT p.*, c.name AS city_name, a.name AS area_name ${selectExtra}
     FROM properties p
     LEFT JOIN cities c ON c.id = p.city_id
     LEFT JOIN areas a ON a.id = p.area_id
     ${where} ${orderBy} ${limit.sql}`,
  )
    .bind(...finalParams, ...limit.params)
    .all();

  const userId = await getOptionalUserId(c);

  return listResponse(c, results, userId, paging, async () => {
    // How many ads match in total (same filters, no paging)
    const counted = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total
       FROM properties p
       LEFT JOIN cities c ON c.id = p.city_id
       LEFT JOIN areas a ON a.id = p.area_id
       ${where}`,
    )
      .bind(...params)
      .first<{ total: number }>();
    return counted?.total ?? 0;
  });
});

properties.get("/:id", async (c) => {
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

  const paging = readPaging(c.req.query());
  if (paging && "error" in paging) {
    return c.json({ error: paging.error }, 400);
  }
  const limit = limitPart(paging);

  const { results } = await c.env.DB.prepare(
    `${PROPERTY_SELECT} WHERE p.owner_id = ?
     ORDER BY p.created_at DESC, p.id DESC ${limit.sql}`,
  )
    .bind(userId, ...limit.params)
    .all();

  return listResponse(c, results, Number(userId), paging, async () => {
    const counted = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM properties WHERE owner_id = ?",
    )
      .bind(userId)
      .first<{ total: number }>();
    return counted?.total ?? 0;
  });
});

export default properties;
