import type { Metadata } from "next";
export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@repo/db";
import {
  Star,
  Users,
  BedDouble,
  Bath,
  Clock,
  Shield,
  TreePine,
  Wifi,
  Waves,
  Flame,
  Car,
  ChevronLeft,
} from "lucide-react";
import { Button, Badge, Card, CardContent } from "@repo/ui";
import { BookingCard } from "./BookingCard";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const finca = await db.finca.findUnique({
    where: { slug: params.slug },
    include: { images: { where: { isPrimary: true }, take: 1 } },
  });

  if (!finca) return { title: "Finca no encontrada" };

  return {
    title: `${finca.name} — ${finca.municipality}, ${finca.department}`,
    description: finca.shortDescription,
    openGraph: {
      title: finca.name,
      description: finca.shortDescription,
      images: finca.images[0]?.url ? [finca.images[0].url] : [],
    },
  };
}

const AMENITY_ICONS: Record<string, React.ReactNode> = {
  piscina: <Waves className="h-4 w-4" />,
  wifi: <Wifi className="h-4 w-4" />,
  bbq: <Flame className="h-4 w-4" />,
  parqueadero: <Car className="h-4 w-4" />,
};

function AmenityIcon({ amenity }: { amenity: string }) {
  return AMENITY_ICONS[amenity] || <TreePine className="h-4 w-4" />;
}

function AmenityLabel(amenity: string): string {
  const labels: Record<string, string> = {
    piscina: "Piscina privada", wifi: "WiFi de alta velocidad", bbq: "Zona BBQ",
    jacuzzi: "Jacuzzi", hamacas: "Hamacas", parqueadero: "Parqueadero privado",
    aire_acondicionado: "Aire acondicionado", chimenea: "Chimenea", rio: "Acceso al río",
    fogon: "Fogón de leña", sauna: "Sauna", turco: "Turco", desayuno_incluido: "Desayuno incluido",
    cocina_equipada: "Cocina equipada", cancha_futbol: "Cancha de fútbol", cancha_tejo: "Cancha de tejo",
    zona_juegos: "Zona de juegos infantiles", mayordomo: "Mayordomo", terraza: "Terraza con vista",
    camping: "Zona de camping", tour_cafe: "Tour de café", cancha_tenis: "Cancha de tenis",
    sala_entretenimiento: "Sala de entretenimiento",
  };
  return labels[amenity] || amenity.replace(/_/g, " ");
}

