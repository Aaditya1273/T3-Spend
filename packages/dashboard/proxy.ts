import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Minimal proxy — shop domain forwarding removed (not needed for T3N integration).
export function proxy(req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|.*\\..*).*)"],
};
