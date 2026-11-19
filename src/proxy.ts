import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, UUID } from "@/lib/demoAuth";

// Runs before every page and sends visitors who have not signed in to /login (the demo sign-in sets a cookie). Same behaviour as the real product.
export async function proxy(request: NextRequest) {
  const v = request.cookies.get(DEMO_COOKIE)?.value;
  const signedIn = Boolean(v && UUID.test(v));
  const onLogin = request.nextUrl.pathname === "/login";

  // the address of the site itself shows the public home page to anyone who is not signed in
  if (!signedIn && request.nextUrl.pathname === "/") return NextResponse.rewrite(new URL("/welcome", request.url));
  if (!signedIn && !onLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (signedIn && onLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|icon.png|favicon.ico|api/health|welcome|terms).*)"],
};
