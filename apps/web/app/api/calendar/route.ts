/**
 * Google Calendar integration
 *
 * GET /api/calendar?action=connect   → redirect to Google OAuth for Calendar scope
 * GET /api/calendar?action=status    → check if user has connected Google Calendar
 * POST /api/calendar                 → create a Calendar event for a reservation
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { db } from "@repo/db";
import { getGoogleAccessToken, createCalendarEvent } from "../../../lib/calendar";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const NEXTAUTH_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

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

  const { reservationId } = (await req.json()) as { reservationId?: string };
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

  const accessToken = await getGoogleAccessToken(user.googleCalendarToken);
  if (!accessToken) {
    return NextResponse.json(
      {
        error: "Token expirado. Reconecta tu Google Calendar.",
        connectUrl: "/api/calendar?action=connect",
      },
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
    return NextResponse.json(
      { error: "Error al crear evento en Google Calendar" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, eventLink });
}
