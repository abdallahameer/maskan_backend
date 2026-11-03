import { Hono } from "hono";
import { sendEmail, generateCode } from "../../utils/email";
import type { Bindings } from "./types";
import { makeToken } from "./token";

const signupConfirmation = new Hono<{ Bindings: Bindings }>();

signupConfirmation.post("/confirm-signup", async (c) => {
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

signupConfirmation.post("/resend-signup-code", async (c) => {
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

export default signupConfirmation;
