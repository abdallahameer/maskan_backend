import type { Context } from "hono";
import type { Bindings } from "../../types";
import { toProperties } from "./mapper";

export const DEFAULT_PAGE_SIZE = 20; // used when only ?page= is sent
export const MAX_PAGE_SIZE = 100; // the biggest page that can be asked for
export const MAX_UNPAGED = 1000; // safety limit for the "everything" mode

export type Paging = { page: number; limit: number; offset: number };

// Returns null when paging is not asked for. A limit above MAX_PAGE_SIZE is
// lowered to it; a page or limit that is not a whole number of 1+ is an error.
export function readPaging(
  query: Record<string, string>,
): Paging | { error: string } | null {
  if ((query.page ?? "") === "" && (query.limit ?? "") === "") return null;

  const toInt = (value: string | undefined, fallback: number) => {
    if (value === undefined || value === "") return fallback;
    return /^[0-9]+$/.test(value) ? Number(value) : NaN;
  };

  const page = toInt(query.page, 1);
  const limit = toInt(query.limit, DEFAULT_PAGE_SIZE);

  if (!Number.isSafeInteger(page) || page < 1) {
    return { error: "رقم الصفحة غير صالح" };
  }
  if (!Number.isSafeInteger(limit) || limit < 1) {
    return { error: "عدد العناصر في الصفحة غير صالح" };
  }

  const size = Math.min(limit, MAX_PAGE_SIZE);
  return { page, limit: size, offset: (page - 1) * size };
}

// The LIMIT part of the query. Without paging we ask for one ad more than the
// safety limit, only to find out whether there were more.
export function limitPart(paging: Paging | null) {
  return paging
    ? { sql: "LIMIT ? OFFSET ?", params: [paging.limit, paging.offset] }
    : { sql: "LIMIT ?", params: [MAX_UNPAGED + 1] };
}

// What the app gets next to the list when it asked for pages
export function pageInfo(page: number, limit: number, total: number) {
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasMore: page < totalPages };
}

// Builds the answer of a list endpoint, with or without paging
export async function listResponse(
  c: Context<{ Bindings: Bindings }>,
  rows: Record<string, any>[],
  userId: number | null,
  paging: Paging | null,
  countTotal: () => Promise<number>,
) {
  if (paging) {
    const list = await toProperties(c, rows, userId);
    const total = await countTotal();
    return c.json({
      properties: list,
      pagination: pageInfo(paging.page, paging.limit, total),
    });
  }

  const truncated = rows.length > MAX_UNPAGED;
  const list = await toProperties(
    c,
    truncated ? rows.slice(0, MAX_UNPAGED) : rows,
    userId,
  );
  // "truncated" only appears when there were more ads than the safety limit
  return c.json(
    truncated ? { properties: list, truncated: true } : { properties: list },
  );
}
