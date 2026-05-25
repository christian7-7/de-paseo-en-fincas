import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" as const },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isAuthenticated = !!auth?.user;
      const protectedPaths = ["/cuenta", "/reservar"];
      const isProtected = protectedPaths.some((path) =>
        nextUrl.pathname.startsWith(path)
      );
      if (isProtected && !isAuthenticated) {
        return false;
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
