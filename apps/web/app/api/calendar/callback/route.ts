/**
 * Google Calendar OAuth callback handler
 * After user grants calendar permissions, Google redirects here with a code.
 * We exchange it for tokens and store the refresh_token in the user record.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@repo/db";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const NEXTAUTH_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state"); // user ID
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    console.error("[calendar/callback] OAuth error:", error);
    return NextResponse.redirect(`${NEXTAUTH_URL}/cuenta?calendarError=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${NEXTAUTH_URL}/cuenta?calendarError=missing_params`);
  }

  // Exchange code for tokens
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${NEXTAUTH_URL}/api/calendar/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("[calendar/callback] Token exchange error:", err);
      return NextResponse.redirect(`${NEXTAUTH_URL}/cuenta?calendarError=token_exchange`);
    }

    const tokens = await tokenRes.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!tokens.refresh_token) {
      console.error("[calendar/callback] No refresh token in response");
      return NextResponse.redirect(`${NEXTAUTH_URL}/cuenta?calendarError=no_refresh_token`);
    }

    // Store refresh token in DB
    await db.user.update({
      where: { id: state },
      data: { googleCalendarToken: tokens.refresh_token },
    });

    console.log(`[calendar/callback] Calendar connected for user ${state}`);
    return NextResponse.redirect(`${NEXTAUTH_URL}/cuenta?calendarConnected=1`);
  } catch (err) {
    console.error("[calendar/callback] Unexpected error:", err);
    return NextResponse.redirect(`${NEXTAUTH_URL}/cuenta?calendarError=server_error`);
  }
}
