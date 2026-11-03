import { Hono } from "hono";
import { getOptionalUserId } from "../../utils/auth";
import type { Bindings } from "../../types";
import { buildPropertyFilters } from "../../utils/property/filters";
import {
  limitPart,
  listResponse,
  readPaging,
} from "../../utils/property/paging";

const list = new Hono<{ Bindings: Bindings }>();

// ---------------------------------------------------------------------------
// Lists: all in one response, or page by page (the app chooses)
// ---------------------------------------------------------------------------
//   GET /properties                    -> every matching ad in one response
//   GET /properties?page=2&limit=20    -> only that page, plus "pagination"
// Sending page or limit (or both) turns paging on.
list.get("/", async (c) => {
  const q = c.req.query();

  const paging = readPaging(q);
  if (paging && "error" in paging) {
    return c.json({ error: paging.error }, 400);
  }

  const lat = c.req.query("lat");
  const lng = c.req.query("lng");
  const { conditions, params, orderBy, selectExtra, selectParams } =
    buildPropertyFilters(q, lat, lng);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  // The distance placeholders sit in the SELECT part, so they are bound first.
  const finalParams = [...selectParams, ...params];

  const limit = limitPart(paging);

  const { results } = await c.env.DB.prepare(
    `SELECT p.*, c.name AS city_name, a.name AS area_name ${selectExtra}
     FROM properties p
     LEFT JOIN cities c ON c.id = p.city_id
     LEFT JOIN areas a ON a.id = p.area_id
     ${where} ${orderBy} ${limit.sql}`,
  )
    .bind(...finalParams, ...limit.params)
    .all();

  const userId = await getOptionalUserId(c);

  return listResponse(c, results, userId, paging, async () => {
    // How many ads match in total (same filters, no paging)
    const counted = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total
       FROM properties p
       LEFT JOIN cities c ON c.id = p.city_id
       LEFT JOIN areas a ON a.id = p.area_id
       ${where}`,
    )
      .bind(...params)
      .first<{ total: number }>();
    return counted?.total ?? 0;
  });
});

export default list;
