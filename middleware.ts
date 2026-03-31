// middleware.ts
// Runs on every request. Two jobs:
//   1. Refresh the Supabase session cookie if it's expired (keeps users logged in).
//   2. Redirect unauthenticated users away from protected pages, and redirect
//      authenticated users away from the auth pages.
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Start with a passthrough response; we'll modify cookies on it if needed.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Mirror the cookies onto both the request (for later middleware) and
          // the response (so the browser receives them).
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: getUser() — not getSession() — to validate the session on the server.
  // getSession() only reads the local cookie; getUser() hits the Supabase auth server.
  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isAuthPage = pathname === '/sign-in' || pathname === '/sign-up'

  // Unauthenticated user trying to access a protected page → send to sign-in
  if (!user && !isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    return NextResponse.redirect(url)
  }

  // Authenticated user on an auth page → send to home
  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

// Run on all routes except Next.js internals and static files.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon\\.png|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
