import { db } from "@repo/db";

function formatIcalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function formatIcalAllDay(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function escapeIcal(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function foldLine(line: string): string {
  // RFC 5545: Lines must not exceed 75 octets; fold with CRLF + space
  if (line.length <= 75) return line;
  const result: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (i === 0) {
      result.push(line.slice(0, 75));
      i = 75;
    } else {
      result.push(" " + line.slice(i, i + 74));
      i += 74;
    }
  }
  return result.join("\r\n");
}

/**
 * Generates a valid RFC 5545 .ics file for a reservation.
 */
export async function generateIcal(reservationId: string): Promise<Buffer> {
  const reservation = await db.reservation.findUnique({
    where: { id: reservationId },
    include: {
      finca: true,
      client: { select: { name: true, email: true } },
    },
  });

  if (!reservation) throw new Error(`Reservation ${reservationId} not found`);

  const { finca, client, checkIn, checkOut, nights, adults, children, id } = reservation;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://depaseoenfincas.co";
  const now = new Date();

  const description = [
    `Paseo en ${finca.name}`,
    `Municipio: ${finca.municipality}, ${finca.department}`,
    `Personas: ${adults} adultos${children > 0 ? ` + ${children} niños` : ""}`,
    `Noches: ${nights}`,
    `Ver reserva: ${appUrl}/cuenta`,
    `Check-in: ${finca.checkInTime} | Check-out: ${finca.checkOutTime}`,
  ].join("\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//De Paseo en Fincas//ES`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:reservation-${id}@depaseoenfincas.co`,
    `DTSTAMP:${formatIcalDate(now)}`,
    `DTSTART;VALUE=DATE:${formatIcalAllDay(checkIn)}`,
    `DTEND;VALUE=DATE:${formatIcalAllDay(checkOut)}`,
    `SUMMARY:${escapeIcal(`🌿 Paseo en ${finca.name}`)}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${escapeIcal(`${finca.name}, ${finca.municipality}, ${finca.department}, Colombia`)}`,
    `GEO:${finca.lat};${finca.lng}`,
    `URL:${appUrl}/cuenta`,
    client.email ? `ORGANIZER;CN=De Paseo en Fincas:mailto:info@depaseoenfincas.co` : null,
    client.email ? `ATTENDEE;CN=${escapeIcal(client.name || "Cliente")};ROLE=REQ-PARTICIPANT:mailto:${client.email}` : null,
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:Mañana empieza tu paseo en ${escapeIcal(finca.name)}!`,
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:¡En 2 horas check-in en ${escapeIcal(finca.name)}!`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .map((line) => foldLine(line as string))
    .join("\r\n");

  return Buffer.from(lines, "utf8");
}
