"use client";

import { useState } from "react";
import { Calendar, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@repo/ui";

interface AddToCalendarButtonProps {
  reservationId: string;
}

export function AddToCalendarButton({ reservationId }: AddToCalendarButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId }),
      });
      const data = await res.json() as { eventLink?: string; connectUrl?: string; error?: string };

      if (data.eventLink) {
        window.open(data.eventLink, "_blank", "noopener");
      } else if (data.connectUrl) {
        // Need to connect Calendar first
        window.location.href = data.connectUrl;
      } else {
        console.warn("[calendar] Error:", data.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Calendar className="h-3.5 w-3.5" />
      )}
      Añadir al calendario
    </Button>
  );
}

interface ConnectCalendarButtonProps {
  connected: boolean;
}

export function ConnectCalendarButton({ connected }: ConnectCalendarButtonProps) {
  if (connected) {
    return (
      <div className="flex items-center gap-2 text-green-600">
        <div className="h-2 w-2 rounded-full bg-green-500" />
        <span className="text-sm">Calendario conectado. Tus reservas se agregan automáticamente.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Conecta tu Google Calendar para agregar tus reservas automáticamente.
      </p>
      <a href="/api/calendar?action=connect">
        <Button variant="outline" className="gap-2">
          <ExternalLink className="h-4 w-4" />
          Conectar Google Calendar
        </Button>
      </a>
    </div>
  );
}
