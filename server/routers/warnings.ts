import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getLatestOfficialWarningState, refreshOfficialWarnings } from "../officialWarnings";

function fail(error: unknown): never {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: error instanceof Error ? error.message : "Official warning operation failed",
  });
}

export const warningsRouter = router({
  latest: publicProcedure.query(async () => {
    try {
      return await getLatestOfficialWarningState();
    } catch (error) {
      fail(error);
    }
  }),
  refresh: protectedProcedure.mutation(async () => {
    try {
      return await refreshOfficialWarnings();
    } catch (error) {
      fail(error);
    }
  }),
});
