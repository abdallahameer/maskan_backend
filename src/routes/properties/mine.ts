import { Hono } from "hono";
import { requireAuth } from "../../utils/auth";
import type { Bindings } from "../../types";
import { PROPERTY_SELECT } from "../../utils/property/mapper";
import {
  limitPart,
  listResponse,
  readPaging,
} from "../../utils/property/paging";

const mine = new Hono<{ Bindings: Bindings }>();

mine.get("/mine/list", requireAuth, async (c) => {
  const userId = c.get("userId");

  const paging = readPaging(c.req.query());
  if (paging && "error" in paging) {
    return c.json({ error: paging.error }, 400);
  }
  const limit = limitPart(paging);

  const { results } = await c.env.DB.prepare(
    `${PROPERTY_SELECT} WHERE p.owner_id = ?
     ORDER BY p.created_at DESC, p.id DESC ${limit.sql}`,
  )
    .bind(userId, ...limit.params)
    .all();

  return listResponse(c, results, Number(userId), paging, async () => {
    const counted = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM properties WHERE owner_id = ?",
    )
      .bind(userId)
      .first<{ total: number }>();
    return counted?.total ?? 0;
  });
});

export default mine;
