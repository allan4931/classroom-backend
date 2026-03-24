/**
 * JWT utilities — short-lived access tokens (24h) + long-lived refresh tokens (30d)
 */
import jwt, { SignOptions } from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error("JWT_SECRET environment variable is required");
if (SECRET.length < 32) throw new Error("JWT_SECRET must be at least 32 characters long");

const ACCESS_EXPIRES  = process.env.JWT_ACCESS_EXPIRES  ?? "24h";
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES ?? "30d";

export interface JWTPayload {
  userId: string;
  email:  string;
  role:   "admin" | "teacher" | "student";
  name:   string;
}

export interface RefreshPayload {
  userId: string;
  type:   "refresh";
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, SECRET as string, { expiresIn: ACCESS_EXPIRES } as SignOptions);
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId, type: "refresh" } satisfies RefreshPayload, SECRET as string, {
    expiresIn: REFRESH_EXPIRES,
  } as SignOptions);
}

export function verifyToken(token: string): JWTPayload {
  const payload = jwt.verify(token, SECRET as string);
  return payload as JWTPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  const payload = jwt.verify(token, SECRET as string) as any;
  if (payload.type !== "refresh") throw new Error("Not a refresh token");
  return payload as RefreshPayload;
}
