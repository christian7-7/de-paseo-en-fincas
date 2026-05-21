import { db } from "@repo/db";

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v19.0";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const INSTAGRAM_API_URL = process.env.INSTAGRAM_API_URL || "https://graph.facebook.com/v19.0";
const INSTAGRAM_PAGE_ACCESS_TOKEN = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@depaseoenfincas.co";

// ─── Central notification router ────────────────────────────────────────────────
export async function send(
  userId: string,
  type: string,
  channel: "WHATSAPP" | "INSTAGRAM" | "WEB" | "EMAIL",
  data: Record<string, unknown>
): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    console.warn(`[Notifications] User ${userId} not found`);
    return;
  }

  const effectiveChannel = channel || user.preferredChannel;

  switch (effectiveChannel) {
    case "WHATSAPP":
      if (user.phone) {
        await sendWhatsApp(user.phone, formatMessage(type, data));
      }
      break;
    case "EMAIL":
      if (user.email) {
        await sendEmail(user.email, type, data);
      }
      break;
    case "INSTAGRAM":
      // Instagram requires igUserId, not userId
      if (data.igUserId) {
        await sendInstagram(data.igUserId as string, formatMessage(type, data));
      }
      break;
    default:
      // Fallback to email
      if (user.email) {
        await sendEmail(user.email, type, data);
      }
  }

  // Mark notification as sent
  await db.notification.updateMany({
    where: {
      userId,
      type,
      sentAt: null,
    },
    data: { sentAt: new Date() },
  });
}

function formatMessage(type: string, data: Record<string, unknown>): string {
  const templates: Record<string, string> = {
    reservation_confirmed: `¡Tu reserva en ${data.fincaName} está confirmada! 🎉\nCheck-in: ${data.checkIn}\nCódigo de acceso: ${data.checkInCode}\n¡Que disfrutes tu paseo!`,
    payment_declined: `Tu pago para ${data.fincaName} no pudo procesarse 😔. Por favor intenta de nuevo en depaseoenfincas.co`,
    pre_trip_info: `¡En 48 horas comienza tu paseo en ${data.fincaName}! 🌄 Prepara tus maletas.`,
    logistics: `¡Mañana es el día! 🗺️ Check-in mañana en ${data.fincaName}. No olvides tu documento de identidad.`,
    checkin_now: `¡Bienvenido a ${data.fincaName}! 🏡 Ya puedes hacer el check-in.`,
    post_stay: `Esperamos que hayas disfrutado ${data.fincaName}. ¿Nos dejas una reseña? 🌟`,
    reengagement_30: `¡${data.name}, te extrañamos! Tenemos nuevas fincas disponibles. ¡Vuelve pronto! 🌿`,
    reengagement_60: `¡${data.name}! Hace 2 meses visitaste ${data.fincaName}. Tenemos descuentos especiales 🎉`,
    reengagement_90: `¡${data.name}, cliente especial! Acceso anticipado a nuestras fincas premium 🏆`,
  };

  return templates[type] || `Notificación: ${type}`;
}

// ─── WhatsApp Business API ─────────────────────────────────────────────────────
export async function sendWhatsApp(phone: string, message: string): Promise<void> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.log(`[WhatsApp] DEV MODE - Would send to ${phone}: ${message.slice(0, 80)}...`);
    return;
  }

  const response = await fetch(
    `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone.replace(/\D/g, ""),
        type: "text",
        text: { body: message, preview_url: false },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`WhatsApp send failed: ${err}`);
  }

  console.log(`[WhatsApp] Sent to ${phone}`);
}

// ─── Email via Resend ─────────────────────────────────────────────────────────
export async function sendEmail(
  to: string,
  template: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log(`[Email] DEV MODE - Would send ${template} to ${to}`);
    return;
  }

  const subjects: Record<string, string> = {
    reservation_confirmed: `¡Reserva confirmada en ${data.fincaName}! 🎉`,
    payment_declined: "Tu pago no pudo procesarse",
    pre_trip_info: `Tu paseo en ${data.fincaName} está a 48 horas`,
    logistics: `Mañana es el día — ${data.fincaName}`,
    checkin_now: `¡Bienvenido a ${data.fincaName}!`,
    post_stay: `¿Cómo estuvo tu paseo en ${data.fincaName}?`,
    reengagement_30: "Nuevas fincas te esperan 🌿",
    reengagement_60: "Descuentos especiales para ti",
    reengagement_90: "Acceso anticipado a fincas premium",
  };

  const htmlBody = `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><style>
      body { font-family: Inter, sans-serif; color: #1A1D2E; background: #f5f5f5; margin: 0; padding: 20px; }
      .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; }
      .header { background: #E8832A; padding: 24px; text-align: center; }
      .header h1 { color: white; margin: 0; font-size: 20px; }
      .body { padding: 24px; }
      .footer { background: #1A1D2E; color: rgba(255,255,255,0.6); text-align: center; padding: 16px; font-size: 12px; }
    </style></head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🌿 De Paseo en Fincas</h1>
        </div>
        <div class="body">
          <p>${formatMessage(template, data).replace(/\n/g, "<br>")}</p>
        </div>
        <div class="footer">
          <p>De Paseo en Fincas · Bogotá, Colombia</p>
          <p><a href="https://depaseoenfincas.co" style="color: #E8832A">depaseoenfincas.co</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `De Paseo en Fincas <${FROM_EMAIL}>`,
      to: [to],
      subject: subjects[template] || "De Paseo en Fincas",
      html: htmlBody,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resend email failed: ${err}`);
  }

  console.log(`[Email] Sent ${template} to ${to}`);
}

// ─── Instagram Graph API ───────────────────────────────────────────────────────
export async function sendInstagram(igUserId: string, message: string): Promise<void> {
  if (!INSTAGRAM_PAGE_ACCESS_TOKEN) {
    console.log(`[Instagram] DEV MODE - Would send to ${igUserId}: ${message.slice(0, 80)}...`);
    return;
  }

  const truncated = message.length > 1000 ? message.slice(0, 997) + "..." : message;

  const response = await fetch(`${INSTAGRAM_API_URL}/me/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: igUserId },
      message: { text: truncated },
      access_token: INSTAGRAM_PAGE_ACCESS_TOKEN,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Instagram send failed: ${err}`);
  }

  console.log(`[Instagram] Sent to ${igUserId}`);
}
