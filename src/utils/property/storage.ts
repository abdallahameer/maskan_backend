import { OLD_PUBLIC_BASE } from "./mapper";
// What is saved in the database for a file is its R2 "key"
// (like properties/12/photo-1700000000000-0.jpg). Older rows may hold the
// full old link instead. Returns the key, or null when it is not one of our

// files (so we never try to delete something that is not ours).
export function toStorageKey(stored: string): string | null {
  let key = stored;
  if (key.startsWith(OLD_PUBLIC_BASE)) {
    key = key.slice(OLD_PUBLIC_BASE.length);
  } else if (/^https?:\/\//.test(key)) {
    return null;
  }
  return key.startsWith("properties/") ? key : null;
}

// Deletes files from R2. A failure here is only logged: by the time we get
// here the database is already updated, and a leftover file is harmless.
export async function deleteStoredFiles(
  bucket: R2Bucket,
  stored: (string | null | undefined)[],
): Promise<void> {
  const keys = stored
    .filter((value): value is string => !!value)
    .map(toStorageKey)
    .filter((key): key is string => key !== null);

  if (keys.length === 0) return;

  try {
    await bucket.delete(keys);
  } catch (err) {
    console.log("R2 delete failed:", err);
  }
}
