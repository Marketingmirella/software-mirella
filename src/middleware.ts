import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Rutas que NO necesitan estar logueado
const RUTAS_PUBLICAS   = ['/login', '/reset-password']
// Páginas del cliente que escanea el QR — acceso libre siempre
const RUTAS_CLIENTE_QR = ['/mesa', '/domi-pedido']

// Qué panel corresponde a cada rol
const RUTA_POR_ROL: Record<string, string> = {
  gerente: '/gerencia',
  mesera:  '/mesera',
  cocina:  '/cocina',
  domi:    '/domi',
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Páginas QR del cliente: siempre abiertas, sin login ──────
  if (RUTAS_CLIENTE_QR.some(r => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request: { headers: request.headers } })

  // Crear cliente de Supabase con las cookies de la petición
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: request.headers } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Verificar si hay sesión activa
  const { data: { user } } = await supabase.auth.getUser()
  const esPublica = RUTAS_PUBLICAS.some(r => pathname.startsWith(r))

  // ── Sin sesión ───────────────────────────────────────────────
  if (!user) {
    // Puede ver /login y /reset-password sin problema
    if (esPublica) return response
    // Cualquier otra ruta → al login
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // ── Con sesión: obtener el rol del usuario ───────────────────
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  const rutaCorrecta = usuario ? RUTA_POR_ROL[usuario.rol] : null

  // Logueado intentando abrir /login → mandarlo a su panel
  if (esPublica) {
    return NextResponse.redirect(new URL(rutaCorrecta || '/login', request.url))
  }

  // Logueado en una ruta que no le corresponde → redirigir a la suya
  // (ej: una mesera escribiendo /gerencia en la barra de direcciones)
  if (rutaCorrecta && !pathname.startsWith(rutaCorrecta) && pathname !== '/') {
    return NextResponse.redirect(new URL(rutaCorrecta, request.url))
  }

  return response
}

// Aplicar el middleware a todas las rutas excepto archivos estáticos
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
