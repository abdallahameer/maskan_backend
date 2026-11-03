import { Hono } from "hono";
import { hashPassword } from "../../utils/password";
import { sendEmail, generateCode } from "../../utils/email";
import type { Bindings } from "./types";

const passwordReset = new Hono<{ Bindings: Bindings }>();

passwordReset.post("/forgot-password", async (c) => {
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

passwordReset.post("/reset-password", async (c) => {
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

export default passwordReset;
