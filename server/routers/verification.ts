import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getLatestVerification, getUsableVerificationHistory, refreshVerification } from "../verification";

function fail(error: unknown): never {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: error instanceof Error ? error.message : "Verification operation failed",
  });
}

export const verificationRouter = router({
  latest: publicProcedure.query(async () => {
    try {
      return await getLatestVerification();
    } catch (error) {
      fail(error);
    }
  }),
  history: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(90).default(30) }).optional())
    .query(async ({ input }) => {
      return getUsableVerificationHistory(input?.limit ?? 30);
    }),
  refresh: protectedProcedure.mutation(async () => {
    try {
      return await refreshVerification();
    } catch (error) {
      fail(error);
    }
  }),
});
