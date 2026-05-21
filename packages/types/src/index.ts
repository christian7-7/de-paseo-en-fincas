// ─── Roles ────────────────────────────────────────────────────────────────────
export type UserRole = "CLIENTE" | "ASESOR" | "PROPIETARIO" | "ADMIN";
export type Channel  = "WHATSAPP" | "INSTAGRAM" | "WEB" | "EMAIL";

// ─── Finca ────────────────────────────────────────────────────────────────────
export type FincaStatus      = "ACTIVE" | "INACTIVE" | "PENDING_REVIEW" | "SUSPENDED";
export type CancellationPolicy = "FLEXIBLE" | "MODERATE" | "STRICT";
export type AvailabilityStatus = "AVAILABLE" | "BLOCKED" | "RESERVED" | "MAINTENANCE";
export type AvailabilitySource = "MANUAL" | "RESERVATION" | "OWNER_BLOCK" | "MAINTENANCE";

// ─── Reservas ─────────────────────────────────────────────────────────────────
export type ReservationStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

// ─── Pagos ────────────────────────────────────────────────────────────────────
export type PaymentMethod   = "PSE" | "CARD" | "NEQUI" | "TRANSFER" | "CASH" | "ADDI";
export type PaymentProvider = "WOMPI" | "ADDI" | "MANUAL";
export type PaymentStatus   = "PENDING" | "APPROVED" | "DECLINED" | "REFUNDED" | "PARTIAL_REFUND";

// ─── Bot ──────────────────────────────────────────────────────────────────────
export type BotSessionState =
  | "IDLE"
  | "SEARCHING"
  | "QUOTING"
  | "BOOKING"
  | "PAYING"
  | "ESCALATED"
  | "CLOSED";

export type BotMessageRole = "USER" | "BOT" | "SYSTEM" | "TOOL";

export type KnowledgeChunkType =
  | "FINCA"
  | "FAQ"
  | "POLICY"
  | "DESTINATION"
  | "REVIEW"
  | "AMENITY";

// ─── Leads ────────────────────────────────────────────────────────────────────
export type LeadSource = "WHATSAPP" | "INSTAGRAM" | "WEB" | "REFERRAL";
export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "NEGOTIATING"
  | "CLOSED_WON"
  | "CLOSED_LOST"
  | "COLD";

// ─── Reviews ──────────────────────────────────────────────────────────────────
export type ReviewSentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

// ─── Cupones ──────────────────────────────────────────────────────────────────
export type DiscountType = "PERCENT" | "FIXED";

// ─── Shared DTOs ──────────────────────────────────────────────────────────────
export interface PaginationInput {
  page:     number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items:      T[];
  total:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
}

export interface ApiError {
  code:    string;
  message: string;
  details?: unknown;
}

// ─── Bot message types ────────────────────────────────────────────────────────
export interface NormalizedMessage {
  channel:    Channel;
  externalId: string;
  text:       string;
  mediaUrl?:  string;
  timestamp:  Date;
  raw:        unknown;
}

export interface BotTool {
  name:        string;
  description: string;
  parameters:  Record<string, unknown>;
}

// ─── Search ───────────────────────────────────────────────────────────────────
export interface FincaSearchInput {
  municipality?: string;
  department?:   string;
  checkIn?:      string;
  checkOut?:     string;
  adults?:       number;
  children?:     number;
  minPrice?:     number;
  maxPrice?:     number;
  amenities?:    string[];
  category?:     string;
  page?:         number;
  pageSize?:     number;
}
