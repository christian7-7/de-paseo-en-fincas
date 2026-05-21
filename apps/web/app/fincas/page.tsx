import { Suspense } from "react";
export const dynamic = "force-dynamic";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@repo/db";
import type { Prisma } from "@prisma/client";
import { FincaCard, Skeleton, Button, Badge, Input } from "@repo/ui";
import { SlidersHorizontal, Map, Grid3X3, TreePine } from "lucide-react";

export const metadata: Metadata = {
  title: "Buscar Fincas",
  description: "Encuentra tu finca ideal en Colombia. Filtra por municipio, fechas, capacidad y amenidades.",
};

interface SearchParams {
  municipality?: string;
  department?: string;
  checkIn?: string;
  checkOut?: string;
  adults?: string;
  minPrice?: string;
  maxPrice?: string;
  amenities?: string;
  page?: string;
}

async function searchFincas(params: SearchParams) {
  const page = parseInt(params.page || "1", 10);
  const pageSize = 12;
  const totalGuests = parseInt(params.adults || "0", 10);

  const where: Prisma.FincaWhereInput = {
    status: "ACTIVE",
    ...(params.municipality && {
      municipality: { contains: params.municipality, mode: "insensitive" },
    }),
    ...(params.department && {
      department: { contains: params.department, mode: "insensitive" },
    }),
    ...(totalGuests > 0 && { capacity: { gte: totalGuests } }),
    ...(params.minPrice && { pricePerNight: { gte: parseInt(params.minPrice) } }),
    ...(params.maxPrice && { pricePerNight: { lte: parseInt(params.maxPrice) } }),
    ...(params.amenities && {
      amenities: { hasEvery: params.amenities.split(",") },
    }),
  };

  const [items, total] = await Promise.all([
    db.finca.findMany({
      where,
      include: {
        images: { where: { isPrimary: true }, take: 1 },
        reviews: { select: { rating: true } },
      },
      orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.finca.count({ where }),
  ]);

  return {
    items: items.map((f) => ({
      ...f,
      avgRating:
        f.reviews.length > 0
          ? f.reviews.reduce((s, r) => s + r.rating, 0) / f.reviews.length
          : null,
      reviewCount: f.reviews.length,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

const AMENITY_OPTIONS = [
  { value: "piscina", label: "Piscina" },
  { value: "jacuzzi", label: "Jacuzzi" },
  { value: "bbq", label: "BBQ" },
  { value: "wifi", label: "WiFi" },
  { value: "parqueadero", label: "Parqueadero" },
  { value: "rio", label: "Río" },
  { value: "cancha_futbol", label: "Cancha fútbol" },
  { value: "chimenea", label: "Chimenea" },
  { value: "aire_acondicionado", label: "Aire acondicionado" },
];

export default async function FincasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const results = await searchFincas(searchParams);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <TreePine className="h-5 w-5 text-[#E8832A]" />
            <span className="font-bold text-sm hidden sm:inline">De Paseo en Fincas</span>
          </Link>
          <div className="flex-1 max-w-xl">
            <Input
              placeholder="Buscar por municipio..."
              defaultValue={searchParams.municipality}
              className="h-9"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
            </Button>
            <Button variant="ghost" size="icon" className="hidden sm:flex">
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="hidden sm:flex">
              <Map className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 flex gap-6">
        {/* Filter panel — desktop sidebar */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-20 rounded-xl border border-border p-4 bg-card shadow-sm space-y-6">
            <div>
              <h3 className="font-semibold text-sm mb-3">Precio por noche</h3>
              <div className="flex gap-2">
                <Input placeholder="Mín" type="number" className="h-8 text-xs" defaultValue={searchParams.minPrice} />
                <Input placeholder="Máx" type="number" className="h-8 text-xs" defaultValue={searchParams.maxPrice} />
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-sm mb-3">Amenidades</h3>
              <div className="space-y-2">
                {AMENITY_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-border text-[#E8832A] focus:ring-[#E8832A]"
                      value={opt.value}
                      defaultChecked={searchParams.amenities?.includes(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-sm mb-3">Personas</h3>
              <Input
                type="number"
                placeholder="¿Cuántas personas?"
                min="1"
                className="h-8 text-xs"
                defaultValue={searchParams.adults}
              />
            </div>

            <Button className="w-full" size="sm">Aplicar filtros</Button>
          </div>
        </aside>

        {/* Results */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="font-semibold">{results.total} fincas</span>
              {searchParams.municipality && (
                <span className="text-muted-foreground"> en {searchParams.municipality}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {searchParams.municipality && (
                <Badge variant="secondary" className="gap-1">
                  {searchParams.municipality}
                  <Link href="/fincas" className="ml-1 hover:text-destructive">×</Link>
                </Badge>
              )}
            </div>
          </div>

          <Suspense
            fallback={
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-80 rounded-2xl" />
                ))}
              </div>
            }
          >
            {results.items.length === 0 ? (
              <div className="text-center py-16">
                <TreePine className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">No encontramos fincas</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Intenta con otros filtros o un municipio diferente
                </p>
                <Link href="/fincas">
                  <Button variant="outline">Ver todas las fincas</Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                  {results.items.map((finca) => (
                    <FincaCard
                      key={finca.id}
                      id={finca.id}
                      slug={finca.slug}
                      name={finca.name}
                      municipality={finca.municipality}
                      department={finca.department}
                      capacity={finca.capacity}
                      bedrooms={finca.bedrooms}
                      pricePerNight={finca.pricePerNight}
                      weekendPrice={finca.weekendPrice}
                      amenities={finca.amenities}
                      imageUrl={finca.images[0]?.url}
                      avgRating={finca.avgRating}
                      reviewCount={finca.reviewCount}
                      featured={finca.featured}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {results.totalPages > 1 && (
                  <div className="flex justify-center gap-2 mt-8">
                    {Array.from({ length: results.totalPages }, (_, i) => i + 1).map((p) => (
                      <Link
                        key={p}
                        href={`/fincas?${new URLSearchParams({ ...searchParams, page: String(p) })}`}
                      >
                        <Button
                          variant={p === results.page ? "default" : "outline"}
                          size="sm"
                        >
                          {p}
                        </Button>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
