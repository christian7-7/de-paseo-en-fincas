import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createTRPCContext } from "@repo/api";
import { auth } from "../../../../lib/auth";

const handler = async (req: Request) => {
  const session = await auth();

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ req, session }),
    onError:
      process.env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(`❌ tRPC error on ${path ?? "<no-path>"}: ${error.message}`);
          }
        : undefined,
  });
};

export { handler as GET, handler as POST };
