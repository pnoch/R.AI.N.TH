import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getDistrictBoundaries, getLocationIndex } from "../locations";

function fail(error: unknown): never {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: error instanceof Error ? error.message : "Location data is unavailable",
  });
}

export const locationsRouter = router({
  index: publicProcedure.query(async () => {
    try {
      return await getLocationIndex();
    } catch (error) {
      fail(error);
    }
  }),
  districtBoundaries: publicProcedure
    .input(z.object({ provinceIso: z.string().regex(/^TH-\d{2}$/) }))
    .query(async ({ input }) => {
      try {
        return await getDistrictBoundaries(input.provinceIso);
      } catch (error) {
        fail(error);
      }
    }),
});
