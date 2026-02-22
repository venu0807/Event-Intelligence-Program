import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import db from "@/lib/db";
import { signToken, COOKIE_NAME, COOKIE_OPTIONS } from "@/lib/auth";
import { RowDataPacket } from "mysql2";

interface UserRow extends RowDataPacket {
  id           : number;
  email        : string;
  password_hash: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

    const { email, password } = body as Record<string, unknown>;

    if (typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const [rows] = await db.query<UserRow[]>(
      "SELECT id, email, password_hash FROM users WHERE email = ?",
      [email.toLowerCase().trim()]
    );

    // Identical error message — prevents user enumeration
    const INVALID_MSG = "Invalid email or password.";

    if (rows.length === 0) {
      // Still run bcrypt compare to prevent timing attacks
      await bcrypt.compare(password, "$2b$12$invalidhashfortimingnormalization");
      return NextResponse.json({ error: INVALID_MSG }, { status: 401 });
    }

    const user      = rows[0];
    const passwordOk = await bcrypt.compare(password, user.password_hash);

    if (!passwordOk) {
      return NextResponse.json({ error: INVALID_MSG }, { status: 401 });
    }

    const token = signToken({ userId: user.id, email: user.email });

    const response = NextResponse.json({ user: { id: user.id, email: user.email } });
    response.cookies.set(COOKIE_NAME, token, COOKIE_OPTIONS);
    return response;
  } catch (err) {
    console.error("[POST /api/auth/login]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

// Logout — wipe session cookie
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return response;
}
