import { Hono } from "hono";
import { sign } from "hono/jwt";
import { hashPassword, verifyPassword } from "../utils/password";
import { requireAuth } from "../utils/auth";
import { sendEmail, generateCode } from "../utils/email";
type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  RESEND_API_KEY: string;
};

const auth = new Hono<{ Bindings: Bindings }>();

function makeToken(userId: number, email: string, secret: string) {
  return sign(
    {
      sub: userId,
      email,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    },
    secret,
  );
}

auth.post("/signup", async (c) => {
  const { name, email, password } = await c.req.json();

  if (!name || !email || !password) {
    return c.json({ error: "الرجاء تعبئة جميع الحقول" }, 400);
  }
  if (password.length < 8) {
    return c.json({ error: "كلمة المرور يجب ألا تقل عن 8 أحرف" }, 400);
  }

  const existingUser = await c.env.DB.prepare(
    "SELECT id FROM users WHERE email = ?",
  )
    .bind(email)
    .first();

  if (existingUser) {
    return c.json({ error: "البريد الإلكتروني مستخدم بالفعل" }, 409);
  }

  const passwordHash = await hashPassword(password);
  const code = generateCode();
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  // Replace any previous unfinished signup attempt for this email.
  await c.env.DB.prepare("DELETE FROM pending_signups WHERE email = ?")
    .bind(email)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO pending_signups (name, email, password_hash, code, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(name, email, passwordHash, code, expires)
    .run();

  try {
    await sendEmail(
      c.env.RESEND_API_KEY,
      email,
      "رمز التحقق - Maskan",
      `<p>مرحباً ${name}،</p><p>رمز التحقق الخاص بك هو: <strong>${code}</strong></p><p>صالح لمدة 15 دقيقة.</p>`,
    );
  } catch (err) {
    console.log("Email send failed:", err);
    return c.json({ error: "فشل إرسال رمز التحقق، حاول مرة أخرى" }, 500);
  }

  return c.json({ success: true, email }, 201);
});

auth.post("/forgot-password", async (c) => {
  const { email } = await c.req.json();

  const user = await c.env.DB.prepare(
    "SELECT id, name FROM users WHERE email = ?",
  )
    .bind(email)
    .first<{ id: number; name: string }>();

  // Always return success, even if the email isn't found —
  // this avoids letting someone check which emails are registered.
  if (!user) {
    return c.json({ success: true });
  }

  const code = generateCode();
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await c.env.DB.prepare(
    "UPDATE users SET reset_code = ?, reset_code_expires = ? WHERE id = ?",
  )
    .bind(code, expires, user.id)
    .run();

  await sendEmail(
    c.env.RESEND_API_KEY,
    email,
    "إعادة تعيين كلمة المرور - Maskan",
    `<p>مرحباً ${user.name}،</p><p>رمز إعادة تعيين كلمة المرور: <strong>${code}</strong></p><p>صالح لمدة 15 دقيقة.</p>`,
  );

  return c.json({ success: true });
});

auth.post("/reset-password", async (c) => {
  const { email, code, newPassword } = await c.req.json();

  if (!email || !code || !newPassword) {
    return c.json({ error: "الرجاء تعبئة جميع الحقول" }, 400);
  }
  if (newPassword.length < 8) {
    return c.json({ error: "كلمة المرور يجب ألا تقل عن 8 أحرف" }, 400);
  }

  const user = await c.env.DB.prepare(
    "SELECT id, reset_code, reset_code_expires FROM users WHERE email = ?",
  )
    .bind(email)
    .first<{
      id: number;
      reset_code: string | null;
      reset_code_expires: string | null;
    }>();

  if (!user || !user.reset_code) {
    return c.json({ error: "رمز غير صالح" }, 400);
  }
  if (new Date(user.reset_code_expires!) < new Date()) {
    return c.json({ error: "انتهت صلاحية الرمز" }, 400);
  }
  if (user.reset_code !== code) {
    return c.json({ error: "رمز غير صحيح" }, 400);
  }

  const passwordHash = await hashPassword(newPassword);

  await c.env.DB.prepare(
    "UPDATE users SET password_hash = ?, reset_code = NULL, reset_code_expires = NULL WHERE id = ?",
  )
    .bind(passwordHash, user.id)
    .run();

  return c.json({ success: true });
});

// Manual login: email + password
auth.post("/login", async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json(
      { error: "الرجاء إدخال البريد الإلكتروني وكلمة المرور" },
      400,
    );
  }

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?")
    .bind(email)
    .first<{
      id: number;
      name: string;
      email: string;
      password_hash: string | null;
    }>();

  if (!user || !user.password_hash) {
    return c.json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }, 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return c.json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }, 401);
  }

  const token = await makeToken(user.id, user.email, c.env.JWT_SECRET);

  return c.json({
    token,
    user: { id: user.id, name: user.name, email: user.email },
  });
});

