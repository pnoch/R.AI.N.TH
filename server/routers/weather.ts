import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { approveDraft, getLatestSnapshot, refineThaiDraft, refreshSnapshot } from "../weather";

function asTrpcError(error: unknown): never {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: error instanceof Error ? error.message : "Weather operation failed",
  });
}

export const weatherRouter = router({
  latest: publicProcedure.query(async () => {
    try {
      return await getLatestSnapshot();
    } catch (error) {
      asTrpcError(error);
    }
  }),

  refresh: protectedProcedure.mutation(async () => {
    try {
      return await refreshSnapshot();
    } catch (error) {
      asTrpcError(error);
    }
  }),

  refineDraft: protectedProcedure.mutation(async () => {
    try {
      return await refineThaiDraft();
    } catch (error) {
      asTrpcError(error);
    }
  }),

  approveDraft: protectedProcedure
    .input(z.object({ runKey: z.string().min(1).max(128) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await approveDraft(input.runKey, ctx.user.id);
      } catch (error) {
        asTrpcError(error);
      }
    }),
});
