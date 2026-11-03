// Limits for files sent together with a new property
// (a Worker has limited memory, so keep videos small)
export const MIN_IMAGES = 1; // every ad needs at least one photo
export const MAX_IMAGES = 10; // ...and at most ten (storage is small)
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB per photo
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024; // 40 MB for the video
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB for everything together

export const FILE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

export const LISTING_TYPES = ["rent", "sale"];
export const PROPERTY_TYPES = ["residential", "commercial"];
export const PROPERTY_STATUSES = ["ready", "underConstruction"];
export const FAMILY_OR_SINGLE = ["family", "single"];
export const PAYMENT_TYPES = ["monthly", "yearly", "daily"];
