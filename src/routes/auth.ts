import { Hono } from "hono";
import { sign } from "hono/jwt";
import { hashPassword, verifyPassword } from "../utils/password";
import { requireAuth } from "../utils/auth";

type Bindings = { DB: D1Database; JWT_SECRET: string };

const auth = new Hono<{ Bindings: Bindings }>();

auth.post("/signup", async (c) => {
  const body = await c.req.json();
  const { name, phone, whatsapp, password } = body;

  if (!name || !phone || !whatsapp || !password) {
    return c.json({ error: "الرجاء تعبئة جميع الحقول" }, 400);
  }
  if (password.length < 8) {
    return c.json({ error: "كلمة المرور يجب ألا تقل عن 8 أحرف" }, 400);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE phone = ?",
  )
    .bind(phone)
    .first();

  if (existing) {
    return c.json({ error: "رقم الهاتف مستخدم بالفعل" }, 409);
  }

  const passwordHash = await hashPassword(password);

  const result = await c.env.DB.prepare(
    `INSERT INTO users (name, phone, whatsapp, password_hash)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(name, phone, whatsapp, passwordHash)
    .run();

  const userId = result.meta.last_row_id;

  const token = await sign(
    {
      sub: userId,
      phone,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    },
    c.env.JWT_SECRET,
  );

  return c.json({ token, user: { id: userId, name, phone, whatsapp } }, 201);
});

auth.post("/login", async (c) => {
  const body = await c.req.json();
  const { phone, password } = body;

  if (!phone || !password) {
    return c.json({ error: "الرجاء إدخال رقم الهاتف وكلمة المرور" }, 400);
  }

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE phone = ?")
    .bind(phone)
    .first<{
      id: number;
      name: string;
      phone: string;
      whatsapp: string;
      password_hash: string;
    }>();

  if (!user) {
    return c.json({ error: "رقم الهاتف أو كلمة المرور غير صحيحة" }, 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return c.json({ error: "رقم الهاتف أو كلمة المرور غير صحيحة" }, 401);
  }

  const token = await sign(
    {
      sub: user.id,
      phone: user.phone,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    },
    c.env.JWT_SECRET,
  );

  return c.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      whatsapp: user.whatsapp,
    },
  });
});

auth.get("/me", requireAuth, async (c) => {
  const userId = c.get("userId");

  const user = await c.env.DB.prepare(
    "SELECT id, name, phone, whatsapp, avatar_url, created_at FROM users WHERE id = ?",
  )
    .bind(userId)
    .first();

  if (!user) {
    return c.json({ error: "المستخدم غير موجود" }, 404);
  }

  return c.json({ user });
});

auth.put("/me", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const { name, whatsapp, password } = body;

  if (password) {
    if (password.length < 8) {
      return c.json({ error: "كلمة المرور يجب ألا تقل عن 8 أحرف" }, 400);
    }
    const passwordHash = await hashPassword(password);
    await c.env.DB.prepare(
      "UPDATE users SET name = ?, whatsapp = ?, password_hash = ? WHERE id = ?",
    )
      .bind(name, whatsapp, passwordHash, userId)
      .run();
  } else {
    await c.env.DB.prepare(
      "UPDATE users SET name = ?, whatsapp = ? WHERE id = ?",
    )
      .bind(name, whatsapp, userId)
      .run();
  }

  return c.json({ success: true });
});

auth.delete("/me", requireAuth, async (c) => {
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

export default auth;
