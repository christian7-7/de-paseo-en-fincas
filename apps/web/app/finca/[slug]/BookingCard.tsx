"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Shield, Loader2, AlertCircle, Minus, Plus } from "lucide-react";
import { Button, Card, CardContent } from "@repo/ui";
import { trpc } from "../../../lib/trpc";

interface BookingCardProps {
  finca: {
    id: string;
    pricePerNight: number;
    weekendPrice: number | null;
    capacity: number;
    minNights: number;
    slug: string;
    name: string;
  };
}

function isWeekend(date: Date): boolean {
  const d = date.getDay();
  return d === 5 || d === 6 || d === 0; // fri, sat, sun
}

function calcNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function calcTotal(finca: BookingCardProps["finca"], checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const inDate = new Date(checkIn);
  const nights = calcNights(checkIn, checkOut);
  if (nights <= 0) return 0;

  let total = 0;
  for (let i = 0; i < nights; i++) {
    const d = new Date(inDate);
    d.setDate(d.getDate() + i);
    const price = isWeekend(d) && finca.weekendPrice ? finca.weekendPrice : finca.pricePerNight;
    total += price;
  }
  return total;
}

const today = new Date().toISOString().split("T")[0]!;
const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0]!;

export function BookingCard({ finca }: BookingCardProps) {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const nights = calcNights(checkIn, checkOut);
  const basePrice = calcTotal(finca, checkIn, checkOut);
  const platformFee = Math.round(basePrice * 0.08); // 8% platform fee
  const total = basePrice + platformFee;

  const formatCOP = (n: number) =>
    new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(n);

  const createReservation = trpc.reservations.create.useMutation({
    onSuccess: (data) => {
      router.push(`/reservar/${data.id}`);
    },
    onError: (err) => {
      setError(err.message || "Error al crear la reserva. Intenta de nuevo.");
    },
  });

  function handleBook() {
    setError(null);

    // Auth check
    if (status === "unauthenticated") {
      const loginUrl = `/login?callbackUrl=${encodeURIComponent(`/finca/${finca.slug}`)}`;
      router.push(loginUrl);
      return;
    }

    // Validation
    if (!checkIn || !checkOut) {
      setError("Selecciona las fechas de entrada y salida.");
      return;
    }
    if (nights < finca.minNights) {
      setError(`Esta finca requiere mínimo ${finca.minNights} noche${finca.minNights > 1 ? "s" : ""}.`);
      return;
    }
    if (adults + children > finca.capacity) {
      setError(`Esta finca tiene capacidad para ${finca.capacity} personas.`);
      return;
    }
    if (!session?.user?.id) {
      setError("Debes iniciar sesión para reservar.");
      return;
    }

    createReservation.mutate({
      fincaId: finca.id,
      checkIn,
      checkOut,
      adults,
      children,
    });
  }

  return (
    <Card className="shadow-lg">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-[#E8832A]">
            {formatCOP(finca.pricePerNight)}
          </span>
          <span className="text-sm text-muted-foreground">/ noche</span>
        </div>
        {finca.weekendPrice && finca.weekendPrice !== finca.pricePerNight && (
          <p className="text-xs text-muted-foreground">
            {formatCOP(finca.weekendPrice)} fin de semana
          </p>
        )}

        {/* Date & person picker */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-border">
            <div className="p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Check-in
              </div>
              <input
                type="date"
                min={today}
                value={checkIn}
                onChange={(e) => {
                  setCheckIn(e.target.value);
                  setError(null);
                  if (checkOut && e.target.value >= checkOut) setCheckOut("");
                }}
                className="text-sm bg-transparent outline-none w-full cursor-pointer"
              />
            </div>
            <div className="p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Check-out
              </div>
              <input
                type="date"
                min={checkIn || tomorrow}
                value={checkOut}
                onChange={(e) => { setCheckOut(e.target.value); setError(null); }}
                className="text-sm bg-transparent outline-none w-full cursor-pointer"
              />
            </div>
          </div>

          <div className="border-t border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Adultos</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAdults(Math.max(1, adults - 1))}
                  className="h-7 w-7 rounded-full border flex items-center justify-center hover:bg-muted disabled:opacity-40"
                  disabled={adults <= 1}
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="text-sm font-semibold w-4 text-center">{adults}</span>
                <button
                  type="button"
                  onClick={() => setAdults(Math.min(finca.capacity, adults + 1))}
                  className="h-7 w-7 rounded-full border flex items-center justify-center hover:bg-muted"
                  disabled={adults + children >= finca.capacity}
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Niños</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setChildren(Math.max(0, children - 1))}
                  className="h-7 w-7 rounded-full border flex items-center justify-center hover:bg-muted disabled:opacity-40"
                  disabled={children <= 0}
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="text-sm font-semibold w-4 text-center">{children}</span>
                <button
                  type="button"
                  onClick={() => setChildren(Math.min(finca.capacity - adults, children + 1))}
                  className="h-7 w-7 rounded-full border flex items-center justify-center hover:bg-muted"
                  disabled={adults + children >= finca.capacity}
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Price breakdown */}
        {nights > 0 && (
          <div className="space-y-2 text-sm border-t pt-4">
            <div className="flex justify-between text-muted-foreground">
              <span>{formatCOP(finca.pricePerNight)} × {nights} noche{nights !== 1 ? "s" : ""}</span>
              <span>{formatCOP(basePrice)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Cargo de servicio</span>
              <span>{formatCOP(platformFee)}</span>
            </div>
            <div className="flex justify-between font-bold border-t pt-2">
              <span>Total</span>
              <span className="text-[#E8832A]">{formatCOP(total)}</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 bg-destructive/10 text-destructive rounded-lg p-3 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <Button
          className="w-full bg-[#E8832A] hover:bg-[#d4721f] text-white"
          size="lg"
          onClick={handleBook}
          disabled={createReservation.isPending || status === "loading"}
        >
          {createReservation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Creando reserva...
            </>
          ) : status === "unauthenticated" ? (
            "Iniciar sesión para reservar"
          ) : (
            nights > 0 ? `Reservar — ${formatCOP(total)}` : "Reservar ahora"
          )}
        </Button>

        <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
          <Shield className="h-3.5 w-3.5" />
          Pago 100% seguro con Wompi
        </div>

        {/* Check-in/out info */}
        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground border-t pt-3">
          <div>
            <div className="font-semibold text-foreground mb-0.5">Check-in</div>
            <div>15:00 hrs</div>
          </div>
          <div>
            <div className="font-semibold text-foreground mb-0.5">Check-out</div>
            <div>12:00 hrs</div>
          </div>
          <div>
            <div className="font-semibold text-foreground mb-0.5">Mín. noches</div>
            <div>{finca.minNights}</div>
          </div>
          <div>
            <div className="font-semibold text-foreground mb-0.5">Máx. personas</div>
            <div>{finca.capacity}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
