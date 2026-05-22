'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

const PASOS = ['Bienvenida', 'Zonas y mesas', 'Tu equipo', 'Tu carta', '¡Listo!']

export default function OnboardingPage() {
  const supabase = createClient()
  const router = useRouter()
  const [paso, setPaso] = useState(0)
  const [negocioId, setNegocioId] = useState<string | null>(null)
  const [negocioNombre, setNegocioNombre] = useState('')
  const [nombreEdit, setNombreEdit] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Zonas y mesas
  const [zona, setZona] = useState('Salón principal')
  const [mesas, setMesas] = useState('5')
  const [mesasCreadas, setMesasCreadas] = useState(false)

  // Equipo
  const [usuarios, setUsuarios] = useState([{ nombre: '', email: '', password: '', rol: 'mesera' as 'mesera' | 'cocina' }])

  // Carta
  const [categorias, setCategorias] = useState<{ id: number; nombre: string }[]>([])
  const [platos, setPlatos] = useState([{ nombre: '', precio: '', categoria_id: '' }])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/login'); return }
      const { data: u } = await supabase.from('usuarios')
        .select('negocio_id, negocio:negocios(id, nombre, onboarding_completo)')
        .eq('id', data.user.id).single()
      if (!u) { router.push('/login'); return }
      const neg = u.negocio as { id: string; nombre: string; onboarding_completo: boolean } | null
      if (neg?.onboarding_completo) { router.push('/gerencia'); return }
      setNegocioId(u.negocio_id)
      setNegocioNombre(neg?.nombre || '')
      setNombreEdit(neg?.nombre || '')
    })
  }, [])

  useEffect(() => {
    if (paso === 3 && negocioId) {
      supabase.from('categorias').select('id, nombre').eq('negocio_id', negocioId).order('orden')
        .then(({ data }) => { if (data) setCategorias(data) })
    }
  }, [paso, negocioId])

  async function guardarNombre() {
    if (!negocioId || !nombreEdit.trim()) return
    setGuardando(true)
    await supabase.from('negocios').update({ nombre: nombreEdit.trim() }).eq('id', negocioId)
    setNegocioNombre(nombreEdit.trim())
    setGuardando(false)
    setPaso(1)
  }

  async function crearMesas() {
    if (!negocioId || !zona.trim()) { toast.error('Escribe el nombre de la zona'); return }
    const cant = parseInt(mesas)
    if (isNaN(cant) || cant < 1 || cant > 50) { toast.error('Número de mesas inválido (1-50)'); return }
    setGuardando(true)
    const filas = Array.from({ length: cant }, (_, i) => ({ negocio_id: negocioId, numero: i + 1, zona: zona.trim() }))
    const { error } = await supabase.from('mesas').insert(filas)
    if (error) { toast.error('Error: ' + error.message); setGuardando(false); return }
    toast.success(`✅ ${cant} mesas creadas en "${zona.trim()}"`)
    setMesasCreadas(true)
    setGuardando(false)
  }

  async function crearUsuarios() {
    setGuardando(true)
    const validos = usuarios.filter(u => u.nombre.trim() && u.email.trim() && u.password.trim())
    for (const u of validos) {
      await fetch('/api/crear-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...u, negocio_id: negocioId }),
      })
    }
    setGuardando(false)
    setPaso(3)
  }

  async function crearPlatos() {
    if (!negocioId) return
    setGuardando(true)
    const validos = platos.filter(p => p.nombre.trim() && p.precio && p.categoria_id)
    if (validos.length > 0) {
      await supabase.from('platos').insert(
        validos.map(p => ({
          negocio_id: negocioId,
          nombre: p.nombre.trim(),
          precio: parseFloat(p.precio),
          categoria_id: parseInt(p.categoria_id),
          activo: true,
        }))
      )
    }
    setGuardando(false)
    setPaso(4)
  }

  async function finalizarOnboarding() {
    if (!negocioId) return
    await supabase.from('negocios').update({ onboarding_completo: true }).eq('id', negocioId)
    toast.success('¡Tu restaurante está listo! 🎉')
    router.push('/gerencia')
  }

  const progreso = Math.round((paso / (PASOS.length - 1)) * 100)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header progreso */}
      <div className="bg-white border-b px-4 py-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-purple-600 rounded-lg flex items-center justify-center"><span className="text-sm">🍽️</span></div>
              <span className="font-black text-gray-900 text-sm">RestaurantOS</span>
            </div>
            <span className="text-xs text-gray-400">Paso {paso + 1} de {PASOS.length}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-purple-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progreso}%` }} />
          </div>
          <div className="flex justify-between mt-1">
            {PASOS.map((p, i) => (
              <span key={p} className={`text-xs font-medium ${i === paso ? 'text-purple-600' : i < paso ? 'text-green-500' : 'text-gray-300'}`}>
                {i < paso ? '✓' : i === paso ? p : '·'}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center p-4 pt-8">
        <div className="w-full max-w-lg">

          {/* ── PASO 0: Bienvenida ── */}
          {paso === 0 && (
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 space-y-6">
              <div className="text-center">
                <div className="text-6xl mb-4">🎉</div>
                <h1 className="text-2xl font-black text-gray-900 mb-2">¡Bienvenido a RestaurantOS!</h1>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Vamos a configurar tu restaurante en 4 pasos rápidos. Puedes cambiar todo esto después.
                </p>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">
                  ¿Cómo se llama tu restaurante?
                </label>
                <input value={nombreEdit} onChange={e => setNombreEdit(e.target.value)}
                  placeholder="Ej: Las Delicias de Mirella"
                  className="w-full border-2 border-gray-200 focus:border-purple-400 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none transition-colors" />
              </div>
              <button onClick={guardarNombre} disabled={!nombreEdit.trim() || guardando}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-black py-4 rounded-2xl transition-colors flex items-center justify-center gap-2">
                {guardando ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Guardando...</> : 'Siguiente →'}
              </button>
            </div>
          )}

          {/* ── PASO 1: Zonas y mesas ── */}
          {paso === 1 && (
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 space-y-5">
              <div>
                <h2 className="text-xl font-black text-gray-900 mb-1">🪑 Crea tus mesas</h2>
                <p className="text-gray-500 text-sm">Define una zona y cuántas mesas tiene. Puedes agregar más zonas después desde el panel de gerencia.</p>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Nombre de la zona</label>
                <input value={zona} onChange={e => setZona(e.target.value)}
                  placeholder="Ej: Salón principal, Terraza..."
                  className="w-full border-2 border-gray-200 focus:border-purple-400 rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">¿Cuántas mesas tiene?</label>
                <input type="number" min="1" max="50" value={mesas} onChange={e => setMesas(e.target.value)}
                  className="w-full border-2 border-gray-200 focus:border-purple-400 rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors font-bold text-2xl text-center" />
                <p className="text-xs text-gray-400 mt-1 text-center">Se crearán las mesas del 1 al {mesas || '?'}</p>
              </div>
              {!mesasCreadas ? (
                <button onClick={crearMesas} disabled={guardando}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-black py-4 rounded-2xl transition-colors flex items-center justify-center gap-2">
                  {guardando ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creando...</> : '✓ Crear mesas'}
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                    <p className="text-green-700 font-bold text-sm">✅ {mesas} mesas creadas en "{zona}"</p>
                    <p className="text-xs text-green-600 mt-1">Puedes agregar más zonas desde el panel de gerencia</p>
                  </div>
                  <button onClick={() => setPaso(2)}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black py-4 rounded-2xl transition-colors">
                    Siguiente →
                  </button>
                </div>
              )}
              <button onClick={() => setPaso(2)} className="w-full text-gray-400 text-sm py-1 hover:text-gray-600">
                Saltar este paso →
              </button>
            </div>
          )}

          {/* ── PASO 2: Equipo ── */}
          {paso === 2 && (
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 space-y-5">
              <div>
                <h2 className="text-xl font-black text-gray-900 mb-1">👥 Agrega tu equipo</h2>
                <p className="text-gray-500 text-sm">Tus meseras y cocineros tendrán sus propios accesos. Puedes agregar más usuarios después.</p>
              </div>
              <div className="space-y-4">
                {usuarios.map((u, i) => (
                  <div key={i} className="bg-gray-50 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-500 uppercase">Usuario {i + 1}</span>
                      {i > 0 && (
                        <button onClick={() => setUsuarios(p => p.filter((_, j) => j !== i))}
                          className="text-xs text-red-400 hover:text-red-600">Quitar</button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input placeholder="Nombre" value={u.nombre} onChange={e => setUsuarios(p => p.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white" />
                      <select value={u.rol} onChange={e => setUsuarios(p => p.map((x, j) => j === i ? { ...x, rol: e.target.value as 'mesera' | 'cocina' } : x))}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white">
                        <option value="mesera">Mesera</option>
                        <option value="cocina">Cocina</option>
                      </select>
                    </div>
                    <input type="email" placeholder="Correo" value={u.email} onChange={e => setUsuarios(p => p.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white" />
                    <input type="password" placeholder="Contraseña" value={u.password} onChange={e => setUsuarios(p => p.map((x, j) => j === i ? { ...x, password: e.target.value } : x))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white" />
                  </div>
                ))}
              </div>
              <button onClick={() => setUsuarios(p => [...p, { nombre: '', email: '', password: '', rol: 'mesera' }])}
                className="w-full border-2 border-dashed border-gray-200 hover:border-purple-400 text-gray-400 hover:text-purple-600 font-bold py-3 rounded-2xl text-sm transition-colors">
                + Agregar otro usuario
              </button>
              <button onClick={crearUsuarios} disabled={guardando}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-black py-4 rounded-2xl transition-colors flex items-center justify-center gap-2">
                {guardando ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creando usuarios...</> : 'Siguiente →'}
              </button>
              <button onClick={() => setPaso(3)} className="w-full text-gray-400 text-sm py-1 hover:text-gray-600">
                Saltar — agregar usuarios después →
              </button>
            </div>
          )}

          {/* ── PASO 3: Carta ── */}
          {paso === 3 && (
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 space-y-5">
              <div>
                <h2 className="text-xl font-black text-gray-900 mb-1">🍽️ Primeros platos</h2>
                <p className="text-gray-500 text-sm">Agrega algunos platos para arrancar. Puedes completar la carta desde el panel después.</p>
              </div>
              <div className="space-y-3">
                {platos.map((p, i) => (
                  <div key={i} className="bg-gray-50 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-400">Plato {i + 1}</span>
                      {i > 0 && <button onClick={() => setPlatos(prev => prev.filter((_, j) => j !== i))} className="text-xs text-red-400">Quitar</button>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input placeholder="Nombre del plato" value={p.nombre} onChange={e => setPlatos(prev => prev.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white" />
                      <input type="number" placeholder="Precio $" value={p.precio} onChange={e => setPlatos(prev => prev.map((x, j) => j === i ? { ...x, precio: e.target.value } : x))}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white" />
                    </div>
                    <select value={p.categoria_id} onChange={e => setPlatos(prev => prev.map((x, j) => j === i ? { ...x, categoria_id: e.target.value } : x))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white">
                      <option value="">Selecciona categoría</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <button onClick={() => setPlatos(p => [...p, { nombre: '', precio: '', categoria_id: '' }])}
                className="w-full border-2 border-dashed border-gray-200 hover:border-purple-400 text-gray-400 hover:text-purple-600 font-bold py-3 rounded-2xl text-sm transition-colors">
                + Agregar otro plato
              </button>
              <button onClick={crearPlatos} disabled={guardando}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-black py-4 rounded-2xl transition-colors flex items-center justify-center gap-2">
                {guardando ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Guardando...</> : 'Siguiente →'}
              </button>
              <button onClick={() => setPaso(4)} className="w-full text-gray-400 text-sm py-1 hover:text-gray-600">
                Saltar — completar carta después →
              </button>
            </div>
          )}

          {/* ── PASO 4: Listo ── */}
          {paso === 4 && (
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 space-y-6 text-center">
              <div>
                <div className="text-7xl mb-4">🎉</div>
                <h2 className="text-2xl font-black text-gray-900 mb-2">¡{negocioNombre} está listo!</h2>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Tu restaurante está configurado y listo para operar. Desde el panel de gerencia puedes agregar más mesas, usuarios y platos.
                </p>
              </div>
              <div className="bg-purple-50 rounded-2xl p-5 space-y-3 text-left">
                <p className="font-bold text-gray-900 text-sm">¿Qué sigue?</p>
                {[
                  '🍽️ Abre tu primer turno desde Caja',
                  '📱 Comparte el QR con tus meseras',
                  '👨‍🍳 Activa el panel de cocina',
                  '🛵 Configura los domicilios',
                ].map(t => (
                  <p key={t} className="text-sm text-gray-600 flex items-center gap-2">{t}</p>
                ))}
              </div>
              <button onClick={finalizarOnboarding}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black py-4 rounded-2xl text-lg transition-colors">
                🚀 Ir al panel de gerencia
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