export default async function FincaDetailPage({ params }: Props) {
  const finca = await db.finca.findUnique({
    where: { slug: params.slug },
    include: {
      images: { orderBy: { order: "asc" } },
      owner: { select: { name: true, image: true } },
      reviews: {
        where: { publishedAt: { not: null } },
        include: { client: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 6,
      },
    },
  });

  if (!finca) notFound();

  const avgRating =
    finca.reviews.length > 0
      ? finca.reviews.reduce((s, r) => s + r.rating, 0) / finca.reviews.length
      : null;

  const formattedPrice = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(finca.pricePerNight);

  const policyLabel: Record<string, string> = {
    FLEXIBLE: "Flexible",
    MODERATE: "Moderada",
    STRICT: "Estricta",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="mx-auto max-w-6xl flex items-center gap-3">
          <Link href="/fincas">
            <Button variant="ghost" size="sm" className="gap-2">
              <ChevronLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
          <span className="font-semibold text-sm truncate hidden sm:inline">{finca.name}</span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm">Compartir</Button>
            <Button variant="ghost" size="sm">Guardar</Button>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Image gallery */}
        <div className="grid grid-cols-4 grid-rows-2 gap-2 h-[400px] rounded-2xl overflow-hidden mb-8">
          {finca.images.slice(0, 5).map((img, idx) => (
            <div
              key={img.id}
              className={`relative overflow-hidden bg-muted ${idx === 0 ? "col-span-2 row-span-2" : ""}`}
            >
              <img
                src={img.url}
                alt={img.alt || finca.name}
                className="h-full w-full object-cover hover:scale-105 transition-transform duration-500"
              />
            </div>
          ))}
          {finca.images.length === 0 && (
            <div className="col-span-4 row-span-2 bg-muted flex items-center justify-center">
              <TreePine className="h-20 w-20 text-muted-foreground/30" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Header */}
            <div>
              <div className="flex flex-wrap gap-2 mb-2">
                {finca.featured && <Badge variant="default">⭐ Destacada</Badge>}
                <Badge variant="outline">{policyLabel[finca.cancellationPolicy]} cancelación</Badge>
              </div>
              <h1 className="text-2xl font-bold mb-1">{finca.name}</h1>
              <p className="text-muted-foreground">
                {finca.municipality}, {finca.department}
              </p>

              {avgRating && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 ${i < Math.round(avgRating) ? "fill-[#E8832A] text-[#E8832A]" : "text-muted-foreground"}`}
                      />
                    ))}
                  </div>
                  <span className="font-semibold">{avgRating.toFixed(1)}</span>
                  <span className="text-muted-foreground text-sm">({finca.reviews.length} reseñas)</span>
                </div>
              )}
            </div>

            {/* Quick info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="flex flex-col items-center p-3 bg-muted/50 rounded-xl">
                <Users className="h-5 w-5 text-[#E8832A] mb-1" />
                <span className="font-semibold">{finca.capacity}</span>
                <span className="text-xs text-muted-foreground">personas</span>
              </div>
              <div className="flex flex-col items-center p-3 bg-muted/50 rounded-xl">
                <BedDouble className="h-5 w-5 text-[#E8832A] mb-1" />
                <span className="font-semibold">{finca.bedrooms}</span>
                <span className="text-xs text-muted-foreground">habitaciones</span>
              </div>
              <div className="flex flex-col items-center p-3 bg-muted/50 rounded-xl">
                <Bath className="h-5 w-5 text-[#E8832A] mb-1" />
                <span className="font-semibold">{finca.bathrooms}</span>
                <span className="text-xs text-muted-foreground">baños</span>
              </div>
              <div className="flex flex-col items-center p-3 bg-muted/50 rounded-xl">
                <Clock className="h-5 w-5 text-[#E8832A] mb-1" />
                <span className="font-semibold">{finca.minNights}</span>
                <span className="text-xs text-muted-foreground">noches mín.</span>
              </div>
            </div>

            {/* Description */}
            <div>
              <h2 className="font-semibold text-lg mb-3">Sobre esta finca</h2>
              <p className="text-muted-foreground leading-relaxed">{finca.description}</p>
            </div>

            {/* Amenities */}
            <div>
              <h2 className="font-semibold text-lg mb-3">Amenidades</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {finca.amenities.map((amenity) => (
                  <div key={amenity} className="flex items-center gap-2 text-sm">
                    <AmenityIcon amenity={amenity} />
                    <span>{AmenityLabel(amenity)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cancellation policy */}
            <div>
              <h2 className="font-semibold text-lg mb-3">Política de cancelación</h2>
              <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-xl">
                <Shield className="h-5 w-5 text-[#E8832A] shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">{policyLabel[finca.cancellationPolicy]}</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {finca.cancellationPolicy === "FLEXIBLE" &&
                      "Reembolso completo si cancelas con 24 horas de anticipación."}
                    {finca.cancellationPolicy === "MODERATE" &&
                      "Reembolso completo hasta 5 días antes. 50% entre 1-5 días antes."}
                    {finca.cancellationPolicy === "STRICT" &&
                      "Reembolso completo hasta 14 días antes. Sin reembolso después."}
                  </p>
                </div>
              </div>
            </div>

            {/* Rules */}
            {finca.rules && (
              <div>
                <h2 className="font-semibold text-lg mb-3">Reglamento</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{finca.rules}</p>
              </div>
            )}

            {/* Reviews */}
            {finca.reviews.length > 0 && (
              <div>
                <h2 className="font-semibold text-lg mb-4">
                  {finca.reviews.length} reseñas
                  {avgRating && (
                    <span className="ml-2 text-[#E8832A]">★ {avgRating.toFixed(1)}</span>
                  )}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {finca.reviews.map((review) => (
                    <Card key={review.id}>
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-8 w-8 rounded-full bg-[#E8832A]/20 flex items-center justify-center text-xs font-bold text-[#E8832A]">
                            {review.client.name?.slice(0, 2).toUpperCase() || "?"}
                          </div>
                          <div>
                            <div className="text-sm font-semibold">{review.client.name}</div>
                            <div className="flex gap-0.5">
                              {Array.from({ length: review.rating }).map((_, i) => (
                                <Star key={i} className="h-3 w-3 fill-[#E8832A] text-[#E8832A]" />
                              ))}
                            </div>
                          </div>
                        </div>
                        {review.comment && (
                          <p className="text-sm text-muted-foreground">{review.comment}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sticky booking bar */}
          <div className="lg:col-span-1">
            <div className="sticky top-20 space-y-4">
              <BookingCard
                finca={{
                  id: finca.id,
                  pricePerNight: finca.pricePerNight,
                  weekendPrice: finca.weekendPrice,
                  capacity: finca.capacity,
                  minNights: finca.minNights,
                  slug: finca.slug,
                  name: finca.name,
                }}
              />
              <div className="text-center">
                <Link
                  href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "573001234567"}?text=${encodeURIComponent(`Hola! Me interesa la finca ${finca.name}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" className="w-full gap-2">
                    Consultar por WhatsApp
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
