import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { localStorageMode } from '@/lib/supabase/config'

export async function proxy(request: NextRequest) {
  if (localStorageMode()) return NextResponse.next()
  const publicRoute = request.nextUrl.pathname === '/login' || request.nextUrl.pathname.startsWith('/auth/')
  const apiRoute = request.nextUrl.pathname.startsWith('/api/')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    if (publicRoute || apiRoute) return NextResponse.next()
    return NextResponse.redirect(new URL('/login', request.url))
  }
  let response = NextResponse.next({ request })
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  const { data: { user } } = await client.auth.getUser()
  if (!user && !publicRoute && !apiRoute) {
    const redirect = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie))
    return redirect
  }
  // Authenticated HTML and cookie refreshes must not be cached by shared proxies.
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
