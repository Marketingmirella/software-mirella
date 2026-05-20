'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { UtensilsCrossed, Lock, CheckCircle } from 'lucide-react'

export default function ResetPasswordPage() {
  const [password, setPassword]     = useState('')
  const [confirmar, setConfirmar]   = useState('')
  const [loading, setLoading]       = useState(false)
  const [listo, setListo]           = useState(false)
  const [sesionLista, setSesionLista] = useState(false)
  const router   = useRouter()
  const supabase = createClient()

  // Supabase puede mandar el token de dos formas:
  // 1. PKCE (nuevo): llega como ?code=XXX en la URL
  // 2. Implícito (viejo): llega en el #hash y dispara onAuthStateChange
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    if (code) {
      // Flujo PKCE: intercambiamos el código por una sesión
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          toast.error('Enlace inválido o expirado. Solicita uno nuevo.')
        } else {
          setSesionLista(true)
        }
      })
      return
    }

    // Flujo implícito: esperamos el evento PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setSesionLista(true)
    })
    return () => subscription.unsubscribe()
  }, [supabase])

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { toast.error('La contraseña debe tener al menos 6 caracteres'); return }
    if (password !== confirmar) { toast.error('Las contraseñas no coinciden'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { toast.error('Error al cambiar la contraseña'); return }
    setListo(true)
    setTimeout(() => router.push('/login'), 3000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 px-4">
      <div className="w-full max-w-md fade-in">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500 rounded-2xl mb-4 shadow-lg">
            <UtensilsCrossed className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Las Delicias de Mirella</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {listo ? (
            // ── Éxito ──
            <div className="text-center space-y-4 py-4">
              <CheckCircle size={56} className="mx-auto text-green-500" />
              <p className="text-xl font-bold text-gray-900">¡Contraseña cambiada!</p>
              <p className="text-sm text-gray-500">En un momento te llevamos al inicio de sesión...</p>
            </div>
          ) : !sesionLista ? (
            // ── Esperando token ──
            <div className="text-center space-y-4 py-6">
              <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-gray-500 text-sm">Verificando enlace...</p>
              <p className="text-xs text-gray-400">
                Si esta pantalla no avanza, vuelve al correo y haz clic en el enlace de nuevo.
              </p>
            </div>
          ) : (
            // ── Formulario nueva contraseña ──
            <form onSubmit={handleReset} className="space-y-5">
              <div className="text-center mb-2">
                <p className="text-lg font-bold text-gray-900">Nueva contraseña</p>
                <p className="text-sm text-gray-500 mt-1">Elige una contraseña que puedas recordar</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres" required
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Repetir contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input type="password" value={confirmar} onChange={e => setConfirmar(e.target.value)}
                    placeholder="Escribe la misma contraseña" required
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm" />
                </div>
                {confirmar && password !== confirmar && (
                  <p className="text-red-500 text-xs mt-1">Las contraseñas no coinciden</p>
                )}
                {confirmar && password === confirmar && (
                  <p className="text-green-600 text-xs mt-1">✓ Coinciden</p>
                )}
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
                {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
