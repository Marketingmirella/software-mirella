'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, X, ChevronRight, Check } from 'lucide-react'

const PASOS = ['Tu negocio', 'Zonas y mesas', 'Tu equipo', 'La carta', '¡Listo!']

export default function OnboardingPage() {
  const supabase = createClient()
  const router = useRouter()
  const [paso, setPaso] = useState(0)
  const [negocioId, setNegocioId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Paso 1
  const [nombreNegocio, setNombreNegocio] = useState('')
  // Paso 2
  const [zonas, setZonas] = useState<{ nombre: string; mesas: string[] }[]>([{ nombre: 'Salón principal', mesas: ['1', '2', '3'] }])
  // Paso 3
  const [usuarios, setUsuarios] = useState<{ nombre: string; email: string; password: string; rol: string }[]>([])
  const [nuevoUser, setNuevoUser] = useState({ nombre: '', email: '', password: '', rol: 'mesera' })
  // Paso 4
  const [categorias, setCategorias] = useState<{ nombre: string }[]>([])
  const [platos, setPlatos] = useState<{ nombre: string; precio: string; categoria: string }[]>([])
  const [nuevoPlato, setNuevoPlato] = useState({ nombre: '', precio: '', categoria: '' })

  const cargar = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: u } = await supabase.from('usuarios').select('negocio_id, negocio:negocios(nombre, onboarding_completo)').eq('id', user.id).single()
    if (!u?.negocio_id) { router.push('/login'); return }
    const neg = u.negocio as { nombre: string; onboarding_completo: boolean } | null
    if (neg?.onboarding_completo) { router.push('/'); return }
    setNegocioId(u.negocio_id)
    setNombreNegocio(neg?.nombre || '')
    const { data: cats } = await supabase.from('categorias').select('nombre').eq('negocio_id', u.negocio_id)
    if (cats) setCategorias(cats)
  }, [supabase, router])

  useEffect(() => { cargar() }, [cargar])

  // ── Guardar paso 1 ──
  async function guardarNegocio() {
    if (!nombreNegocio.trim() || !negocioId) return
    setSaving(true)
    await supabase.from('negocios').update({ nombre: nombreNegocio.trim() }).eq('id', negocioId)
    setSaving(false); setPaso(1)
  }

  // ── Guardar paso 2 ──
  async function guardarMesas() {
    setSaving(true)
    for (const zona of zonas) {
      for (const num of zona.mesas) {
        const n = parseInt(num)
        if (!isNaN(n) && n > 0) {
          await supabase.from('mesas').insert({ numero: n, zona: zona.nombre, estado: 'libre', negocio_id: negocioId }).select()
        }
      }
    }
    setSaving(false); setPaso(2)
  }

  // ── Guardar paso 3 ──
  async function guardarUsuarios() {
    setSaving(true)
    for (const u of usuarios) {
      await fetch('/api/crear-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...u, negocio_id: negocioId }),
      })
    }
    setSaving(false); setPaso(3)
  }

  // ── Guardar paso 4 ──
  async function guardarCarta() {
    setSaving(true)
    // Asegurar categorías
    const catsExistentes = categorias.map(c => c.nombre)
    const catsNuevas = [...new Set(platos.map(p => p.categoria).filter(c => c && !catsExistentes.includes(c)))]
    let catMap: Record<string, number> = {}
    const { data: allCats } = await supabase.from('categorias').select('id, nombre').eq('negocio_id', negocioId!)
    if (allCats) allCats.forEach((c: { id: number; nombre: string }) => { catMap[c.nombre] = c.id })
    for (const nombre of catsNuevas) {
      const { data } = await supabase.from('categorias').insert({ nombre, orden: Object.keys(catMap).length + 1, negocio_id: negocioId }).select('id').single()
      if (data) catMap[nombre] = data.id
    }
    // Insertar platos
    for (const p of platos) {
      const catId = catMap[p.categoria]
      if (!catId || !p.nombre || !p.precio) continue
      const { data: pl } = await supabase.from('platos').insert({
        nombre: p.nombre, precio: parseFloat(p.precio), categoria_id: catId,
        activo: true, negocio_id: negocioId,
      }).select('id').single()
      if (pl) await supabase.from('inventario').insert({ plato_id: pl.id, cantidad_disponible: 0, alerta_minima: 3 })
    }
    setSaving(false); setPaso(4)
  }

  // ── Finalizar ──
  async function finalizar() {
    if (!negocioId) return
    setSaving(true)
    await supabase.from('negocios').update({ onboarding_completo: true }).eq('id', negocioId)
    setSaving(false)
    router.push('/')
  }

  const progreso = Math.round((paso / (PASOS.length - 1)) * 100)

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-xl">🍽️</span>
          </div>
          <h1 className="font-black text-2xl text-gray-900">Configura tu restaurante</h1>
          <p className="text-sm text-gray-500 mt-1">Paso {paso + 1} de {PASOS.length}</p>
        </div>

        {/* Progreso */}
        <div className="flex items-center justify-between mb-6 px-1">
          {PASOS.map((p, i) => (
            <div key={i} className="flex items-center flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-all ${
                i < paso ? 'bg-green-500 text-white' : i === paso ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-400'
              }`}>
                {i < paso ? <Check size={14} /> : i + 1}
              </div>
              {i < PASOS.length - 1 && (
                <div className={`flex-1 h-1 mx-1 rounded-full transition-all ${i < paso ? 'bg-green-500' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Tarjeta */}
        <div className="bg-white rounded-3xl shadow-lg p-6 space-y-5">

          {/* ── Paso 0: Nombre negocio ── */}
          {paso === 0 && (
            <>
              <div>
                <h2 className="text-xl font-black text-gray-900 mb-1">¿Cómo se llama tu restaurante? 🏪</h2>
                <p className="text-sm text-gray-400">Este nombre aparecerá en todo el sistema.</p>
              </div>
              <input
                value={nombreNegocio}
                onChange={e => setNombreNegocio(e.target.value)}
                placeholder="Ej: Las Delicias de Mirella"
                className="w-full border-2 border-gray-200 focus:border-purple-400 rounded-2xl px-4 py-3.5 text-base font-semibold focus:outline-none"
              />
              <button onClick={guardarNegocio} disabled={saving || !nombreNegocio.trim()}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-200 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2">
                {saving ? 'Guardando...' : <>Siguiente <ChevronRight size={18} /></>}
              </button>
            </>
          )}

          {/* ── Paso 1: Zonas y mesas ── */}
          {paso === 1 && (
            <>
              <div>
                <h2 className="text-xl font-black text-gray-900 mb-1">Crea tus zonas y mesas 🪑</h2>
                <p className="text-sm text-gray-400">Organiza tu restaurante por zonas (salón, terraza, bar…) y define las mesas de cada una.</p>
              </div>
              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {zonas.map((z, zi) => (
                  <div key={zi} className="bg-gray-50 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <input value={z.nombre} onChange={e => setZonas(prev => prev.map((z2, i) => i === zi ? { ...z2, nombre: e.target.value } : z2))}
                        placeholder="Nombre de la zona"
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400" />
                      {zonas.length > 1 && (
                        <button onClick={() => setZonas(prev => prev.filter((_, i) => i !== zi))}
                          className="w-8 h-8 bg-red-100 hover:bg-red-200 text-red-500 rounded-xl flex items-center justify-center">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 font-medium">Números de mesa (separados por coma):</p>
                    <input
                      value={z.mesas.join(', ')}
                      onChange={e => setZonas(prev => prev.map((z2, i) => i === zi ? { ...z2, mesas: e.target.value.split(',').map(s => s.trim()) } : z2))}
                      placeholder="1, 2, 3, 4, 5"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                  </div>
                ))}
              </div>
              <button onClick={() => setZonas(prev => [...prev, { nombre: '', mesas: [] }])}
                className="w-full border-2 border-dashed border-purple-300 text-purple-600 font-bold py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-purple-50">
                <Plus size={16} /> Agregar zona
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setPaso(0)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-2xl">← Atrás</button>
                <button onClick={guardarMesas} disabled={saving}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-200 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2">
                  {saving ? 'Guardando...' : <>Siguiente <ChevronRight size={16} /></>}
                </button>
              </div>
              <button onClick={() => setPaso(2)} className="w-full text-gray-400 text-sm hover:text-gray-600 text-center">Saltar este paso →</button>
            </>
          )}

          {/* ── Paso 2: Equipo ── */}
          {paso === 2 && (
            <>
              <div>
                <h2 className="text-xl font-black text-gray-900 mb-1">Agrega tu equipo 👥</h2>
                <p className="text-sm text-gray-400">Crea cuentas para tus meseras, cocineros y demás personal.</p>
              </div>
              {usuarios.length > 0 && (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {usuarios.map((u, i) => (
                    <div key={i} className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{u.nombre}</p>
                        <p className="text-xs text-gray-500 capitalize">{u.rol} · {u.email}</p>
                      </div>
                      <button onClick={() => setUsuarios(p => p.filter((_, j) => j !== i))}
                        className="w-7 h-7 bg-red-100 hover:bg-red-200 text-red-500 rounded-lg flex items-center justify-center">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Nuevo miembro</p>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Nombre" value={nuevoUser.nombre} onChange={e => setNuevoUser(p => ({ ...p, nombre: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                  <select value={nuevoUser.rol} onChange={e => setNuevoUser(p => ({ ...p, rol: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                    <option value="mesera">Mesera</option>
                    <option value="cocina">Cocina</option>
                    <option value="domi">Domi</option>
                  </select>
                </div>
                <input type="email" placeholder="Correo" value={nuevoUser.email} onChange={e => setNuevoUser(p => ({ ...p, email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                <input type="password" placeholder="Contraseña" value={nuevoUser.password} onChange={e => setNuevoUser(p => ({ ...p, password: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                <button
                  onClick={() => {
                    if (!nuevoUser.nombre || !nuevoUser.email || !nuevoUser.password) return
                    setUsuarios(p => [...p, { ...nuevoUser }])
                    setNuevoUser({ nombre: '', email: '', password: '', rol: 'mesera' })
                  }}
                  className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2">
                  <Plus size={14} /> Agregar
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setPaso(1)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-2xl">← Atrás</button>
                <button onClick={guardarUsuarios} disabled={saving}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-200 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2">
                  {saving ? 'Guardando...' : <>Siguiente <ChevronRight size={16} /></>}
                </button>
              </div>
              <button onClick={() => setPaso(3)} className="w-full text-gray-400 text-sm hover:text-gray-600 text-center">Saltar este paso →</button>
            </>
          )}

          {/* ── Paso 3: Carta ── */}
          {paso === 3 && (
            <>
              <div>
                <h2 className="text-xl font-black text-gray-900 mb-1">Agrega tus primeros platos 🍽️</h2>
                <p className="text-sm text-gray-400">Puedes agregar más desde el panel de Carta cuando quieras.</p>
              </div>
              {platos.length > 0 && (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {platos.map((p, i) => (
                    <div key={i} className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{p.nombre}</p>
                        <p className="text-xs text-gray-500">{p.categoria} · ${parseFloat(p.precio || '0').toLocaleString('es-CO')}</p>
                      </div>
                      <button onClick={() => setPlatos(prev => prev.filter((_, j) => j !== i))}
                        className="w-7 h-7 bg-red-100 hover:bg-red-200 text-red-500 rounded-lg flex items-center justify-center">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Nuevo plato</p>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Nombre del plato" value={nuevoPlato.nombre} onChange={e => setNuevoPlato(p => ({ ...p, nombre: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  <input type="number" placeholder="Precio $" value={nuevoPlato.precio} onChange={e => setNuevoPlato(p => ({ ...p, precio: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <select value={nuevoPlato.categoria} onChange={e => setNuevoPlato(p => ({ ...p, categoria: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="">— Categoría —</option>
                  {categorias.map((c, i) => <option key={i} value={c.nombre}>{c.nombre}</option>)}
                </select>
                <button
                  onClick={() => {
                    if (!nuevoPlato.nombre || !nuevoPlato.precio || !nuevoPlato.categoria) return
                    setPlatos(p => [...p, { ...nuevoPlato }])
                    setNuevoPlato({ nombre: '', precio: '', categoria: '' })
                  }}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2">
                  <Plus size={14} /> Agregar plato
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setPaso(2)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-2xl">← Atrás</button>
                <button onClick={guardarCarta} disabled={saving}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-200 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2">
                  {saving ? 'Guardando...' : <>Siguiente <ChevronRight size={16} /></>}
                </button>
              </div>
              <button onClick={() => setPaso(4)} className="w-full text-gray-400 text-sm hover:text-gray-600 text-center">Saltar este paso →</button>
            </>
          )}

          {/* ── Paso 4: ¡Listo! ── */}
          {paso === 4 && (
            <>
              <div className="text-center space-y-3 py-4">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <span className="text-4xl">🎉</span>
                </div>
                <h2 className="text-2xl font-black text-gray-900">¡Tu restaurante está listo!</h2>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Configuraste <strong>{nombreNegocio}</strong> con éxito. Ahora puedes empezar a tomar pedidos, gestionar tu cocina y mucho más.
                </p>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-bold text-purple-700 uppercase tracking-wide">Resumen</p>
                <div className="grid grid-cols-3 text-center gap-2">
                  <div className="bg-white rounded-xl p-2">
                    <p className="font-black text-gray-900 text-lg">{zonas.reduce((a, z) => a + z.mesas.filter(m => m.trim()).length, 0)}</p>
                    <p className="text-xs text-gray-400">Mesas</p>
                  </div>
                  <div className="bg-white rounded-xl p-2">
                    <p className="font-black text-gray-900 text-lg">{usuarios.length}</p>
                    <p className="text-xs text-gray-400">Usuarios</p>
                  </div>
                  <div className="bg-white rounded-xl p-2">
                    <p className="font-black text-gray-900 text-lg">{platos.length}</p>
                    <p className="text-xs text-gray-400">Platos</p>
                  </div>
                </div>
              </div>
              <button onClick={finalizar} disabled={saving}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-200 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 text-lg">
                {saving ? 'Entrando...' : '✨ Entrar al panel →'}
              </button>
            </>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-6">¿Necesitas ayuda? escríbenos por WhatsApp</p>
    </div>
  )
}