// Google sign-in
auth.post("/google", async (c) => {
  const { idToken } = await c.req.json();

  if (!idToken) {
    return c.json({ error: "idToken مطلوب" }, 400);
  }

  // Ask Google directly whether this token is real, and who it belongs to.
  const googleRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`,
  );

  if (!googleRes.ok) {
    return c.json({ error: "فشل التحقق من حساب Google" }, 401);
  }

  const payload = await googleRes.json<{
    sub: string;
    email: string;
    name: string;
    picture?: string;
    aud: string;
  }>();

  // Make sure this token was really issued for OUR app, not someone else's.
  if (payload.aud !== c.env.GOOGLE_CLIENT_ID) {
    return c.json({ error: "رمز Google غير صالح لهذا التطبيق" }, 401);
  }

  let user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?")
    .bind(payload.email)
    .first<{ id: number; name: string; email: string }>();

  if (!user) {
    const result = await c.env.DB.prepare(
      "INSERT INTO users (name, email, google_id, avatar_url) VALUES (?, ?, ?, ?)",
    )
      .bind(payload.name, payload.email, payload.sub, payload.picture ?? null)
      .run();

    user = {
      id: result.meta.last_row_id as number,
      name: payload.name,
      email: payload.email,
    };
  } else {
    // Link this Google account to the existing email-based account, if not linked yet.
    await c.env.DB.prepare(
      "UPDATE users SET google_id = COALESCE(google_id, ?) WHERE id = ?",
    )
      .bind(payload.sub, user.id)
      .run();
  }

  const token = await makeToken(user.id, user.email, c.env.JWT_SECRET);

  return c.json({
    token,
    user: { id: user.id, name: user.name, email: user.email },
  });
});

// Who am I
auth.get("/me", requireAuth, async (c) => {
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
auth.put("/me", requireAuth, async (c) => {
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

auth.post("/confirm-signup", async (c) => {
  const { email, code } = await c.req.json();

  if (!email || !code) {
    return c.json({ error: "الرجاء إدخال البريد الإلكتروني والرمز" }, 400);
  }

  const pending = await c.env.DB.prepare(
    "SELECT * FROM pending_signups WHERE email = ?",
  )
    .bind(email)
    .first<{
      name: string;
      email: string;
      password_hash: string;
      code: string;
      expires_at: string;
    }>();

  if (!pending) {
    return c.json({ error: "لا يوجد طلب تسجيل نشط لهذا البريد" }, 400);
  }
  if (new Date(pending.expires_at) < new Date()) {
    return c.json(
      { error: "انتهت صلاحية الرمز، الرجاء التسجيل مرة أخرى" },
      400,
    );
  }
  if (pending.code !== code) {
    return c.json({ error: "رمز التحقق غير صحيح" }, 400);
  }

  const result = await c.env.DB.prepare(
    "INSERT INTO users (name, email, password_hash, is_verified) VALUES (?, ?, ?, 1)",
  )
    .bind(pending.name, pending.email, pending.password_hash)
    .run();

  const userId = result.meta.last_row_id;

  await c.env.DB.prepare("DELETE FROM pending_signups WHERE email = ?")
    .bind(email)
    .run();

  const token = await makeToken(userId, pending.email, c.env.JWT_SECRET);

  return c.json(
    { token, user: { id: userId, name: pending.name, email: pending.email } },
    201,
  );
});

auth.post("/resend-signup-code", async (c) => {
  const { email } = await c.req.json();

  const pending = await c.env.DB.prepare(
    "SELECT name FROM pending_signups WHERE email = ?",
  )
    .bind(email)
    .first<{ name: string }>();

  if (!pending) {
    return c.json({ error: "لا يوجد طلب تسجيل نشط لهذا البريد" }, 400);
  }

  const code = generateCode();
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await c.env.DB.prepare(
    "UPDATE pending_signups SET code = ?, expires_at = ? WHERE email = ?",
  )
    .bind(code, expires, email)
    .run();

  await sendEmail(
    c.env.RESEND_API_KEY,
    email,
    "رمز التحقق - Maskan",
    `<p>مرحباً ${pending.name}،</p><p>رمز التحقق الخاص بك هو: <strong>${code}</strong></p><p>صالح لمدة 15 دقيقة.</p>`,
  );

  return c.json({ success: true });
});

export default auth;
