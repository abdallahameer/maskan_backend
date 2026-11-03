import type { Context } from "hono";
import type { Bindings, Property } from "../../types";

// Files are stored in R2 under a "key" (like properties/12/photo-1.jpg).
// The app gets a full link that this same server can serve (see /media below).
const OLD_PUBLIC_BASE = "https://files-dev.maskan.app/";

export function toPublicUrl(stored: string, origin: string): string {
  let key = stored;
  if (key.startsWith(OLD_PUBLIC_BASE)) {
    key = key.slice(OLD_PUBLIC_BASE.length); // older rows saved the full link
  } else if (/^https?:\/\//.test(key)) {
    return key;
  }
  return `${origin}/properties/media/${key}`;
}

// SQLite gives "YYYY-MM-DD HH:MM:SS" (UTC). Convert it to an ISO string.
export function toIso(value: string | null | undefined): string {
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

export function toProperty(
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

// Turns database rows into Property objects, adding each one's images
// (and isFavorite when we know who is asking) with only two extra queries.
export async function toProperties(
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
