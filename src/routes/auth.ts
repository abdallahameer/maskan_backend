import { Hono } from "hono";
import type { Bindings } from "./auth/types";
import login from "./auth/login";
import passwordReset from "./auth/passwordReset";
import profile from "./auth/profile";
import signup from "./auth/signup";
import signupConfirmation from "./auth/signupConfirmation";

const auth = new Hono<{ Bindings: Bindings }>();

auth.route("/", signup);
auth.route("/", passwordReset);
auth.route("/", login);
auth.route("/", profile);
auth.route("/", signupConfirmation);

export default auth;
