'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function RegistroPage() {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState({ nombreNegocio: '', nombreDueno: '', email: '', password: '', confirmar: '' })
  const [cargando, setCargando] = useState(false)
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function registrar(e: React.FormEvent) {
    e.preventDefault()
    if (form.password !== form.confirmar) { toast.error('Las contraseñas no coinciden'); return }
    if (form.password.length < 6) { toast.error('Contraseña mínimo 6 caracteres'); return }
    setCargando(true)
    try {
      const res = await fetch('/api/registro-negocio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombreNegocio: form.nombreNegocio, nombreDueno: form.nombreDueno, email: form.email, password: form.password }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al registrar'); setCargando(false); return }

      // Login automático
      const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
      if (error) { toast.error('Cuenta creada. Inicia sesión manualmente.'); router.push('/login'); return }
      toast.success('¡Bienvenido! Vamos a configurar tu restaurante 🎉')
      router.push('/onboarding')
    } catch (e) {
      toast.error('Error de conexión: ' + String(e))
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center">
              <span className="text-xl">🍽️</span>
            </div>
            <span className="font-black text-gray-900 text-xl">RestaurantOS</span>
          </Link>
          <h1 className="text-2xl font-black text-gray-900">Crea tu restaurante</h1>
          <p className="text-gray-500 text-sm mt-1">14 días gratis · Sin tarjeta de crédito</p>
        </div>

        <form onSubmit={registrar} className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Nombre del restaurante *</label>
            <input required value={form.nombreNegocio} onChange={e => f('nombreNegocio', e.target.value)}
              placeholder="Ej: Las Delicias de Mirella"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Tu nombre completo *</label>
            <input required value={form.nombreDueno} onChange={e => f('nombreDueno', e.target.value)}
              placeholder="Ej: Mirella García"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Correo electrónico *</label>
            <input required type="email" value={form.email} onChange={e => f('email', e.target.value)}
              placeholder="tu@correo.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Contraseña *</label>
              <input required type="password" value={form.password} onChange={e => f('password', e.target.value)}
                placeholder="Mín. 6 caracteres"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Confirmar *</label>
              <input required type="password" value={form.confirmar} onChange={e => f('confirmar', e.target.value)}
                placeholder="Repite la clave"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
          </div>

          <button type="submit" disabled={cargando}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-black py-4 rounded-2xl text-base transition-colors flex items-center justify-center gap-2">
            {cargando
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creando tu cuenta...</>
              : '🚀 Crear mi restaurante gratis'}
          </button>

          <p className="text-center text-xs text-gray-400 leading-relaxed">
            Al registrarte aceptas nuestros términos de uso. Después de los 14 días gratis puedes elegir un plan o cancelar.
          </p>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          ¿Ya tienes cuenta? <Link href="/login" className="text-purple-600 font-bold hover:underline">Inicia sesión</Link>
        </p>
      </div>
    </div>
  )
}
