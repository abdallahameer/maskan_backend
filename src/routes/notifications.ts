import { Hono } from "hono";
import { requireAuth } from "../utils/auth";

type Bindings = { DB: D1Database; JWT_SECRET: string };

const notifications = new Hono<{ Bindings: Bindings }>();

notifications.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");

  const { results } = await c.env.DB.prepare(
    `SELECT n.id, n.is_read, n.created_at, p.*
     FROM notifications n
     JOIN properties p ON p.id = n.property_id
     WHERE n.user_id = ?
     ORDER BY n.created_at DESC
     LIMIT 50`,
  )
    .bind(userId)
    .all();

  return c.json({ notifications: results });
});

notifications.put("/:id/read", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  await c.env.DB.prepare(
    "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
  )
    .bind(id, userId)
    .run();

  return c.json({ success: true });
});

export default notifications;
