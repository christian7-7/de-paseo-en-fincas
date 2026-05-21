import { createDecipheriv, createCipheriv, randomBytes } from "crypto";
import { db } from "@repo/db";

const ENCRYPTION_KEY = process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY || "";
const ALGORITHM = "aes-256-cbc";

// ─── AES-256 Token helpers ─────────────────────────────────────────────────────
function decrypt(encryptedHex: string): string {
  const [ivHex, encrypted] = encryptedHex.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function encrypt(text: string): string {
  const iv = randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

// ─── Google Calendar API client ────────────────────────────────────────────────
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

async function getAccessToken(encryptedRefreshToken: string): Promise<string> {
  const refreshToken = decrypt(encryptedRefreshToken);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google token refresh failed: ${err}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

interface CalendarEventInput {
  summary: string;
  description: string;
  location: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

function buildCalendarEvent(reservation: {
  finca: { name: string; municipality: string; department: string; lat: number; lng: number };
  checkIn: Date;
  checkOut: Date;
  adults: number;
  children: number;
  nights: number;
  id: string;
}): CalendarEventInput {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://depaseoenfincas.co";

  return {
    summary: `🌿 Paseo en ${reservation.finca.name}`,
    description: [
      `Reserva en ${reservation.finca.name}`,
      `📍 ${reservation.finca.municipality}, ${reservation.finca.department}`,
      `👥 ${reservation.adults} adultos${reservation.children > 0 ? ` + ${reservation.children} niños` : ""}`,
      `🌙 ${reservation.nights} noches`,
      `🔗 Ver reserva: ${appUrl}/cuenta`,
    ].join("\n"),
    location: `${reservation.finca.name}, ${reservation.finca.municipality}, ${reservation.finca.department}, Colombia`,
    startDate: reservation.checkIn.toISOString().slice(0, 10),
    endDate: reservation.checkOut.toISOString().slice(0, 10),
  };
}

export async function createEvent(
  reservationId: string,
  encryptedToken: string
): Promise<string> {
  const reservation = await db.reservation.findUnique({
    where: { id: reservationId },
    include: { finca: true },
  });

  if (!reservation) throw new Error(`Reservation ${reservationId} not found`);

  const accessToken = await getAccessToken(encryptedToken);
  const eventData = buildCalendarEvent(reservation);

  const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: eventData.summary,
      description: eventData.description,
      location: eventData.location,
      start: { date: eventData.startDate },
      end: { date: eventData.endDate },
      colorId: "2", // Sage/green
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 }, // 1 day before
          { method: "popup", minutes: 60 },        // 1 hour before
        ],
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google Calendar createEvent failed: ${err}`);
  }

  const event = await response.json() as { id: string };

  // Save event ID to reservation
  await db.reservation.update({
    where: { id: reservationId },
    data: { googleEventId: event.id },
  });

  return event.id;
}

export async function updateEvent(
  reservationId: string,
  googleEventId: string,
  encryptedToken: string
): Promise<void> {
  const reservation = await db.reservation.findUnique({
    where: { id: reservationId },
    include: { finca: true },
  });

  if (!reservation) throw new Error(`Reservation ${reservationId} not found`);

  const accessToken = await getAccessToken(encryptedToken);
  const eventData = buildCalendarEvent(reservation);

  const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events/${googleEventId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: eventData.summary,
      description: eventData.description,
      location: eventData.location,
      start: { date: eventData.startDate },
      end: { date: eventData.endDate },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google Calendar updateEvent failed: ${err}`);
  }
}

export async function deleteEvent(
  googleEventId: string,
  encryptedToken: string
): Promise<void> {
  const accessToken = await getAccessToken(encryptedToken);

  const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events/${googleEventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok && response.status !== 410) {
    // 410 Gone = already deleted, that's fine
    const err = await response.text();
    throw new Error(`Google Calendar deleteEvent failed: ${err}`);
  }
}
