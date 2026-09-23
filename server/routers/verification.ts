import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getLatestVerification, refreshVerification } from "../verification";

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
  refresh: protectedProcedure.mutation(async () => {
    try {
      return await refreshVerification();
    } catch (error) {
      fail(error);
    }
  }),
});
