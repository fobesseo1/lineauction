import { NextResponse, type NextRequest } from "next/server";

// The hosted public site is read-only: operator pages and collection APIs stay local.
// Set NEXT_PUBLIC_READ_ONLY_SITE=1 only on the public deployment.
export function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_READ_ONLY_SITE !== "1") return NextResponse.next();
  return new NextResponse("Not Found", { status: 404 });
}

export const config = {
  matcher: ["/settings/:path*", "/api/court-monitor/:path*", "/api/onbid-progress/:path*", "/api/cron/:path*", "/api/jobs/:path*"],
};
