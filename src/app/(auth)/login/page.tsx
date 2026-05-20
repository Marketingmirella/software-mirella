'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { UtensilsCrossed, Lock, Mail, ArrowLeft } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [vista, setVista]       = useState<'login' | 'recuperar'>('login')
  const [enviado, setEnviado]   = useState(false)
  const router   = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast.error('Correo o contraseña incorrectos')
      setLoading(false)
      return
    }
    const { data: usuario } = await supabase.from('usuarios').select('rol').eq('id', data.user.id).single()
    if (!usuario) { toast.error('Usuario no encontrado en el sistema'); setLoading(false); return }
    const rutas: Record<string, string> = { gerente: '/gerencia', mesera: '/mesera', cocina: '/cocina' }
    router.push(rutas[usuario.rol] || '/login')
  }

  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { toast.error('Escribe tu correo'); return }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) { toast.error('Error al enviar el correo'); return }
    setEnviado(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 px-4">
      <div className="w-full max-w-md fade-in">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500 rounded-2xl mb-4 shadow-lg">
            <UtensilsCrossed className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Las Delicias de Mirella</h1>
          <p className="text-gray-500 text-sm mt-1">Sistema de gestión</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

          {/* ── Vista: LOGIN ── */}
          {vista === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="correo@ejemplo.com" required
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm" />
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
                {loading ? 'Ingresando...' : 'Ingresar'}
              </button>
              <button type="button" onClick={() => { setVista('recuperar'); setEnviado(false) }}
                className="w-full text-center text-sm text-orange-500 hover:text-orange-600 font-medium py-1">
                ¿Olvidaste tu contraseña?
              </button>
            </form>
          )}

          {/* ── Vista: RECUPERAR ── */}
          {vista === 'recuperar' && (
            <div>
              <button onClick={() => setVista('login')}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-5">
                <ArrowLeft size={16} /> Volver
              </button>

              {!enviado ? (
                <form onSubmit={handleRecuperar} className="space-y-4">
                  <div className="text-center mb-4">
                    <p className="text-lg font-bold text-gray-900">¿Olvidaste tu contraseña?</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Escribe tu correo y te enviamos un enlace para crear una nueva
                    </p>
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="tu-correo@ejemplo.com" required
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm" />
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
                    {loading ? 'Enviando...' : 'Enviar enlace'}
                  </button>
                </form>
              ) : (
                // Confirmación después de enviar
                <div className="text-center space-y-4 py-4">
                  <div className="text-5xl">📬</div>
                  <p className="text-lg font-bold text-gray-900">¡Correo enviado!</p>
                  <p className="text-sm text-gray-500">
                    Revisa tu correo <span className="font-semibold text-gray-700">{email}</span> y
                    haz clic en el enlace para crear tu nueva contraseña.
                  </p>
                  <p className="text-xs text-gray-400">
                    Si no lo ves, revisa la carpeta de spam.
                  </p>
                  <button onClick={() => { setVista('login'); setEnviado(false) }}
                    className="w-full bg-orange-500 text-white font-semibold py-3 rounded-xl text-sm mt-2">
                    Volver al inicio
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Sistema exclusivo para personal autorizado
        </p>
      </div>
    </div>
  )
}
