"use client";

import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, loggerLink } from "@trpc/client";
import type { AppRouter } from "@repo/api";

export const trpc = createTRPCReact<AppRouter>();

export function getBaseUrl() {
  if (typeof window !== "undefined") return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      loggerLink({ enabled: () => process.env.NODE_ENV === "development" }),
      httpBatchLink({ url: `${getBaseUrl()}/api/trpc` }),
    ],
  });
}
