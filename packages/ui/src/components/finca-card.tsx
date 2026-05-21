"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Star, Users, BedDouble, Wifi, Waves, Flame, Trees } from "lucide-react";
import { cn } from "../cn";
import { Badge } from "./badge";

const AMENITY_ICONS: Record<string, React.ReactNode> = {
  piscina: <Waves className="h-3.5 w-3.5" />,
  wifi: <Wifi className="h-3.5 w-3.5" />,
  bbq: <Flame className="h-3.5 w-3.5" />,
  jacuzzi: <Waves className="h-3.5 w-3.5" />,
  hamacas: <Trees className="h-3.5 w-3.5" />,
};

function getAmenityIcon(amenity: string): React.ReactNode {
  return AMENITY_ICONS[amenity] || <span className="h-3.5 w-3.5 text-xs">•</span>;
}

function getAmenityLabel(amenity: string): string {
  const labels: Record<string, string> = {
    piscina: "Piscina",
    wifi: "WiFi",
    bbq: "BBQ",
    jacuzzi: "Jacuzzi",
    hamacas: "Hamacas",
    parqueadero: "Parqueadero",
    aire_acondicionado: "A/C",
    chimenea: "Chimenea",
    rio: "Río",
    fogon: "Fogón",
    sauna: "Sauna",
    turco: "Turco",
    desayuno_incluido: "Desayuno",
    cocina_equipada: "Cocina",
    cancha_futbol: "Fútbol",
    cancha_tejo: "Tejo",
    zona_juegos: "Juegos",
    mayordomo: "Mayordomo",
    terraza: "Terraza",
    camping: "Camping",
    tour_cafe: "Tour café",
  };
  return labels[amenity] || amenity.replace(/_/g, " ");
}

export interface FincaCardProps {
  id: string;
  slug: string;
  name: string;
  municipality: string;
  department: string;
  capacity: number;
  bedrooms: number;
  pricePerNight: number;
  weekendPrice?: number | null;
  amenities: string[];
  imageUrl?: string;
  avgRating?: number | null;
  reviewCount?: number;
  featured?: boolean;
  isFavorite?: boolean;
  onFavoriteToggle?: (id: string) => void;
  href?: string;
  className?: string;
}

export function FincaCard({
  id,
  slug,
  name,
  municipality,
  department,
  capacity,
  bedrooms,
  pricePerNight,
  weekendPrice,
  amenities,
  imageUrl,
  avgRating,
  reviewCount = 0,
  featured = false,
  isFavorite = false,
  onFavoriteToggle,
  href,
  className,
}: FincaCardProps) {
  const [localFavorite, setLocalFavorite] = React.useState(isFavorite);
  const topAmenities = amenities.slice(0, 3);
  const cardHref = href || `/finca/${slug}`;

  const formattedPrice = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(pricePerNight);

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLocalFavorite((prev) => !prev);
    onFavoriteToggle?.(id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -4 }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm hover:shadow-lg transition-shadow",
        className
      )}
    >
      {/* Image */}
      <a href={cardHref} className="relative block aspect-[4/3] overflow-hidden bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#E8832A]/20 to-[#1A1D2E]/10 flex items-center justify-center">
            <Trees className="h-16 w-16 text-muted-foreground/30" />
          </div>
        )}

        {/* Featured badge */}
        {featured && (
          <div className="absolute top-3 left-3">
            <Badge variant="default" className="text-xs font-bold shadow-sm">
              ⭐ Destacada
            </Badge>
          </div>
        )}

        {/* Favorite button */}
        <motion.button
          onClick={handleFavoriteClick}
          className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 backdrop-blur-sm shadow-sm hover:bg-white transition-colors"
          whileTap={{ scale: 0.85 }}
          aria-label={localFavorite ? "Quitar de favoritas" : "Agregar a favoritas"}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={localFavorite ? "filled" : "outline"}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Heart
                className={cn(
                  "h-4.5 w-4.5 transition-colors",
                  localFavorite ? "fill-red-500 text-red-500" : "text-gray-600"
                )}
              />
            </motion.div>
          </AnimatePresence>
        </motion.button>
      </a>

      {/* Content */}
      <a href={cardHref} className="flex flex-1 flex-col gap-2 p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-foreground leading-tight">{name}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {municipality}, {department}
            </p>
          </div>

          {/* Rating */}
          {avgRating && (
            <div className="flex items-center gap-1 shrink-0">
              <Star className="h-3.5 w-3.5 fill-[#E8832A] text-[#E8832A]" />
              <span className="text-sm font-semibold">{avgRating.toFixed(1)}</span>
              {reviewCount > 0 && (
                <span className="text-xs text-muted-foreground">({reviewCount})</span>
              )}
            </div>
          )}
        </div>

        {/* Capacity info */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {capacity} personas
          </span>
          <span className="flex items-center gap-1">
            <BedDouble className="h-3.5 w-3.5" />
            {bedrooms} hab.
          </span>
        </div>

        {/* Amenities */}
        {topAmenities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {topAmenities.map((amenity) => (
              <span
                key={amenity}
                className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {getAmenityIcon(amenity)}
                {getAmenityLabel(amenity)}
              </span>
            ))}
            {amenities.length > 3 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                +{amenities.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Price */}
        <div className="mt-auto flex items-end justify-between pt-2 border-t border-border/50">
          <div>
            <span className="text-lg font-bold text-[#E8832A]">{formattedPrice}</span>
            <span className="text-xs text-muted-foreground"> / noche</span>
          </div>
          {weekendPrice && weekendPrice !== pricePerNight && (
            <span className="text-xs text-muted-foreground">
              {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(weekendPrice)} fin de semana
            </span>
          )}
        </div>
      </a>
    </motion.div>
  );
}
