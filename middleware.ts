import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Skip:
    //   - Next.js asset paths (_next/static, _next/image)
    //   - Image files served from /public
    //   - /api/cron/*: service-to-service routes authed by their own Bearer
    //     secret. supabase-ssr's getUser() consumes the Authorization header
    //     trying to interpret it as a Supabase JWT, so without this
    //     exclusion the cron secret never reaches the downstream handler.
    "/((?!api/cron|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
