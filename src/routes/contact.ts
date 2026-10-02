import { Hono } from "hono";

type Bindings = { DB: D1Database };

const contact = new Hono<{ Bindings: Bindings }>();

contact.post("/", async (c) => {
  const body = await c.req.json();
  const { name, phone, subject, message } = body;

  if (!name || !phone || !subject || !message) {
    return c.json({ error: "الرجاء تعبئة جميع الحقول" }, 400);
  }

  await c.env.DB.prepare(
    "INSERT INTO contact_messages (name, phone, subject, message) VALUES (?, ?, ?, ?)",
  )
    .bind(name, phone, subject, message)
    .run();

  return c.json({ success: true }, 201);
});

export default contact;
