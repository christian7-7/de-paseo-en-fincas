/**
 * Google Calendar API helpers (shared between route handlers)
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

/** Exchange a Google refresh token for a short-lived access token */
export async function getGoogleAccessToken(refreshToken: string): Promise<string | null> {
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

  const data = (await res.json()) as { access_token?: string };
  return data.access_token || null;
}

/** Create a Google Calendar event for a confirmed reservation */
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
      "",
      "Gestiona tu reserva en depaseoenfincas.co/cuenta",
    ]
      .filter(Boolean)
      .join("\n"),
    start: { date: reservation.checkIn.toISOString().split("T")[0] },
    end: { date: reservation.checkOut.toISOString().split("T")[0] },
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

  const data = (await res.json()) as { htmlLink?: string };
  return data.htmlLink || null;
}
