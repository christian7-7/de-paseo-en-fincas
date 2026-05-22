/**
 * Google Calendar API helpers
 *
 * GET /api/calendar?action=connect   → redirect to Google OAuth for Calendar scope
 * GET /api/calendar?action=events    → fetch user's upcoming reservations as calendar events
 * POST /api/calendar                 → create a Calendar event for a reservation
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { db } from "@repo/db";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const NEXTAUTH_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

/** Exchange refresh token for access token */
async function getAccessToken(refreshToken: string): Promise<string | null> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    console.error("[calendar] Failed to refresh access token:", await res.text());
    return null;
  }

  const data = await res.json() as { access_token?: string };
  return data.access_token || null;
}

/** Create a Google Calendar event for a reservation */
export async function createCalendarEvent(
  accessToken: string,
  reservation: {
    id: string;
    checkIn: Date;
    checkOut: Date;
    finca: { name: string; municipality: string; department: string };
    adults: number;
    checkInCode?: string | null;
  }
): Promise<string | null> {
  const event = {
    summary: `🏡 ${reservation.finca.name} — De Paseo en Fincas`,
    description: [
      `Reserva confirmada en ${reservation.finca.name}`,
      `${reservation.finca.municipality}, ${reservation.finca.department}`,
      `${reservation.adults} persona(s)`,
      reservation.checkInCode ? `Código de acceso: ${reservation.checkInCode}` : "",
      ``,
      `Gestiona tu reserva en depaseoenfincas.co/cuenta`,
    ]
      .filter(Boolean)
      .join("\n"),
    start: {
      date: reservation.checkIn.toISOString().split("T")[0],
    },
    end: {
      date: reservation.checkOut.toISOString().split("T")[0],
    },
    location: `${reservation.finca.municipality}, ${reservation.finca.department}, Colombia`,
    colorId: "6", // Orange
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 7 * 24 * 60 }, // 1 week before
        { method: "popup", minutes: 24 * 60 }, // 1 day before
      ],
    },
  };

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!res.ok) {
    console.error("[calendar] Failed to create event:", await res.text());
    return null;
  }

  const data = await res.json() as { id?: string; htmlLink?: string };
  return data.htmlLink || null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const action = req.nextUrl.searchParams.get("action") || "status";

  if (action === "connect") {
    // Redirect to Google OAuth with calendar scope
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: `${NEXTAUTH_URL}/api/calendar/callback`,
      response_type: "code",
      scope:
        "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
      access_type: "offline",
      prompt: "consent",
      state: session.user.id,
    });

    return NextResponse.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    );
  }

  if (action === "status") {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { googleCalendarToken: true },
    });

    return NextResponse.json({
      connected: !!user?.googleCalendarToken,
    });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { reservationId } = await req.json() as { reservationId?: string };
  if (!reservationId) {
    return NextResponse.json({ error: "reservationId requerido" }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { googleCalendarToken: true },
  });

  if (!user?.googleCalendarToken) {
    return NextResponse.json(
      { error: "Google Calendar no conectado", connectUrl: "/api/calendar?action=connect" },
      { status: 403 }
    );
  }

  const accessToken = await getAccessToken(user.googleCalendarToken);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Token expirado. Reconecta tu Google Calendar.", connectUrl: "/api/calendar?action=connect" },
      { status: 403 }
    );
  }

  const reservation = await db.reservation.findUnique({
    where: { id: reservationId, clientId: session.user.id },
    include: { finca: true },
  });

  if (!reservation) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }

  const eventLink = await createCalendarEvent(accessToken, reservation);

  if (!eventLink) {
    return NextResponse.json({ error: "Error al crear evento en Google Calendar" }, { status: 500 });
  }

  return NextResponse.json({ success: true, eventLink });
}
