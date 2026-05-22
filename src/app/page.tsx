import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: u } = await supabase
      .from('usuarios')
      .select('rol, negocio:negocios(onboarding_completo)')
      .eq('id', user.id)
      .single()

    if (!u) redirect('/login')

    const neg = u.negocio as { onboarding_completo: boolean } | null
    if (neg && neg.onboarding_completo === false) redirect('/onboarding')

    const rutas: Record<string, string> = {
      gerente: '/gerencia', mesera: '/mesera', cocina: '/cocina',
    }
    redirect(rutas[u.rol] || '/login')
  }

  // ── Landing page ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white">

      {/* NAV */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center">
            <span className="text-lg">🍽️</span>
          </div>
          <span className="font-black text-gray-900 text-lg">RestaurantOS</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900">Iniciar sesión</Link>
          <Link href="/registro"
            className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors">
            Empezar gratis
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="px-6 py-20 text-center max-w-4xl mx-auto">
        <span className="inline-block bg-purple-100 text-purple-700 text-xs font-bold px-4 py-1.5 rounded-full mb-6">
          ✨ 14 días gratis — Sin tarjeta de crédito
        </span>
        <h1 className="text-5xl font-black text-gray-900 leading-tight mb-6">
          El sistema que tu<br />
          <span className="text-purple-600">restaurante necesita</span>
        </h1>
        <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed">
          Gestiona mesas, pedidos, cocina, domicilios y caja — todo en tiempo real desde cualquier dispositivo.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/registro"
            className="bg-purple-600 hover:bg-purple-700 text-white font-black px-8 py-4 rounded-2xl text-lg transition-colors">
            🚀 Empezar gratis 14 días
          </Link>
          <Link href="/login"
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-8 py-4 rounded-2xl text-lg transition-colors">
            Ver demo →
          </Link>
        </div>
      </section>

      {/* FEATURES */}
      <section className="px-6 py-16 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-gray-900 text-center mb-12">Todo lo que necesitas en un solo sistema</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: '🪑', title: 'Mesas en tiempo real', desc: 'Ve el estado de cada mesa al instante. Meseras y gerencia siempre sincronizadas.' },
              { icon: '👨‍🍳', title: 'Panel de cocina', desc: 'Los pedidos llegan solos a la pantalla. El cocinero marca cuando está listo y la mesera recibe aviso.' },
              { icon: '💳', title: 'Caja y pagos', desc: 'Cobra en efectivo, Nequi, Daviplata o Bancolombia. Cuadre automático al cerrar turno.' },
              { icon: '🛵', title: 'Domicilios', desc: 'Los clientes piden con QR, adjuntan comprobante y gerencia ve todo desde un panel.' },
              { icon: '📊', title: 'Informes y estadísticas', desc: 'Ventas del día, platos más pedidos, tiempos de cocina. Todo en gráficas claras.' },
              { icon: '👥', title: 'Multi-usuario', desc: 'Gerente, mesera, cocina y domi — cada uno con su panel y permisos.' },
            ].map((f, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="text-4xl mb-4">{f.icon}</div>
                <h3 className="font-black text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="px-6 py-20 max-w-4xl mx-auto">
        <h2 className="text-3xl font-black text-gray-900 text-center mb-4">Planes simples y transparentes</h2>
        <p className="text-center text-gray-500 mb-12">Sin cobros ocultos. Cancela cuando quieras.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

          {/* Plan Básico */}
          <div className="border-2 border-gray-200 rounded-3xl p-8 space-y-6">
            <div>
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Básico</p>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-black text-gray-900">$89.900</span>
                <span className="text-gray-400 mb-1">COP/mes</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">~USD $22/mes</p>
            </div>
            <ul className="space-y-3">
              {['Hasta 15 mesas', 'Mesas + Cocina + Caja', 'Domicilios con QR', '2 usuarios incluidos', 'Soporte por WhatsApp'].map((f, i) => (
                <li key={i} className="flex items-center gap-3 text-sm text-gray-700">
                  <span className="w-5 h-5 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs font-black shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/registro"
              className="block text-center border-2 border-purple-600 text-purple-600 hover:bg-purple-50 font-bold py-3.5 rounded-2xl transition-colors">
              Empezar gratis →
            </Link>
          </div>

          {/* Plan Pro */}
          <div className="border-2 border-purple-600 rounded-3xl p-8 space-y-6 relative bg-purple-50">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-black px-4 py-1 rounded-full">
              ⭐ MÁS POPULAR
            </span>
            <div>
              <p className="text-sm font-bold text-purple-600 uppercase tracking-wide mb-2">Pro</p>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-black text-gray-900">$149.900</span>
                <span className="text-gray-400 mb-1">COP/mes</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">~USD $35/mes</p>
            </div>
            <ul className="space-y-3">
              {['Mesas ilimitadas', 'Todo el plan Básico', 'Usuarios ilimitados', 'Múltiples zonas', 'Estadísticas avanzadas', 'Soporte prioritario 24/7'].map((f, i) => (
                <li key={i} className="flex items-center gap-3 text-sm text-gray-700">
                  <span className="w-5 h-5 bg-purple-200 text-purple-700 rounded-full flex items-center justify-center text-xs font-black shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/registro"
              className="block text-center bg-purple-600 hover:bg-purple-700 text-white font-bold py-3.5 rounded-2xl transition-colors">
              Empezar gratis →
            </Link>
          </div>
        </div>
        <p className="text-center text-gray-400 text-sm mt-8">
          ¿Tienes más de 3 restaurantes? <a href="mailto:hola@tuagencia.com" className="text-purple-600 font-semibold hover:underline">Contáctanos para plan agencia</a>
        </p>
      </section>

      {/* CTA FINAL */}
      <section className="bg-purple-600 px-6 py-16 text-center">
        <h2 className="text-3xl font-black text-white mb-4">¿Listo para modernizar tu restaurante?</h2>
        <p className="text-purple-200 mb-8 text-lg">Configura tu negocio en menos de 5 minutos. 14 días gratis.</p>
        <Link href="/registro"
          className="inline-block bg-white text-purple-600 font-black px-10 py-4 rounded-2xl text-lg hover:bg-purple-50 transition-colors">
          🚀 Crear mi cuenta gratis
        </Link>
      </section>

      {/* FOOTER */}
      <footer className="px-6 py-8 text-center text-gray-400 text-sm border-t">
        <p>© 2025 RestaurantOS · Hecho con ❤️ en Colombia</p>
      </footer>
    </div>
  )
}
