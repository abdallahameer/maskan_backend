import { Hono } from "hono";
import { hashPassword } from "../../utils/password";
import { sendEmail, generateCode } from "../../utils/email";
import type { Bindings } from "./types";

const signup = new Hono<{ Bindings: Bindings }>();

signup.post("/signup", async (c) => {
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

export default signup;
