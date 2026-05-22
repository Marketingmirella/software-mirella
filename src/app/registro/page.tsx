'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegistroPage() {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState({ nombreNegocio: '', nombreDueno: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function registrar() {
    if (!form.nombreNegocio || !form.nombreDueno || !form.email || !form.password) {
      setError('Completa todos los campos'); return
    }
    if (form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/registro-negocio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Error al registrar'); setLoading(false); return }

    // Login automático
    const { error: loginErr } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
    if (loginErr) { setError('Cuenta creada, inicia sesión manualmente'); setLoading(false); return }
    router.push('/onboarding')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-8 space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 bg-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🍽️</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900">Crea tu cuenta</h1>
          <p className="text-gray-500 text-sm mt-1">14 días gratis, sin tarjeta de crédito</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Nombre del restaurante</label>
            <input value={form.nombreNegocio} onChange={e => set('nombreNegocio', e.target.value)}
              placeholder="Ej: Las Delicias de Mirella"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Tu nombre completo</label>
            <input value={form.nombreDueno} onChange={e => set('nombreDueno', e.target.value)}
              placeholder="Propietario / Gerente"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Correo electrónico</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              placeholder="correo@turestaurante.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Contraseña</label>
            <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
          </div>
        </div>

        {error && <p className="text-red-500 text-sm bg-red-50 rounded-xl px-4 py-3">{error}</p>}

        <button onClick={registrar} disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all">
          {loading
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creando cuenta...</>
            : '🚀 Empezar gratis 14 días'}
        </button>

        <p className="text-center text-sm text-gray-400">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="text-purple-600 font-semibold hover:underline">Inicia sesión</Link>
        </p>
      </div>
    </div>
  )
}
