/**
 * iCal export — /api/calendar/ical?reservationId=xxx
 * Returns a .ics file the user can import into any calendar app.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../lib/auth";
import { db } from "@repo/db";

function formatICalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "").slice(0, 8);
}

function formatICalDateTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeICalText(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const reservationId = req.nextUrl.searchParams.get("reservationId");

  if (!reservationId) {
    // Export all confirmed reservations
    const reservations = await db.reservation.findMany({
      where: { clientId: session.user.id, status: "CONFIRMED" },
      include: { finca: true },
    });

    const events = reservations.map((r) => buildEvent(r)).join("\n");
    const ical = buildCalendar(events);

    return new NextResponse(ical, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="mis-reservas-depaseo.ics"',
        "Cache-Control": "no-cache",
      },
    });
  }

  // Single reservation
  const reservation = await db.reservation.findUnique({
    where: { id: reservationId, clientId: session.user.id },
    include: { finca: true },
  });

  if (!reservation) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const event = buildEvent(reservation);
  const ical = buildCalendar(event);

  return new NextResponse(ical, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="reserva-${reservation.finca.name.toLowerCase().replace(/\s+/g, "-")}.ics"`,
      "Cache-Control": "no-cache",
    },
  });
}

function buildEvent(reservation: {
  id: string;
  checkIn: Date;
  checkOut: Date;
  nights: number;
  adults: number;
  checkInCode?: string | null;
  finca: { name: string; municipality: string; department: string };
  createdAt: Date;
}): string {
  const uid = `reservation-${reservation.id}@depaseoenfincas.co`;
  const now = formatICalDateTime(new Date());
  const dtstart = formatICalDate(reservation.checkIn);
  const dtend = formatICalDate(reservation.checkOut);

  const summary = escapeICalText(`🏡 ${reservation.finca.name} — De Paseo en Fincas`);
  const location = escapeICalText(
    `${reservation.finca.municipality}, ${reservation.finca.department}, Colombia`
  );
  const description = escapeICalText(
    [
      `Reserva en ${reservation.finca.name}`,
      `${reservation.finca.municipality}, ${reservation.finca.department}`,
      `${reservation.adults} persona(s) · ${reservation.nights} noche(s)`,
      reservation.checkInCode ? `Código de acceso: ${reservation.checkInCode}` : "",
      ``,
      `Gestiona tu reserva en https://depaseoenfincas.co/cuenta`,
    ]
      .filter((l) => l !== undefined)
      .join("\\n")
  );

  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${dtstart}`,
    `DTEND;VALUE=DATE:${dtend}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    "TRANSP:TRANSPARENT",
    `CREATED:${formatICalDateTime(reservation.createdAt)}`,
    // Reminders
    "BEGIN:VALARM",
    "TRIGGER:-P7D",
    "ACTION:DISPLAY",
    "DESCRIPTION:Tu paseo en finca es en 7 días",
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    "DESCRIPTION:Tu paseo en finca es mañana",
    "END:VALARM",
    "END:VEVENT",
  ].join("\r\n");
}

function buildCalendar(events: string): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//De Paseo en Fincas//Reservas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:De Paseo en Fincas — Mis Reservas",
    "X-WR-CALDESC:Reservas de fincas en Colombia",
    "X-WR-TIMEZONE:America/Bogota",
    events,
    "END:VCALENDAR",
  ].join("\r\n");
}
