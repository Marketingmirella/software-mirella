'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plato, Categoria, Inventario } from '@/types'
import toast from 'react-hot-toast'
import { UtensilsCrossed, Plus, Minus, ShoppingBag, CheckCircle, X, User } from 'lucide-react'
import { use } from 'react'

type ItemCarrito = { plato: Plato; cantidad: number; notas: string }

export default function MesaClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: mesaId } = use(params)

  const [paso, setPaso] = useState<'identificacion' | 'menu' | 'carrito' | 'confirmado'>('identificacion')
  const [cedula, setCedula] = useState('')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [clienteExiste, setClienteExiste] = useState(false)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [platos, setPlatos] = useState<(Plato & { inventario: Inventario[] })[]>([])
  const [categoriaActiva, setCategoriaActiva] = useState<number | null>(null)
  const [carrito, setCarrito] = useState<ItemCarrito[]>([])
  const [mesa, setMesa] = useState<{ numero: number } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const supabase = createClient()

  const cargarMenu = useCallback(async () => {
    const [{ data: cats }, { data: pls }, { data: mesaData }, { data: invData }] = await Promise.all([
      supabase.from('categorias').select('*').order('orden'),
      supabase.from('platos').select('*').eq('activo', true),
      supabase.from('mesas').select('numero').eq('id', mesaId).single(),
      supabase.from('inventario').select('*'),
    ])
    if (cats) { setCategorias(cats); if (cats[0]) setCategoriaActiva(cats[0].id) }
    if (pls) {
      const platosConInv = pls.map(p => ({
        ...p,
        inventario: (invData || []).filter((i: Inventario) => i.plato_id === p.id)
      }))
      setPlatos(platosConInv as unknown as (Plato & { inventario: Inventario[] })[])
    }
    if (mesaData) setMesa(mesaData)
  }, [supabase, mesaId])

  useEffect(() => { cargarMenu() }, [cargarMenu])

  async function buscarPorCedula() {
    if (cedula.length < 5) return
    setBuscandoCliente(true)
    const { data } = await supabase.from('clientes').select('*').eq('cedula', cedula).single()
    if (data) {
      setNombre(data.nombre)
      setTelefono(data.telefono)
      setFechaNacimiento(data.fecha_nacimiento || '')
      setClienteExiste(true)
      toast.success(`¡Bienvenido de nuevo, ${data.nombre}!`)
    } else {
      setClienteExiste(false)
      setNombre(''); setTelefono(''); setFechaNacimiento('')
    }
    setBuscandoCliente(false)
  }

  async function continuar() {
    if (!cedula || !nombre || !telefono) { toast.error('Por favor completa todos los campos'); return }

    if (!clienteExiste) {
      await supabase.from('clientes').insert({ cedula, nombre, telefono, fecha_nacimiento: fechaNacimiento || null })
    }
    setPaso('menu')
  }

  function disponibilidad(plato: Plato & { inventario: Inventario[] }) {
    return plato.inventario?.[0]?.cantidad_disponible ?? 0
  }

  function agregar(plato: Plato) {
    setCarrito(prev => {
      const existe = prev.find(i => i.plato.id === plato.id)
      if (existe) return prev.map(i => i.plato.id === plato.id ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...prev, { plato, cantidad: 1, notas: '' }]
    })
  }

  function cambiarCantidad(id: string, delta: number) {
    setCarrito(prev => prev.map(i => i.plato.id === id ? { ...i, cantidad: Math.max(0, i.cantidad + delta) } : i).filter(i => i.cantidad > 0))
  }

  async function enviarPedido() {
    if (carrito.length === 0) return
    setEnviando(true)

    const { data: turno } = await supabase.from('turnos').select('id').is('cerrado_en', null).order('abierto_en', { ascending: false }).limit(1).single()
    if (!turno) { toast.error('El restaurante no está recibiendo pedidos ahora'); setEnviando(false); return }

    const { data: clienteData } = await supabase.from('clientes').select('id').eq('cedula', cedula).single()

    const { data: pedido, error } = await supabase
      .from('pedidos')
      .insert({ mesa_id: parseInt(mesaId), cliente_id: clienteData?.id, turno_id: turno.id, tipo: 'cliente_qr' })
      .select().single()

    if (error || !pedido) { toast.error('Error al enviar pedido'); setEnviando(false); return }

    await supabase.from('items_pedido').insert(
      carrito.map(item => ({ pedido_id: pedido.id, plato_id: item.plato.id, cantidad: item.cantidad, precio_unitario: item.plato.precio, notas: item.notas || null }))
    )
    await supabase.from('mesas').update({ estado: 'ocupada' }).eq('id', mesaId)

    setPaso('confirmado')
    setEnviando(false)
  }

  const platosFiltrados = platos.filter(p => p.categoria_id === categoriaActiva)
  const total = carrito.reduce((a, i) => a + i.plato.precio * i.cantidad, 0)

  // ── CONFIRMADO ───────────────────────────────────────────────
  if (paso === 'confirmado') return (
    <div className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
      <div className="text-center fade-in">
        <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
          <CheckCircle size={40} className="text-white" />
        </div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">¡Pedido recibido!</h2>
        <p className="text-gray-500 mb-1">Tu pedido está siendo preparado.</p>
        <p className="text-gray-500 text-sm">El mesero te avisará cuando esté listo.</p>
        <div className="mt-6 bg-white rounded-2xl p-4 border border-gray-100 text-left space-y-1">
          {carrito.map(i => (
            <p key={i.plato.id} className="text-sm text-gray-700">• {i.cantidad}x {i.plato.nombre}</p>
          ))}
          <p className="font-bold text-gray-900 pt-2 border-t mt-2">Total: ${total.toLocaleString('es-CO')}</p>
        </div>
      </div>
    </div>
  )

  // ── IDENTIFICACIÓN ───────────────────────────────────────────
  if (paso === 'identificacion') return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm fade-in">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <UtensilsCrossed size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-black text-gray-900">Bienvenido</h1>
          {mesa && <p className="text-gray-500 text-sm">Mesa {mesa.numero}</p>}
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Cédula</label>
            <div className="flex gap-2">
              <input type="number" placeholder="Ingresa tu cédula" value={cedula} onChange={e => setCedula(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              <button onClick={buscarPorCedula} disabled={buscandoCliente} className="bg-orange-500 text-white px-4 rounded-xl text-sm font-medium">
                {buscandoCliente ? '...' : 'Buscar'}
              </button>
            </div>
          </div>

          {clienteExiste && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2 text-green-700 text-sm">
              <User size={16} /> ¡Ya te tenemos registrado!
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Nombre completo</label>
            <input type="text" placeholder="Tu nombre" value={nombre} onChange={e => setNombre(e.target.value)} readOnly={clienteExiste}
              className={`w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${clienteExiste ? 'bg-gray-50' : ''}`} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Teléfono</label>
            <input type="tel" placeholder="Tu teléfono" value={telefono} onChange={e => setTelefono(e.target.value)} readOnly={clienteExiste}
              className={`w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${clienteExiste ? 'bg-gray-50' : ''}`} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Fecha de cumpleaños <span className="text-gray-400">(opcional)</span></label>
            <input type="date" value={fechaNacimiento} onChange={e => setFechaNacimiento(e.target.value)} readOnly={clienteExiste}
              className={`w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${clienteExiste ? 'bg-gray-50' : ''}`} />
          </div>
          <button onClick={continuar} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl">
            Ver menú →
          </button>
        </div>
      </div>
    </div>
  )

  // ── CARRITO ──────────────────────────────────────────────────
  if (paso === 'carrito') return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => setPaso('menu')}><X size={22} className="text-gray-400" /></button>
        <h2 className="font-bold">Tu pedido</h2>
      </div>
      <div className="flex-1 p-4 space-y-3">
        {carrito.map(item => (
          <div key={item.plato.id} className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-gray-900">{item.plato.nombre}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => cambiarCantidad(item.plato.id, -1)} className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center"><Minus size={12} /></button>
                <span className="font-bold">{item.cantidad}</span>
                <button onClick={() => cambiarCantidad(item.plato.id, 1)} className="w-7 h-7 bg-orange-500 text-white rounded-full flex items-center justify-center"><Plus size={12} /></button>
              </div>
            </div>
            <p className="text-orange-500 text-sm font-bold">${(item.plato.precio * item.cantidad).toLocaleString('es-CO')}</p>
            <input type="text" placeholder="Nota especial (ej: sin cebolla)" value={item.notas}
              onChange={e => setCarrito(prev => prev.map(i => i.plato.id === item.plato.id ? { ...i, notas: e.target.value } : i))}
              className="mt-2 w-full text-sm border border-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300" />
          </div>
        ))}
      </div>
      <div className="bg-white border-t p-4">
        <div className="flex justify-between mb-3">
          <span className="text-gray-600">Total</span>
          <span className="text-xl font-black">${total.toLocaleString('es-CO')}</span>
        </div>
        <button onClick={enviarPedido} disabled={enviando} className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-lg">
          <CheckCircle size={22} /> {enviando ? 'Enviando...' : 'Confirmar pedido'}
        </button>
      </div>
    </div>
  )

  // ── MENÚ ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <h2 className="font-bold text-gray-900">Menú {mesa ? `— Mesa ${mesa.numero}` : ''}</h2>
        <button onClick={() => setPaso('carrito')} className="relative bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2">
          <ShoppingBag size={16} />
          Pedido
          {carrito.length > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">{carrito.reduce((a, i) => a + i.cantidad, 0)}</span>}
        </button>
      </div>

      <div className="flex gap-2 px-4 py-3 overflow-x-auto bg-white border-b">
        {categorias.map(cat => (
          <button key={cat.id} onClick={() => setCategoriaActiva(cat.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${categoriaActiva === cat.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {cat.nombre}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4 space-y-3">
        {platosFiltrados.map(plato => {
          const disp = disponibilidad(plato)
          const sinStock = disp === 0
          const enCarrito = carrito.find(i => i.plato.id === plato.id)

          return (
            <div key={plato.id} className={`bg-white rounded-2xl p-4 border flex items-center gap-3 ${sinStock ? 'opacity-50' : 'border-gray-100'}`}>
              {plato.imagen_url && <img src={plato.imagen_url} alt={plato.nombre} className="w-16 h-16 rounded-xl object-cover" />}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{plato.nombre}</p>
                {plato.descripcion && <p className="text-xs text-gray-400 truncate">{plato.descripcion}</p>}
                <p className="text-orange-500 font-bold mt-1">${plato.precio.toLocaleString('es-CO')}</p>
                {sinStock && <p className="text-red-500 text-xs font-semibold">No disponible</p>}
                {!sinStock && disp <= (plato.inventario?.[0]?.alerta_minima ?? 3) && <p className="text-yellow-600 text-xs">⚠️ Quedan {disp}</p>}
              </div>
              {!sinStock && (
                enCarrito ? (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => cambiarCantidad(plato.id, -1)} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center"><Minus size={14} /></button>
                    <span className="font-bold w-4 text-center">{enCarrito.cantidad}</span>
                    <button onClick={() => cambiarCantidad(plato.id, 1)} className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center"><Plus size={14} /></button>
                  </div>
                ) : (
                  <button onClick={() => agregar(plato)} className="w-9 h-9 bg-orange-500 text-white rounded-full flex items-center justify-center hover:bg-orange-600"><Plus size={18} /></button>
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
