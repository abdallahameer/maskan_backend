import { Hono } from "hono";
import { hashPassword } from "../../utils/password";
import { requireAuth } from "../../utils/auth";
import type { Bindings } from "./types";

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
    "SELECT id FROM properties WHERE owner_id = ?",
  )
    .bind(userId)
    .all<{ id: number }>();

  for (const property of ownedProperties) {
    await c.env.DB.prepare("DELETE FROM property_images WHERE property_id = ?")
      .bind(property.id)
      .run();
    await c.env.DB.prepare("DELETE FROM favorites WHERE property_id = ?")
      .bind(property.id)
      .run();
    await c.env.DB.prepare("DELETE FROM notifications WHERE property_id = ?")
      .bind(property.id)
      .run();
  }

  await c.env.DB.prepare("DELETE FROM properties WHERE owner_id = ?")
    .bind(userId)
    .run();
  await c.env.DB.prepare("DELETE FROM favorites WHERE user_id = ?")
    .bind(userId)
    .run();
  await c.env.DB.prepare("DELETE FROM notifications WHERE user_id = ?")
    .bind(userId)
    .run();
  await c.env.DB.prepare("DELETE FROM saved_searches WHERE user_id = ?")
    .bind(userId)
    .run();
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();

  return c.json({ success: true });
});

export default profile;
