import type { NormalizedMessage, Channel } from "@repo/types";

// ─── WhatsApp Business API normalization ───────────────────────────────────────
interface WAEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: { phone_number_id: string; display_phone_number: string };
      contacts?: Array<{ wa_id: string; profile: { name: string } }>;
      messages?: Array<{
        id: string;
        from: string;
        timestamp: string;
        type: string;
        text?: { body: string };
        image?: { id: string; caption?: string };
        audio?: { id: string };
        video?: { id: string };
      }>;
    };
    field: string;
  }>;
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: WAEntry[];
}

export function normalizeWhatsApp(payload: WhatsAppWebhookPayload): NormalizedMessage[] {
  const messages: NormalizedMessage[] = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "messages") continue;
      const value = change.value;

      for (const msg of value.messages || []) {
        let text = "";
        let mediaUrl: string | undefined;

        switch (msg.type) {
          case "text":
            text = msg.text?.body || "";
            break;
          case "image":
            text = msg.image?.caption || "[imagen]";
            // In production, use Meta Graph API to get media URL
            mediaUrl = `https://graph.facebook.com/v19.0/${msg.image?.id}`;
            break;
          case "audio":
            text = "[mensaje de voz]";
            mediaUrl = `https://graph.facebook.com/v19.0/${msg.audio?.id}`;
            break;
          case "video":
            text = "[video]";
            mediaUrl = `https://graph.facebook.com/v19.0/${msg.video?.id}`;
            break;
          default:
            text = `[${msg.type}]`;
        }

        if (!text && !mediaUrl) continue;

        messages.push({
          channel: "WHATSAPP" as Channel,
          externalId: msg.from, // E.164 phone number
          text,
          mediaUrl,
          timestamp: new Date(parseInt(msg.timestamp, 10) * 1000),
          raw: payload,
        });
      }
    }
  }

  return messages;
}

// ─── Instagram DM normalization ────────────────────────────────────────────────
interface IGEntry {
  id: string;
  time: number;
  messaging?: Array<{
    sender: { id: string };
    recipient: { id: string };
    timestamp: number;
    message?: {
      mid: string;
      text?: string;
      attachments?: Array<{ type: string; payload: { url?: string } }>;
    };
  }>;
}

export interface InstagramWebhookPayload {
  object: string;
  entry: IGEntry[];
}

export function normalizeInstagram(payload: InstagramWebhookPayload): NormalizedMessage[] {
  const messages: NormalizedMessage[] = [];

  for (const entry of payload.entry || []) {
    for (const messaging of entry.messaging || []) {
      if (!messaging.message) continue;

      let text = messaging.message.text || "";
      let mediaUrl: string | undefined;

      // Handle attachments
      for (const att of messaging.message.attachments || []) {
        if (att.payload?.url) {
          mediaUrl = att.payload.url;
          if (!text) text = `[${att.type}]`;
        }
      }

      if (!text && !mediaUrl) continue;

      messages.push({
        channel: "INSTAGRAM" as Channel,
        externalId: messaging.sender.id,
        text,
        mediaUrl,
        timestamp: new Date(messaging.timestamp),
        raw: payload,
      });
    }
  }

  return messages;
}
