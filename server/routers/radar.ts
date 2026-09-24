import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getLatestRadarSnapshot, getRadarPointObservation, refreshRadarSnapshot } from "../radar";

export const radarRouter = router({
  latest: publicProcedure.query(() => getLatestRadarSnapshot()),
  point: publicProcedure
    .input(z.object({
      key: z.string().min(1).max(128),
      latitude: z.number().min(3).max(24),
      longitude: z.number().min(94).max(109),
      nameTh: z.string().max(120).optional(),
      nameEn: z.string().max(120).optional(),
      provinceIso: z.string().regex(/^TH-\d{2}$/).optional(),
    }))
    .query(({ input }) => getRadarPointObservation(input)),
  refresh: protectedProcedure.mutation(async () => {
    try {
      return await refreshRadarSnapshot();
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Official radar refresh failed",
      });
    }
  }),
});
