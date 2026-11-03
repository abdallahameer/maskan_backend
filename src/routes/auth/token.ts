import { sign } from "hono/jwt";

export function makeToken(userId: number, email: string, secret: string) {
  return sign(
    {
      sub: userId,
      email,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    },
    secret,
  );
}
