/**
 * lib/auth.ts
 * JWT signing/verification and server-side cookie helpers.
 * The token is stored in an httpOnly cookie — never accessible from JS.
 */

import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const JWT_SECRET  = process.env.JWT_SECRET!;
const COOKIE_NAME = "eip_session";
const TOKEN_TTL   = "7d";

export interface JWTPayload {
  userId: number;
  email : string;
  iat?  : number;
  exp?  : number;
}

export function signToken(payload: Omit<JWTPayload, "iat" | "exp">): string {
  if (!JWT_SECRET) throw new Error("JWT_SECRET is not configured.");
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

/** Read and verify the session cookie (server-side only). */
export async function getAuthUser(): Promise<JWTPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure  : process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge  : 60 * 60 * 24 * 7, // 7 days
  path    : "/",
};

export { COOKIE_NAME };
