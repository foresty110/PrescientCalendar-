import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe Auth.js config — Prisma adapter 없이 providers만.
 * middleware.ts에서 import (edge runtime). auth.ts는 이걸 확장해서 adapter 포함.
 */
export const authConfig = {
  providers: [Google],
  pages: {
    signIn: "/signin",
  },
} satisfies NextAuthConfig;
