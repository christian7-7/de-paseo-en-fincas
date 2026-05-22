import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  text: z.string().min(1).max(2000),
  sessionId: z.string().optional(),
  channel: z.enum(["WEB", "WHATSAPP", "INSTAGRAM"]).default("WEB"),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>;

  try {
    const raw = await req.json();
    body = bodySchema.parse(raw);
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // If Groq key is available, use the bot-core engine
  if (process.env.GROQ_API_KEY) {
    try {
      // Dynamic import to avoid TypeScript compile-time resolution of internal package paths
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const botEngine = await import("@repo/bot-core" as any);
      const { processMessage } = botEngine;
      const externalId = body.sessionId || `web_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const result = await processMessage(externalId, body.channel, body.text, {
        senderId: externalId,
        senderName: "Usuario web",
      });

      return NextResponse.json({
        text: result.text,
        sessionId: result.sessionId,
        model: result.model,
        toolsUsed: result.toolsUsed,
      });
    } catch (err) {
      console.error("[api/chat] Bot engine error:", err);
      // Fall through to simple responses
    }
  }

  // Fallback: simple rule-based responses for development without Groq
  const text = body.text.toLowerCase();
  const sessionId = body.sessionId || `web_${Date.now()}`;

  let response = "Lo siento, no pude procesar tu mensaje en este momento. ¿Puedes intentar de nuevo?";

  if (text.includes("guatapé") || text.includes("guatape")) {
    response = "¡Guatapé es uno de nuestros destinos más populares! 🌅 Tenemos la **Finca El Paraíso** disponible: vista al embalse, piscina privada, BBQ y WiFi para hasta 12 personas. ¿Quieres ver más detalles o verificar disponibilidad para fechas específicas?";
  } else if (text.includes("piscina")) {
    response = "🏊 Tenemos varias fincas con piscina privada:\n\n• **Villa Recanto** (Girardot) — 18 personas, desde $780.000/noche\n• **Hacienda Sol** (Anapoima) — 20 personas, desde $680.000/noche\n• **Finca El Paraíso** (Guatapé) — 12 personas, desde $450.000/noche\n\n¿Cuántas personas serían y en qué fechas?";
  } else if (text.includes("precio") || text.includes("costo") || text.includes("tarifa")) {
    response = "💰 Nuestras fincas van desde $280.000/noche (Finca La Esperanza en Villeta) hasta $780.000/noche (Villa Recanto en Girardot). Los fines de semana tienen una tarifa especial. ¿Tienes un presupuesto aproximado en mente?";
  } else if (text.includes("bogotá") || text.includes("bogota") || text.includes("cerca")) {
    response = "🏡 Cerca de Bogotá tenemos opciones en:\n• **Anapoima** — 2.5 hrs · Hacienda Sol (20 personas)\n• **Villeta** — 1.5 hrs · Finca La Esperanza (10 personas)\n• **Girardot** — 2 hrs · Villa Recanto (18 personas) y Casa Campestre El Oasis (8 personas)\n\n¿Cuántas personas y qué fechas planeas?";
  } else if (text.includes("hola") || text.includes("buenos")) {
    response = "¡Hola! 👋 Soy **Paseo**, tu asistente de De Paseo en Fincas. Puedo ayudarte a encontrar la finca perfecta para tu descanso. ¿A dónde quieres escaparte? 🌿";
  } else if (text.includes("cancelación") || text.includes("cancelacion") || text.includes("política")) {
    response = "📋 Tenemos tres tipos de política de cancelación:\n\n• **Flexible** — Reembolso completo hasta 24h antes\n• **Moderada** — Reembolso completo hasta 5 días antes; 50% entre 1-5 días antes\n• **Estricta** — Reembolso completo hasta 14 días antes; sin reembolso después\n\nCada finca indica su política en su página de detalle.";
  } else if (text.includes("salento") || text.includes("quindío") || text.includes("eje cafetero")) {
    response = "☕ ¡El Eje Cafetero es maravilloso! Tenemos la **Villa del Café** en Salento: desayuno incluido, WiFi, parqueadero para 8 personas desde $380.000/noche. ¿Te interesa?";
  } else if (text.includes("disponible") || text.includes("reservar") || text.includes("reserva")) {
    response = "Para verificar disponibilidad necesito:\n1. 📍 ¿A qué municipio quieres ir?\n2. 📅 ¿Qué fechas necesitas?\n3. 👥 ¿Cuántas personas serían?\n\nCon esa información te muestro las opciones disponibles.";
  }

  return NextResponse.json({ text: response, sessionId });
}
