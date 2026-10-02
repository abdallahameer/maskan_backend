import { Hono } from "hono";
import auth from "./routes/auth";
import locations from "./routes/locations";
import properties from "./routes/properties";
import favorites from "./routes/favorites";
import savedSearches from "./routes/savedSearches";
import notifications from "./routes/notifications";
import contact from "./routes/contact";
type Bindings = { DB: D1Database; JWT_SECRET: string; BUCKET: R2Bucket };

const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT 1 AS ok").first();
  return c.json({ status: "ok", database: row?.ok === 1 });
});

app.route("/auth", auth);
app.route("/locations", locations);
app.route("/properties", properties);
app.route("/favorites", favorites);
app.route("/saved-searches", savedSearches);
app.route("/notifications", notifications);
app.route("/contact", contact);

export default app;
