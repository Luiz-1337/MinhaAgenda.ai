import { NextResponse } from "next/server";

/**
 * Validates admin API key from request headers.
 * Returns null if authorized, or a NextResponse 401 if not.
 */
export function requireAdminAuth(
  headers: Headers
): NextResponse | null {
  const key = headers.get("x-admin-key");
  const expected = process.env.ADMIN_API_KEY;

  if (!expected) {
    return NextResponse.json(
      { error: "Admin API not configured" },
      { status: 503 }
    );
  }

  if (!key || key !== expected) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null;
}

/**
 * Validates cron secret from request headers.
 * Compatible with Vercel Cron's `CRON_SECRET` header.
 */
export function requireCronAuth(
  headers: Headers
): NextResponse | null {
  const secret = headers.get("authorization")?.replace("Bearer ", "");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: "Cron secret not configured" },
      { status: 503 }
    );
  }

  if (!secret || secret !== expected) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null;
}
