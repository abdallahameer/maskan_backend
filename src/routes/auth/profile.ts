import { Hono } from "hono";
import { hashPassword } from "../../utils/password";
import { requireAuth } from "../../utils/auth";
import type { Bindings } from "./types";
import { deleteStoredFiles } from "../../utils/property/storage";

const profile = new Hono<{ Bindings: Bindings }>();

// Who am I
profile.get("/me", requireAuth, async (c) => {
  const userId = c.get("userId");

  const user = await c.env.DB.prepare(
    "SELECT id, name, email, avatar_url, created_at FROM users WHERE id = ?",
  )
    .bind(userId)
    .first();

  if (!user) {
    return c.json({ error: "المستخدم غير موجود" }, 404);
  }

  return c.json({ user });
});

// Edit profile
profile.put("/me", requireAuth, async (c) => {
  const userId = c.get("userId");
  const { name, password } = await c.req.json();

  if (password) {
    if (password.length < 8) {
      return c.json({ error: "كلمة المرور يجب ألا تقل عن 8 أحرف" }, 400);
    }
    const passwordHash = await hashPassword(password);
    await c.env.DB.prepare(
      "UPDATE users SET name = ?, password_hash = ? WHERE id = ?",
    )
      .bind(name, passwordHash, userId)
      .run();
  } else {
    await c.env.DB.prepare("UPDATE users SET name = ? WHERE id = ?")
      .bind(name, userId)
      .run();
  }

  return c.json({ success: true });
});

// Delete account
profile.delete("/me", requireAuth, async (c) => {
  const userId = c.get("userId");

  const { results: ownedProperties } = await c.env.DB.prepare(
    "SELECT id, video_url FROM properties WHERE owner_id = ?",
  )
    .bind(userId)
    .all<{ id: number; video_url: string | null }>();

  // Everything that points to the user's ads is deleted first, then the ads,
  // then the user's own rows, all in one batch (all of it or none of it).
  // The ids come from our own database, so they are written into the SQL
  // (D1 allows only 100 bound values per query, and one request may run only
  // a limited number of queries, so we do not loop over the ads).
  const statements: D1PreparedStatement[] = [];
  let imageUrls: string[] = [];

  if (ownedProperties.length > 0) {
    const idList = ownedProperties
      .map((property) => Number(property.id))
      .filter((n) => Number.isInteger(n))
      .join(",");

    const images = await c.env.DB.prepare(
      `SELECT url FROM property_images WHERE property_id IN (${idList})`,
    ).all<{ url: string }>();
    imageUrls = images.results.map((row) => row.url);

    statements.push(
      c.env.DB.prepare(
        `DELETE FROM notifications WHERE property_id IN (${idList})`,
      ),
      c.env.DB.prepare(
        `DELETE FROM favorites WHERE property_id IN (${idList})`,
      ),
      c.env.DB.prepare(
        `DELETE FROM property_images WHERE property_id IN (${idList})`,
      ),
    );
  }

  statements.push(
    c.env.DB.prepare("DELETE FROM properties WHERE owner_id = ?").bind(userId),
    c.env.DB.prepare("DELETE FROM favorites WHERE user_id = ?").bind(userId),
    c.env.DB.prepare("DELETE FROM notifications WHERE user_id = ?").bind(
      userId,
    ),
    c.env.DB.prepare("DELETE FROM saved_searches WHERE user_id = ?").bind(
      userId,
    ),
    c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  );

  await c.env.DB.batch(statements);

  // Only now remove the photos and videos from R2.
  await deleteStoredFiles(c.env.BUCKET, [
    ...imageUrls,
    ...ownedProperties.map((property) => property.video_url),
  ]);

  return c.json({ success: true });
});

export default profile;
