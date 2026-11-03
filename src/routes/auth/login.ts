import { Hono } from "hono";
import { verifyPassword } from "../../utils/password";
import type { Bindings } from "./types";
import { makeToken } from "./token";

const login = new Hono<{ Bindings: Bindings }>();

// Manual login: email + password
login.post("/login", async (c) => {
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
login.post("/google", async (c) => {
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

export default login;
