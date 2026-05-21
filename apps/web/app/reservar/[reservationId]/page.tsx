"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { trpc } from "../../../lib/trpc";
import { Button, Input, Card, CardContent, CardHeader, CardTitle, Badge } from "@repo/ui";
import { Check, ChevronRight, Shield, Tag, CreditCard, Smartphone, Building2 } from "lucide-react";

const clientSchema = z.object({
  name: z.string().min(3, "Nombre muy corto"),
  email: z.string().email("Email inválido"),
  phone: z.string().regex(/^\+?57[0-9]{10}$/, "Formato: +573XXXXXXXXX"),
  specialRequests: z.string().optional(),
});

const WOMPI_PUBLIC_KEY = process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY || "";

const STEPS = ["Confirmación", "Datos", "Resumen", "Pago"] as const;

export default function ReservarPage() {
  const { reservationId } = useParams<{ reservationId: string }>();
  const [step, setStep] = useState(0);
  const [clientData, setClientData] = useState({ name: "", email: "", phone: "", specialRequests: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof clientData, string>>>({});
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState<{ code: string; discountFormatted: string } | null>(null);
  const [couponError, setCouponError] = useState("");

  const { data: reservation, isLoading } = trpc.reservations.byId.useQuery(
    { id: reservationId },
    { enabled: !!reservationId }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#E8832A] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-2">Reserva no encontrada</h1>
          <p className="text-muted-foreground">El link puede haber expirado.</p>
        </div>
      </div>
    );
  }

  const formatCOP = (n: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

  const validateStep1 = () => {
    const result = clientSchema.safeParse(clientData);
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof typeof clientData;
        fieldErrors[field] = issue.message;
      });
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  };

  const handleApplyCoupon = async () => {
    setCouponError("");
    if (!couponCode.trim()) return;
    try {
      const res = await fetch(`/api/trpc/reservations.byId?input=${encodeURIComponent(JSON.stringify({ id: reservationId }))}`);
      if (!res.ok) throw new Error("Error");
      setCouponApplied({ code: couponCode.toUpperCase(), discountFormatted: "Descuento aplicado" });
    } catch {
      setCouponError("Cupón inválido o expirado");
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Progress steps */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((label, idx) => (
            <div key={label} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    idx < step
                      ? "bg-green-500 text-white"
                      : idx === step
                      ? "bg-[#E8832A] text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {idx < step ? <Check className="h-4 w-4" /> : idx + 1}
                </div>
                <span className="text-xs mt-1 hidden sm:block text-muted-foreground">{label}</span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`h-0.5 w-12 sm:w-20 mx-2 transition-colors ${idx < step ? "bg-green-500" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Step 0: Confirmar selección */}
          {step === 0 && (
            <motion.div
              key="step0"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Confirma tu selección</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-3">
                    <div className="h-16 w-24 rounded-lg bg-muted overflow-hidden shrink-0">
                      {(reservation.finca as { images?: Array<{ url: string }> }).images?.[0]?.url && (
                        <img
                          src={(reservation.finca as { images?: Array<{ url: string }> }).images![0].url}
                          alt={(reservation.finca as { name: string }).name}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold">{(reservation.finca as { name: string }).name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {(reservation.finca as { municipality: string }).municipality}, {(reservation.finca as { department: string }).department}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-xs text-muted-foreground font-medium uppercase">Check-in</div>
                      <div className="font-semibold mt-1">{new Date(reservation.checkIn).toLocaleDateString("es-CO")}</div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-xs text-muted-foreground font-medium uppercase">Check-out</div>
                      <div className="font-semibold mt-1">{new Date(reservation.checkOut).toLocaleDateString("es-CO")}</div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-xs text-muted-foreground font-medium uppercase">Noches</div>
                      <div className="font-semibold mt-1">{reservation.nights}</div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-xs text-muted-foreground font-medium uppercase">Personas</div>
                      <div className="font-semibold mt-1">{reservation.adults} adultos{reservation.children > 0 ? ` + ${reservation.children} niños` : ""}</div>
                    </div>
                  </div>

                  <Button className="w-full" onClick={() => setStep(1)}>
                    Continuar <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 1: Datos del cliente */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Tus datos de contacto</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    placeholder="Nombre completo"
                    value={clientData.name}
                    onChange={(e) => setClientData({ ...clientData, name: e.target.value })}
                    error={errors.name}
                  />
                  <Input
                    type="email"
                    placeholder="Email"
                    value={clientData.email}
                    onChange={(e) => setClientData({ ...clientData, email: e.target.value })}
                    error={errors.email}
                  />
                  <Input
                    type="tel"
                    placeholder="Teléfono (+573001234567)"
                    value={clientData.phone}
                    onChange={(e) => setClientData({ ...clientData, phone: e.target.value })}
                    error={errors.phone}
                  />
                  <textarea
                    placeholder="Solicitudes especiales (opcional)"
                    value={clientData.specialRequests}
                    onChange={(e) => setClientData({ ...clientData, specialRequests: e.target.value })}
                    className="w-full rounded-lg border border-input px-3 py-2 text-sm resize-none h-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8832A]"
                  />
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setStep(0)}>Atrás</Button>
                    <Button
                      className="flex-1"
                      onClick={() => { if (validateStep1()) setStep(2); }}
                    >
                      Continuar <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 2: Resumen y cupón */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Resumen del precio</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {formatCOP(reservation.basePrice / reservation.nights)} × {reservation.nights} noches
                      </span>
                      <span>{formatCOP(reservation.basePrice)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cargo de servicio</span>
                      <span>{formatCOP(reservation.platformFee)}</span>
                    </div>
                    {reservation.discountAmount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Descuento</span>
                        <span>−{formatCOP(reservation.discountAmount)}</span>
                      </div>
                    )}
                    <div className="border-t pt-2 flex justify-between font-bold text-base">
                      <span>Total</span>
                      <span className="text-[#E8832A]">{formatCOP(reservation.totalPrice)}</span>
                    </div>
                  </div>

                  {/* Coupon */}
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Código de cupón"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        leftIcon={<Tag className="h-4 w-4" />}
                      />
                      <Button variant="outline" onClick={handleApplyCoupon} size="sm">
                        Aplicar
                      </Button>
                    </div>
                    {couponError && <p className="text-xs text-destructive">{couponError}</p>}
                    {couponApplied && (
                      <div className="flex items-center gap-2 text-green-600 text-sm">
                        <Check className="h-4 w-4" />
                        Cupón {couponApplied.code} aplicado
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Atrás</Button>
                    <Button className="flex-1" onClick={() => setStep(3)}>
                      Ir al pago <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 3: Pago Wompi */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Selecciona tu método de pago</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3">
                    {[
                      { icon: Building2, label: "PSE — Débito bancario", badge: "Recomendado" },
                      { icon: CreditCard, label: "Tarjeta crédito / débito", badge: null },
                      { icon: Smartphone, label: "Nequi", badge: null },
                    ].map(({ icon: Icon, label, badge }) => (
                      <button
                        key={label}
                        className="flex items-center gap-3 p-4 border border-border rounded-xl hover:border-[#E8832A] hover:bg-[#E8832A]/5 transition-colors text-left"
                      >
                        <Icon className="h-5 w-5 text-[#E8832A]" />
                        <span className="flex-1 text-sm font-medium">{label}</span>
                        {badge && <Badge variant="secondary" className="text-xs">{badge}</Badge>}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                    <Shield className="h-4 w-4 text-green-500 shrink-0" />
                    <span>
                      Pago procesado de forma segura por{" "}
                      <span className="font-semibold">Wompi</span> — certificado PCI DSS nivel 1
                    </span>
                  </div>

                  <div className="font-bold text-center text-lg">
                    Total a pagar:{" "}
                    <span className="text-[#E8832A]">{formatCOP(reservation.totalPrice)}</span>
                  </div>

                  <Button className="w-full" size="lg">
                    Pagar ahora
                  </Button>

                  <Button variant="ghost" className="w-full" onClick={() => setStep(2)}>
                    Volver al resumen
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
