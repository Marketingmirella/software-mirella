'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plato, Categoria, Inventario } from '@/types'
import toast from 'react-hot-toast'
import {
  Bike, Bell, X, Plus, Minus, ShoppingBag, CheckCircle,
  Clock, Package, Navigation, RefreshCw
} from 'lucide-react'

type ItemCarrito = { plato: Plato; cantidad: number; notas: string }

interface PedidoDomi {
  id: string
  estado: string
  created_at: string
  cliente_nombre: string | null
  cliente_telefono: string | null
  cliente_direccion: string | null
  metodo_pago_cliente: string | null
  comprobante_url: string | null
  total: number
  items: { nombre: string; cantidad: number }[]
}

interface NotifCocina {
  id: number
  pedidoId: string
  clienteNombre: string
  platoNombre: string
  pendientes: string[]
}

export default function DomiPage() {
  const [vista, setVista] = useState<'pedidos' | 'menu' | 'carrito'>('pedidos')
  const [pedidosActivos, setPedidosActivos] = useState<PedidoDomi[]>([])
  const [pedidosEntregados, setPedidosEntregados] = useState<PedidoDomi[]>([])
  const [notifs, setNotifs] = useState<NotifCocina[]>([])

  // Carrito / nuevo pedido
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [platos, setPlatos] = useState<(Plato & { inventario: Inventario[] })[]>([])
  const [categoriaActiva, setCategoriaActiva] = useState<number | null>(null)
  const [carrito, setCarrito] = useState<ItemCarrito[]>([])
  const [clienteDomi, setClienteDomi] = useState({ nombre: '', telefono: '', direccion: '', cedula: '' })
  const [notaGeneral, setNotaGeneral] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [marcandoId, setMarcandoId] = useState<string | null>(null)

  const supabase = createClient()

  // ── CARGAR PEDIDOS DOMI ACTIVOS ───────────────────────────────
  const cargarPedidos = useCallback(async () => {
    const hoy = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('pedidos')
      .select('id, estado, created_at, cliente_nombre, cliente_telefono, cliente_direccion, metodo_pago_cliente, comprobante_url, items:items_pedido(cantidad, precio_unitario, plato:platos(nombre))')
      .eq('tipo', 'domi')
      .gte('created_at', `${hoy}T00:00:00`)
      .order('created_at', { ascending: true })

    if (!data) return
    const mapear = (p: unknown): PedidoDomi => {
      const ped = p as {
        id: string; estado: string; created_at: string
        cliente_nombre: string | null; cliente_telefono: string | null
        cliente_direccion: string | null; metodo_pago_cliente: string | null
        comprobante_url: string | null
        items: { cantidad: number; precio_unitario: number; plato: { nombre: string } }[]
      }
      return {
        id: ped.id, estado: ped.estado, created_at: ped.created_at,
        cliente_nombre: ped.cliente_nombre, cliente_telefono: ped.cliente_telefono,
        cliente_direccion: ped.cliente_direccion, metodo_pago_cliente: ped.metodo_pago_cliente,
        comprobante_url: ped.comprobante_url,
        total: ped.items?.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0) ?? 0,
        items: ped.items?.map(i => ({ nombre: i.plato?.nombre || '', cantidad: i.cantidad })) ?? [],
      }
    }
    const todos = data.map(mapear)
    setPedidosActivos(todos.filter(p => ['pendiente', 'en_preparacion', 'listo'].includes(p.estado)))
    setPedidosEntregados(todos.filter(p => ['entregado', 'pagado'].includes(p.estado)).slice(0, 8))
  }, [supabase])

  // ── CARGAR MENÚ ───────────────────────────────────────────────
  const cargarMenu = useCallback(async () => {
    const [{ data: cats }, { data: pls }, { data: inv }] = await Promise.all([
      supabase.from('categorias').select('*').order('orden'),
      supabase.from('platos').select('*').eq('activo', true),
      supabase.from('inventario').select('*'),
    ])
    if (cats) { setCategorias(cats); if (!categoriaActiva && cats[0]) setCategoriaActiva(cats[0].id) }
    if (pls) setPlatos(pls.map(p => ({ ...p, inventario: (inv || []).filter((i: Inventario) => i.plato_id === p.id) })) as unknown as (Plato & { inventario: Inventario[] })[])
  }, [supabase, categoriaActiva])

  useEffect(() => {
    cargarPedidos()
    cargarMenu()

    const canal = supabase.channel('domi-pedidos-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, cargarPedidos)
      .subscribe()

    // Notificaciones cuando cocina termina un ítem de pedido domi
    const canalItems = supabase.channel('domi-items-rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'items_pedido' }, (payload) => {
        const item = payload.new as { id: string; estado: string; pedido_id: string }
        if (item.estado !== 'listo') return
        supabase
          .from('pedidos')
          .select('tipo, cliente_nombre, items:items_pedido(id, estado, plato:platos(nombre))')
          .eq('id', item.pedido_id)
          .maybeSingle()
          .then(({ data: pedido }) => {
            if (!pedido) return
            const p = pedido as unknown as {
              tipo: string; cliente_nombre: string | null
              items: { id: string; estado: string; plato: { nombre: string } }[]
            }
            if (p.tipo !== 'domi') return // solo pedidos domi

            const itemListo = p.items.find(i => i.id === item.id)
            const platoNombre = itemListo?.plato?.nombre ?? 'Plato'
            const pendientes = p.items
              .filter(i => i.estado === 'pendiente' || i.estado === 'en_preparacion')
              .map(i => i.plato.nombre)

            const notifId = Date.now()
            setNotifs(prev => [...prev, {
              id: notifId, pedidoId: item.pedido_id,
              clienteNombre: p.cliente_nombre || 'Cliente',
              platoNombre, pendientes,
            }])
            setTimeout(() => setNotifs(prev => prev.filter(n => n.id !== notifId)), 45000)
          })
      })
      .subscribe()

    return () => { supabase.removeChannel(canal); supabase.removeChannel(canalItems) }
  }, [cargarPedidos, cargarMenu, supabase])

  // ── MARCAR "SALIÓ A ENTREGAR" ─────────────────────────────────
  async function salioAEntregar(pedidoId: string) {
    setMarcandoId(pedidoId)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('pedidos').update({
      estado: 'entregado',
      domi_tomado_en: new Date().toISOString(),
      mesera_id: user?.id ?? null,
    }).eq('id', pedidoId)
    toast.success('🛵 ¡El cliente fue notificado!')
    setMarcandoId(null)
    cargarPedidos()
  }

  // ── CARRITO ───────────────────────────────────────────────────
  function stockDisponible(platoId: string): number {
    const p = platos.find(pl => pl.id === platoId)
    return p?.inventario?.[0]?.cantidad_disponible ?? 0
  }

  function agregarAlCarrito(plato: Plato) {
    const disp = stockDisponible(plato.id)
    const enCarrito = carrito.find(i => i.plato.id === plato.id)?.cantidad ?? 0
    if (enCarrito >= disp) {
      toast.error(`Solo hay ${disp} unidad(es) disponible(s) de ${plato.nombre}`)
      return
    }
    setCarrito(prev => {
      const existe = prev.find(i => i.plato.id === plato.id)
      if (existe) return prev.map(i => i.plato.id === plato.id ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...prev, { plato, cantidad: 1, notas: '' }]
    })
    toast.success(`${plato.nombre} agregado`)
  }

  function cambiarCantidad(id: string, delta: number) {
    if (delta > 0) {
      const disp = stockDisponible(id)
      const enCarrito = carrito.find(i => i.plato.id === id)?.cantidad ?? 0
      if (enCarrito >= disp) {
        toast.error('No hay más unidades disponibles')
        return
      }
    }
    setCarrito(prev => prev.map(i => i.plato.id === id ? { ...i, cantidad: Math.max(0, i.cantidad + delta) } : i).filter(i => i.cantidad > 0))
  }

  // ── ENVIAR PEDIDO ─────────────────────────────────────────────
  async function enviarPedido() {
    if (carrito.length === 0) return
    if (!clienteDomi.nombre.trim() || !clienteDomi.telefono.trim() || !clienteDomi.direccion.trim()) {
      toast.error('Nombre, teléfono y dirección son obligatorios'); return
    }
    setEnviando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: turno } = await supabase.from('turnos').select('id').is('cerrado_en', null)
      .order('abierto_en', { ascending: false }).limit(1).single()
    if (!turno) { toast.error('No hay turno abierto. El gerente debe abrir caja.'); setEnviando(false); return }

    const { data: pedido, error } = await supabase.from('pedidos').insert({
      mesera_id: user?.id,
      turno_id: turno.id,
      tipo: 'domi',
      notas: notaGeneral || null,
      cliente_nombre:    clienteDomi.nombre.trim(),
      cliente_cedula:    clienteDomi.cedula.trim() || null,
      cliente_telefono:  clienteDomi.telefono.trim(),
      cliente_direccion: clienteDomi.direccion.trim(),
    }).select().single()

    if (error || !pedido) { toast.error('Error al crear el pedido'); setEnviando(false); return }

    await supabase.from('items_pedido').insert(
      carrito.map(item => ({
        pedido_id: pedido.id,
        plato_id: item.plato.id,
        cantidad: item.cantidad,
        precio_unitario: item.plato.precio,
        notas: item.notas || null,
      }))
    )
    toast.success('🛵 ¡Domi enviado a cocina!')
    setCarrito([]); setClienteDomi({ nombre: '', telefono: '', direccion: '', cedula: '' })
    setNotaGeneral(''); setVista('pedidos')
    cargarPedidos()
    setEnviando(false)
  }

  const totalCarrito = carrito.reduce((a, i) => a + i.plato.precio * i.cantidad, 0)
  const platosFiltrados = platos.filter(p => p.categoria_id === categoriaActiva)

  // ── VISTA: MENÚ ───────────────────────────────────────────────
  if (vista === 'menu') return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <button onClick={() => { setVista('pedidos'); setCarrito([]) }} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
          <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">🛵 DOMI</span>
        </div>
        <button onClick={() => setVista('carrito')}
          className="relative bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2">
          <ShoppingBag size={16} /> Ver pedido
          {carrito.length > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">{carrito.length}</span>}
        </button>
      </div>
      <div className="flex gap-2 px-4 py-3 overflow-x-auto bg-white border-b">
        {categorias.map(cat => (
          <button key={cat.id} onClick={() => setCategoriaActiva(cat.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${categoriaActiva === cat.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {cat.nombre}
          </button>
        ))}
      </div>
      <div className="flex-1 p-4 space-y-3">
        {platosFiltrados.map(plato => {
          const invRow = plato.inventario?.[0] as { cantidad_disponible: number; alerta_minima: number } | undefined
          const disp = invRow?.cantidad_disponible ?? 0
          const alerta = invRow?.alerta_minima ?? 3
          const sinStock = disp === 0
          const stockBajo = !sinStock && disp <= alerta
          const enCarrito = carrito.find(i => i.plato.id === plato.id)
          return (
            <div key={plato.id} className={`bg-white rounded-2xl p-4 border flex items-center gap-3 ${sinStock ? 'opacity-50' : 'border-gray-100'}`}>
              {plato.imagen_url && <img src={plato.imagen_url} alt={plato.nombre} className="w-14 h-14 rounded-xl object-cover" />}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{plato.nombre}</p>
                <p className="text-blue-600 font-bold text-sm mt-0.5">${plato.precio.toLocaleString('es-CO')}</p>
                {sinStock && <p className="text-red-500 text-xs font-semibold">Sin disponibilidad</p>}
                {stockBajo && <p className="text-yellow-600 text-xs font-semibold">⚠️ Quedan {disp}</p>}
                {!sinStock && !stockBajo && <p className="text-gray-400 text-xs">{disp} disponibles</p>}
              </div>
              {!sinStock && (enCarrito ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => cambiarCantidad(plato.id, -1)} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center"><Minus size={14} /></button>
                  <span className="font-bold w-4 text-center">{enCarrito.cantidad}</span>
                  <button onClick={() => cambiarCantidad(plato.id, 1)} className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center"><Plus size={14} /></button>
                </div>
              ) : (
                <button onClick={() => agregarAlCarrito(plato)} className="w-9 h-9 bg-blue-600 text-white rounded-full flex items-center justify-center"><Plus size={18} /></button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )

  // ── VISTA: CARRITO ────────────────────────────────────────────
  if (vista === 'carrito') return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => setVista('menu')} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
        <h2 className="font-bold text-gray-900">Confirmar domi</h2>
      </div>
      <div className="flex-1 p-4 space-y-3 pb-36">
        {carrito.map(item => {
          const dispCarrito = stockDisponible(item.plato.id)
          return (
          <div key={item.plato.id} className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-gray-900">{item.plato.nombre}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => cambiarCantidad(item.plato.id, -1)} className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center"><Minus size={12} /></button>
                <span className="font-bold">{item.cantidad}</span>
                <button onClick={() => cambiarCantidad(item.plato.id, 1)} disabled={item.cantidad >= dispCarrito} className="w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center disabled:opacity-40"><Plus size={12} /></button>
              </div>
            </div>
            <p className="text-blue-600 text-sm font-semibold">${(item.plato.precio * item.cantidad).toLocaleString('es-CO')}</p>
            <input type="text" placeholder="Nota (ej: sin sal)" value={item.notas}
              onChange={e => setCarrito(prev => prev.map(i => i.plato.id === item.plato.id ? { ...i, notas: e.target.value } : i))}
              className="mt-2 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          )
        })}

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-bold text-blue-800">🛵 Datos del cliente</p>
          <input type="text" placeholder="Nombre *" value={clienteDomi.nombre}
            onChange={e => setClienteDomi(p => ({ ...p, nombre: e.target.value }))}
            className="w-full text-sm border border-blue-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <input type="tel" placeholder="Teléfono *" value={clienteDomi.telefono}
            onChange={e => setClienteDomi(p => ({ ...p, telefono: e.target.value }))}
            className="w-full text-sm border border-blue-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <input type="text" placeholder="Dirección de entrega *" value={clienteDomi.direccion}
            onChange={e => setClienteDomi(p => ({ ...p, direccion: e.target.value }))}
            className="w-full text-sm border border-blue-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <input type="text" placeholder="Cédula (opcional)" value={clienteDomi.cedula}
            onChange={e => setClienteDomi(p => ({ ...p, cedula: e.target.value }))}
            className="w-full text-sm border border-blue-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <textarea placeholder="Nota general..." value={notaGeneral} onChange={e => setNotaGeneral(e.target.value)} rows={2}
            className="w-full text-sm border border-blue-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
        <div className="flex justify-between items-center mb-3">
          <span className="text-gray-600 font-medium">Total</span>
          <span className="text-xl font-black">${totalCarrito.toLocaleString('es-CO')}</span>
        </div>
        <button onClick={enviarPedido} disabled={enviando || carrito.length === 0}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-lg">
          <Bike size={22} /> {enviando ? 'Enviando...' : 'Enviar domi a cocina'}
        </button>
      </div>
    </div>
  )

  // ── VISTA: PEDIDOS (principal) ────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100 p-4 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl"><Bike size={24} className="text-white" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Panel Domi</h1>
            <p className="text-xs text-gray-400">{pedidosActivos.length} activo(s) hoy</p>
          </div>
        </div>
        <button onClick={() => { setCarrito([]); setClienteDomi({ nombre: '', telefono: '', direccion: '', cedula: '' }); setVista('menu') }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm">
          <Plus size={16} /> Nuevo domi
        </button>
      </div>

      {/* Notificaciones de cocina */}
      {notifs.length > 0 && (
        <div className="mb-4 space-y-2">
          {notifs.map(n => (
            <div key={n.id} className="bg-green-50 border-2 border-green-400 rounded-2xl px-4 py-3 flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm font-black text-green-900">
                  🍽️ <span className="text-blue-700">{n.platoNombre}</span> del pedido de {n.clienteNombre} está listo
                </p>
                {n.pendientes.length > 0
                  ? <p className="text-xs text-orange-600 font-semibold mt-1">⏳ Faltan: {n.pendientes.join(', ')}</p>
                  : <p className="text-xs text-green-600 font-bold mt-1">✅ ¡Pedido completo! Ya puedes salir</p>
                }
              </div>
              <button onClick={() => setNotifs(prev => prev.filter(x => x.id !== n.id))} className="text-green-300 hover:text-green-600 shrink-0"><X size={16} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Pedidos activos */}
      {pedidosActivos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Package size={48} className="mb-3" />
          <p className="text-lg font-medium">Sin pedidos activos</p>
          <p className="text-sm">Los pedidos aparecerán aquí en tiempo real</p>
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 px-1">Pedidos activos</h2>
          {pedidosActivos.map(ped => {
            const mins = Math.floor((Date.now() - new Date(ped.created_at).getTime()) / 60000)
            const esListo = ped.estado === 'listo'
            const esPendiente = ped.estado === 'pendiente'
            return (
              <div key={ped.id} className={`rounded-2xl border-2 p-4 ${esListo ? 'bg-green-50 border-green-400' : esPendiente ? 'bg-white border-gray-200' : 'bg-orange-50 border-orange-300'}`}>
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-gray-900 text-base truncate">{ped.cliente_nombre || 'Sin nombre'}</p>
                    {ped.cliente_telefono && <p className="text-xs text-gray-500">📞 {ped.cliente_telefono}</p>}
                    {ped.cliente_direccion && <p className="text-xs text-gray-500 mt-0.5">📍 {ped.cliente_direccion}</p>}
                    {ped.metodo_pago_cliente && (
                      <p className="text-xs mt-0.5">
                        {ped.metodo_pago_cliente === 'efectivo' ? '💵 Efectivo' : `📲 ${ped.metodo_pago_cliente}`}
                        {ped.comprobante_url && <span className="ml-1 text-green-600 font-semibold">· Comprobante enviado ✓</span>}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${esListo ? 'bg-green-200 text-green-800' : esPendiente ? 'bg-gray-100 text-gray-600' : 'bg-orange-100 text-orange-700'}`}>
                      {esListo ? '✅ LISTO' : esPendiente ? '⏳ Espera' : '🔥 Prep.'}
                    </span>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1 justify-end"><Clock size={11} />{mins} min</p>
                  </div>
                </div>

                <div className="text-xs text-gray-500 mb-3 flex flex-wrap gap-1">
                  {ped.items.map((it, i) => (
                    <span key={i} className="bg-gray-100 px-2 py-0.5 rounded-full">{it.cantidad}× {it.nombre}</span>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-black text-gray-900">${ped.total.toLocaleString('es-CO')}</span>
                  {esListo && (
                    <button
                      onClick={() => salioAEntregar(ped.id)}
                      disabled={marcandoId === ped.id}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors">
                      <Navigation size={16} />
                      {marcandoId === ped.id ? 'Marcando...' : '🛵 Salió a entregar'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Historial del día */}
      {pedidosEntregados.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 px-1 mb-2">Entregados hoy</h2>
          <div className="space-y-2">
            {pedidosEntregados.map(ped => (
              <div key={ped.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-700 text-sm">{ped.cliente_nombre || 'Sin nombre'}</p>
                  <p className="text-xs text-gray-400">{ped.cliente_direccion}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900 text-sm">${ped.total.toLocaleString('es-CO')}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${ped.estado === 'pagado' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    {ped.estado === 'pagado' ? 'Pagado' : 'Entregado'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Botón refrescar manual */}
      <button onClick={cargarPedidos} className="fixed bottom-6 right-6 w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-blue-700 transition-colors">
        <RefreshCw size={20} />
      </button>
    </div>
  )
}
