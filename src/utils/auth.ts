import { verify } from "hono/jwt";
import type { Context, Next } from "hono";
import type { Bindings as PropertyBindings } from "../types";

type Bindings = { DB: D1Database; JWT_SECRET: string };

export async function requireAuth(
  c: Context<{ Bindings: Bindings }>,
  next: Next,
) {
  const header = c.req.header("Authorization");

  if (!header || !header.startsWith("Bearer ")) {
    return c.json({ error: "يجب تسجيل الدخول" }, 401);
  }

  const token = header.replace("Bearer ", "");

  try {
    const payload = await verify(token, c.env.JWT_SECRET, "HS256");
    c.set("userId", payload.sub as number);
    await next();
  } catch (err) {
    return c.json({ error: "الجلسة غير صالحة" }, 401);
  }
}

// Reads the logged-in user from the token if there is one (no error if not).
export async function getOptionalUserId(
  c: Context<{ Bindings: PropertyBindings }>,
): Promise<number | null> {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) return null;

  try {
    const payload = await verify(
      header.replace("Bearer ", ""),
      c.env.JWT_SECRET,
      "HS256",
    );
    return Number(payload.sub);
  } catch {
    return null;
  }
}
