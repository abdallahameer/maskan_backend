// Treat missing/empty placeholder values as if the filter was not supplied.
// Query parameters arrive as strings, so literal "null" and "undefined" are
// handled here as well as actual undefined values.
export function hasFilterValue(value: string | undefined): value is string {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized !== "" && normalized !== "null" && normalized !== "undefined"
  );
}

export function buildPropertyFilters(
  q: Record<string, string>,
  lat: string | undefined,
  lng: string | undefined,
) {
  const conditions: string[] = [];
  const params: any[] = [];

  if (hasFilterValue(q.listingType)) {
    conditions.push("p.listing_type = ?");
    params.push(q.listingType);
  }
  if (hasFilterValue(q.propertyType)) {
    conditions.push("p.property_type = ?");
    params.push(q.propertyType);
  }
  if (
    hasFilterValue(q.propertyStatus) &&
    q.propertyStatus.toLowerCase() !== "all"
  ) {
    conditions.push("p.property_status = ?");
    params.push(q.propertyStatus);
  }
  if (hasFilterValue(q.familyOrSingle)) {
    conditions.push("p.family_or_single = ?");
    params.push(q.familyOrSingle);
  }
  if (hasFilterValue(q.paymentType)) {
    conditions.push("p.payment_type = ?");
    params.push(q.paymentType);
  }
  if (
    hasFilterValue(q.furnished) &&
    (q.furnished === "true" || q.furnished === "false")
  ) {
    conditions.push("p.furnished = ?");
    params.push(q.furnished === "true" ? 1 : 0);
  }
  if (hasFilterValue(q.rooms)) {
    conditions.push("p.rooms = ?");
    params.push(Number(q.rooms));
  }
  if (hasFilterValue(q.bathrooms)) {
    conditions.push("p.bathrooms = ?");
    params.push(Number(q.bathrooms));
  }
  if (hasFilterValue(q.minPrice)) {
    conditions.push("p.price >= ?");
    params.push(Number(q.minPrice));
  }
  if (hasFilterValue(q.maxPrice)) {
    conditions.push("p.price <= ?");
    params.push(Number(q.maxPrice));
  }
  if (hasFilterValue(q.minArea)) {
    conditions.push("p.area_size >= ?");
    params.push(Number(q.minArea));
  }
  if (hasFilterValue(q.maxArea)) {
    conditions.push("p.area_size <= ?");
    params.push(Number(q.maxArea));
  }
  if (hasFilterValue(q.city)) {
    conditions.push("c.name = ?");
    params.push(q.city);
  }
  if (hasFilterValue(q.neighborhood)) {
    conditions.push("a.name = ?");
    params.push(q.neighborhood);
  }
  // ?hasLocation=true -> only ads that have both a latitude and a longitude
  if (q.hasLocation === "true") {
    conditions.push("(p.latitude IS NOT NULL AND p.longitude IS NOT NULL)");
  }
  if (hasFilterValue(q.cityId)) {
    conditions.push("p.city_id = ?");
    params.push(Number(q.cityId));
  }
  if (hasFilterValue(q.areaId)) {
    conditions.push("p.area_id = ?");
    params.push(Number(q.areaId));
  }
  if (hasFilterValue(q.search)) {
    conditions.push(`(
      p.title LIKE ? OR
      p.description LIKE ? OR
      c.name LIKE ? OR
      a.name LIKE ?
    )`);
    const term = `%${q.search}%`;
    params.push(term, term, term, term);
  }

  let orderBy = "ORDER BY p.created_at DESC, p.id DESC";
  let selectExtra = "";
  const selectParams: any[] = [];

  if (lat && lng) {
    selectExtra = `, (
      ((p.latitude - ?) * (p.latitude - ?)) +
      ((p.longitude - ?) * (p.longitude - ?))
    ) AS distance_sq`;
    selectParams.push(Number(lat), Number(lat), Number(lng), Number(lng));
    orderBy = "ORDER BY p.latitude IS NULL, distance_sq ASC, p.id DESC";
  }

  return { conditions, params, orderBy, selectExtra, selectParams };
}
