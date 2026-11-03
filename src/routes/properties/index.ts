import { Hono } from "hono";
import type { Bindings } from "../../types";
import create from "./create";
import remove from "./delete";
import detail from "./detail";
import list from "./list";
import media from "./media";
import mine from "./mine";
import photos from "./photos";
import update from "./update";
import video from "./video";

const properties = new Hono<{ Bindings: Bindings }>();

properties.route("/", media);
properties.route("/", create);
properties.route("/", photos);
properties.route("/", video);
properties.route("/", list);
properties.route("/", detail);
properties.route("/", update);
properties.route("/", remove);
properties.route("/", mine);

export {
  PROPERTY_SELECT,
} from "../../utils/property/mapper";
export {
  limitPart,
  listResponse,
  readPaging,
} from "../../utils/property/paging";
export type {
  FamilyOrSingle,
  ListingType,
  PaymentFrequency,
  Property,
  PropertyCategory,
  PropertyLocation,
  PropertyStatus,
} from "../../types";

export default properties;
