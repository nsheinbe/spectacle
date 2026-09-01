import { getAuth } from "@/lib/auth/auth";

export const runtime = "nodejs";

// Lazy per-request so `next build` needs no auth secret/database.
const handler = (req: Request) => getAuth().handler(req);

export { handler as GET, handler as POST };
