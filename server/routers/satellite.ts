import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  getLatestSatelliteSnapshot,
  getSatellitePointObservation,
  refreshSatelliteSnapshot,
} from "../satellite";

function asTrpcError(error: unknown): never {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: error instanceof Error ? error.message : "Satellite operation failed",
  });
}

const pointInput = z.object({
  key: z.string().min(1).max(128),
  latitude: z.number().min(5).max(21),
  longitude: z.number().min(96).max(107),
  nameTh: z.string().max(160).optional(),
  nameEn: z.string().max(160).optional(),
  provinceIso: z.string().regex(/^TH-\d{2}$/).optional(),
});

export const satelliteRouter = router({
  latest: publicProcedure.query(async () => {
    try {
      return await getLatestSatelliteSnapshot();
    } catch (error) {
      asTrpcError(error);
    }
  }),
  point: publicProcedure.input(pointInput).query(async ({ input }) => {
    try {
      return await getSatellitePointObservation(input);
    } catch (error) {
      asTrpcError(error);
    }
  }),
  refresh: protectedProcedure.mutation(async () => {
    try {
      return await refreshSatelliteSnapshot();
    } catch (error) {
      asTrpcError(error);
    }
  }),
});
