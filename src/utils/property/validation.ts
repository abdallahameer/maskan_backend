import {
  FAMILY_OR_SINGLE,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  MAX_TOTAL_BYTES,
  MAX_VIDEO_BYTES,
  MIN_IMAGES,
  PAYMENT_TYPES,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  LISTING_TYPES,
} from "./constants";

// Returns an error message (Arabic) if the files are not acceptable.
export function checkMedia(images: File[], video: File | null): string | null {
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
export async function resolveLocation(
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

// Every ad must have these. Returns the names of the fields that are
// missing or not valid (an empty list means the ad is fine).
// (City and neighborhood are checked separately, in resolveLocation.)
export function missingFields(body: any): string[] {
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
