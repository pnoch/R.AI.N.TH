import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { automationRouter } from "./routers/automation";
import { locationsRouter } from "./routers/locations";
import { verificationRouter } from "./routers/verification";
import { weatherRouter } from "./routers/weather";
import { warningsRouter } from "./routers/warnings";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  automation: automationRouter,
  locations: locationsRouter,
  weather: weatherRouter,
  verification: verificationRouter,
  warnings: warningsRouter,
});

export type AppRouter = typeof appRouter;
