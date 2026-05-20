'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plato, Categoria, Inventario } from '@/types'
import toast from 'react-hot-toast'
import { Plus, Minus, ShoppingBag, CheckCircle, ChevronLeft, User, Bell, RefreshCw } from 'lucide-react'
import { use } from 'react'

type ItemCarrito    = { plato: Plato; cantidad: number; notas: string }
type ItemSeguimiento = { id: string; nombre: string; cantidad: number; estado: string }

const ESTADO_CONFIG: Record<string, { label: string; dot: string; texto: string }> = {
  pendiente:       { label: 'Pendiente',    dot: 'bg-gray-300',                  texto: 'text-gray-400'  },
  en_preparacion:  { label: 'Preparando…',  dot: 'bg-orange-400 animate-pulse',  texto: 'text-orange-500' },
  listo:           { label: '¡Listo!',      dot: 'bg-green-500',                 texto: 'text-green-600' },
  entregado:       { label: 'Entregado',    dot: 'bg-green-300',                 texto: 'text-gray-400'  },
}

export default function MesaClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: mesaId } = use(params)

  // Flujo: menu → carrito → identificacion → seguimiento
  const [paso, setPaso] = useState<'menu' | 'carrito' | 'identificacion' | 'seguimiento'>('menu')

  // Datos del cliente
  const [cedula, setCedula]               = useState('')
  const [nombre, setNombre]               = useState('')
  const [telefono, setTelefono]           = useState('')
  const [fechaCumpleanos, setFechaCumpleanos] = useState('')
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [clienteExiste, setClienteExiste] = useState(false)

  // Menú y carrito
  const [categorias, setCategorias]       = useState<Categoria[]>([])
  const [platos, setPlatos]               = useState<(Plato & { inventario: Inventario[] })[]>([])
  const [categoriaActiva, setCategoriaActiva] = useState<number | null>(null)
  const [carrito, setCarrito]             = useState<ItemCarrito[]>([])
  const [mesa, setMesa]                   = useState<{ numero: number; estado: string } | null>(null)
  const [enviando, setEnviando]           = useState(false)

  // Seguimiento del pedido activo
  const [pedidoActualId, setPedidoActualId]       = useState<string | null>(null)
  const [itemsSeguimiento, setItemsSeguimiento]   = useState<ItemSeguimiento[]>([])
  const [llamadaEnviada, setLlamadaEnviada]       = useState(false)
  const [llamandoMesera, setLlamandoMesera]       = useState(false)

  // Detección de pedido duplicado
  const [pedidoActivoInfo, setPedidoActivoInfo]   = useState<{ id: string; tipo: string; itemCount: number } | null>(null)
  const [modalDuplicado, setModalDuplicado]       = useState(false)

  const supabase = createClient()

  // ── CARGA DEL MENÚ ──────────────────────────────────────────────────────────
  const cargarMenu = useCallback(async () => {
    const [{ data: cats }, { data: pls }, { data: mesaData }, { data: invData }] = await Promise.all([
      supabase.from('categorias').select('*').order('orden'),
      supabase.from('platos').select('*').eq('activo', true),
      supabase.from('mesas').select('numero, estado').eq('id', mesaId).single(),
      supabase.from('inventario').select('*'),
    ])
    if (cats) { setCategorias(cats); if (cats[0]) setCategoriaActiva(cats[0].id) }
    if (pls) {
      setPlatos(pls.map(p => ({
        ...p,
        inventario: (invData || []).filter((i: Inventario) => i.plato_id === p.id),
      })) as unknown as (Plato & { inventario: Inventario[] })[])
    }
    if (mesaData) {
      setMesa(mesaData as { numero: number; estado: string })
      // Si la mesa no está libre, verificar si hay pedido activo
      if ((mesaData as { estado: string }).estado !== 'libre') {
        const { data: pedidoActivo } = await supabase
          .from('pedidos')
          .select('id, tipo, items:items_pedido(id)')
          .eq('mesa_id', mesaId)
          .in('estado', ['pendiente', 'en_preparacion', 'listo', 'entregado'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (pedidoActivo) {
          const pa = pedidoActivo as { id: string; tipo: string; items: { id: string }[] }
          setPedidoActivoInfo({ id: pa.id, tipo: pa.tipo, itemCount: pa.items?.length ?? 0 })
          setModalDuplicado(true)
        }
      }
    }
  }, [supabase, mesaId])

  useEffect(() => { cargarMenu() }, [cargarMenu])

  // ── SEGUIMIENTO EN TIEMPO REAL ──────────────────────────────────────────────
  const cargarItemsSeguimiento = useCallback(async (pid: string) => {
    const { data } = await supabase
      .from('items_pedido')
      .select('id, cantidad, estado, plato:platos(nombre)')
      .eq('pedido_id', pid)
      .order('created_at')
    if (data) {
      setItemsSeguimiento(data.map(i => ({
        id:       i.id,
        nombre:   (i.plato as unknown as { nombre: string })?.nombre || '',
        cantidad: i.cantidad,
        estado:   i.estado,
      })))
    }
  }, [supabase])

  useEffect(() => {
    if (paso !== 'seguimiento' || !pedidoActualId) return
    const canal = supabase.channel(`seguimiento-${pedidoActualId}`)
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'items_pedido',
        filter: `pedido_id=eq.${pedidoActualId}`,
      }, (payload) => {
        const nuevo = payload.new as { id: string; estado: string }
        setItemsSeguimiento(prev =>
          prev.map(i => i.id === nuevo.id ? { ...i, estado: nuevo.estado } : i)
        )
      })
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'items_pedido',
        filter: `pedido_id=eq.${pedidoActualId}`,
      }, () => { cargarItemsSeguimiento(pedidoActualId) })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [paso, pedidoActualId, supabase, cargarItemsSeguimiento])

  // ── BUSCAR CLIENTE POR CÉDULA ───────────────────────────────────────────────
  async function buscarPorCedula(val: string) {
    if (val.length < 5) {
      setClienteExiste(false); setNombre(''); setTelefono(''); setFechaCumpleanos('')
      return
    }
    setBuscandoCliente(true)
    const { data } = await supabase.from('clientes').select('*').eq('cedula', val).single()
    if (data) {
      setNombre(data.nombre || '')
      setTelefono(data.telefono || '')
      setFechaCumpleanos(data.fecha_cumpleanos || '')
      setClienteExiste(true)
      toast.success(`¡Bienvenido de nuevo, ${data.nombre}!`)
    } else {
      setClienteExiste(false)
      setNombre(''); setTelefono(''); setFechaCumpleanos('')
    }
    setBuscandoCliente(false)
  }

  // ── CARRITO ─────────────────────────────────────────────────────────────────
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
    setCarrito(prev =>
      prev.map(i => i.plato.id === id ? { ...i, cantidad: Math.max(0, i.cantidad + delta) } : i)
          .filter(i => i.cantidad > 0)
    )
  }

  // ── ENVIAR PEDIDO NUEVO ─────────────────────────────────────────────────────
  async function enviarPedido() {
    if (!cedula.trim() || !nombre.trim() || !telefono.trim()) {
      toast.error('Completa todos los campos'); return
    }
    if (carrito.length === 0) return
    setEnviando(true)

    const { data: turno } = await supabase
      .from('turnos').select('id').is('cerrado_en', null)
      .order('abierto_en', { ascending: false }).limit(1).single()
    if (!turno) {
      toast.error('El restaurante no está recibiendo pedidos ahora')
      setEnviando(false); return
    }

    // Crear o actualizar cliente
    let clienteId: string | null = null
    const { data: clData } = await supabase.from('clientes').select('id').eq('cedula', cedula.trim()).single()
    if (clData) {
      clienteId = clData.id
      if (fechaCumpleanos)
        await supabase.from('clientes').update({ fecha_cumpleanos: fechaCumpleanos }).eq('id', clienteId)
    } else {
      const { data: nuevo } = await supabase.from('clientes').insert({
        cedula: cedula.trim(), nombre: nombre.trim(), telefono: telefono.trim(),
        fecha_cumpleanos: fechaCumpleanos || null,
      }).select('id').single()
      clienteId = nuevo?.id || null
    }

    const { data: pedido, error } = await supabase.from('pedidos').insert({
      mesa_id:          parseInt(mesaId),
      cliente_id:       clienteId,
      cliente_nombre:   nombre.trim(),
      cliente_cedula:   cedula.trim(),
      cliente_telefono: telefono.trim(),
      turno_id:         turno.id,
      tipo:             'cliente_qr',
    }).select().single()

    if (error || !pedido) {
      toast.error('Error al enviar el pedido. Avisa al mesero.')
      setEnviando(false); return
    }

    await supabase.from('items_pedido').insert(
      carrito.map(i => ({
        pedido_id:       pedido.id,
        plato_id:        i.plato.id,
        cantidad:        i.cantidad,
        precio_unitario: i.plato.precio,
        notas:           i.notas || null,
      }))
    )
    await supabase.from('mesas').update({ estado: 'ocupada' }).eq('id', mesaId)

    setPedidoActualId(pedido.id)
    await cargarItemsSeguimiento(pedido.id)
    setCarrito([])
    setPaso('seguimiento')
    setEnviando(false)
  }

  // ── AGREGAR MÁS AL PEDIDO EXISTENTE ────────────────────────────────────────
  async function agregarAlPedidoActual() {
    if (!pedidoActualId || carrito.length === 0) return
    setEnviando(true)
    await supabase.from('items_pedido').insert(
      carrito.map(i => ({
        pedido_id:       pedidoActualId,
        plato_id:        i.plato.id,
        cantidad:        i.cantidad,
        precio_unitario: i.plato.precio,
        notas:           i.notas || null,
      }))
    )
    await cargarItemsSeguimiento(pedidoActualId)
    setCarrito([])
    setPaso('seguimiento')
    setEnviando(false)
    toast.success('¡Platos agregados a tu pedido!')
  }

  // ── ACCIONES MODAL PEDIDO DUPLICADO ────────────────────────────────────────
  async function verPedidoActivo() {
    if (!pedidoActivoInfo) return
    setPedidoActualId(pedidoActivoInfo.id)
    await cargarItemsSeguimiento(pedidoActivoInfo.id)
    setModalDuplicado(false)
    setPaso('seguimiento')
  }

  function agregarAPedidoActivo() {
    if (!pedidoActivoInfo) return
    setPedidoActualId(pedidoActivoInfo.id)  // al ir al carrito y confirmar, usará agregarAlPedidoActual()
    setModalDuplicado(false)
  }

  // ── LLAMAR MESERA (tabla DB — confiable) ────────────────────────────────────
  async function llamarMesera() {
    if (llamadaEnviada || llamandoMesera || !mesa) return
    setLlamandoMesera(true)
    try {
      const { error } = await supabase.from('llamadas').insert({
        mesa_id:     parseInt(mesaId),
        mesa_numero: mesa.numero,
      })
      if (error) throw error
      setLlamadaEnviada(true)
      toast.success('¡Mesera notificada! En un momento viene.')
      setTimeout(() => setLlamadaEnviada(false), 60000) // puede llamar de nuevo en 1 min
    } catch {
      toast.error('No se pudo enviar la llamada')
    }
    setLlamandoMesera(false)
  }

  const platosFiltrados = platos.filter(p => p.categoria_id === categoriaActiva)
  const total           = carrito.reduce((a, i) => a + i.plato.precio * i.cantidad, 0)
  const totalItems      = carrito.reduce((a, i) => a + i.cantidad, 0)
  const todoEntregado   = itemsSeguimiento.length > 0 && itemsSeguimiento.every(i => i.estado === 'entregado')

  // ── SEGUIMIENTO ──────────────────────────────────────────────────────────────
  if (paso === 'seguimiento') return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 text-center shadow-sm">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2 ${todoEntregado ? 'bg-gray-400' : 'bg-green-500'}`}>
          <CheckCircle size={28} className="text-white" />
        </div>
        <h2 className="font-bold text-gray-900 text-lg">
          {todoEntregado ? '¡Buen provecho!' : '¡Pedido en preparación!'}
        </h2>
        {mesa && <p className="text-sm text-gray-400">Mesa {mesa.numero}</p>}
      </div>

      {/* Items con estado */}
      <div className="flex-1 p-4 space-y-2 pb-40">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Estado de tu pedido</p>
        {itemsSeguimiento.map(item => {
          const cfg = ESTADO_CONFIG[item.estado] || ESTADO_CONFIG.pendiente
          return (
            <div key={item.id} className="bg-white rounded-2xl px-4 py-3.5 border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900 text-sm">{item.cantidad}× {item.nombre}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                <span className={`text-xs font-semibold ${cfg.texto}`}>{cfg.label}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Acciones fijas abajo */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 space-y-3 shadow-xl">
        {/* Llamar mesera */}
        <button
          onClick={llamarMesera}
          disabled={llamadaEnviada || llamandoMesera}
          className={`w-full font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-base transition-all ${
            llamadaEnviada
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm'
          }`}
        >
          <Bell size={20} className={llamandoMesera ? 'animate-bounce' : ''} />
          {llamandoMesera ? 'Notificando…' : llamadaEnviada ? 'Llamada enviada ✓' : 'Llamar mesera'}
        </button>

        {/* Agregar más */}
        {!todoEntregado && (
          <button
            onClick={() => { setCarrito([]); setPaso('menu') }}
            className="w-full bg-white border-2 border-orange-200 text-orange-600 font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 text-sm hover:bg-orange-50 transition-colors"
          >
            <RefreshCw size={16} /> Agregar más platos
          </button>
        )}
      </div>
    </div>
  )

  // ── IDENTIFICACIÓN ──────────────────────────────────────────────────────────
  if (paso === 'identificacion') return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 shadow-sm">
        <button onClick={() => setPaso('carrito')} className="text-gray-400 hover:text-gray-600">
          <ChevronLeft size={22} />
        </button>
        <h2 className="font-bold text-gray-900">Un paso más</h2>
      </div>
      <div className="flex-1 flex items-start justify-center p-5 pt-8">
        <div className="w-full max-w-sm space-y-4 fade-in">
          <p className="text-center text-gray-500 text-sm">Necesitamos un par de datos para registrar tu pedido</p>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Cédula o documento</label>
            <div className="relative">
              <input type="number" placeholder="Número de cédula" value={cedula}
                onChange={e => { setCedula(e.target.value); buscarPorCedula(e.target.value) }}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white pr-10" />
              {buscandoCliente && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>

          {clienteExiste && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-3.5 flex items-center gap-2.5 text-green-700 text-sm font-medium">
              <User size={18} /> <span>¡Hola de nuevo, <strong>{nombre}</strong>!</span>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Nombre completo</label>
            <input type="text" placeholder="Tu nombre" value={nombre} onChange={e => setNombre(e.target.value)} readOnly={clienteExiste}
              className={`w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${clienteExiste ? 'bg-gray-50 text-gray-500' : 'bg-white'}`} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Teléfono</label>
            <input type="tel" placeholder="Tu número de celular" value={telefono} onChange={e => setTelefono(e.target.value)} readOnly={clienteExiste}
              className={`w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${clienteExiste ? 'bg-gray-50 text-gray-500' : 'bg-white'}`} />
          </div>
          {!clienteExiste && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Fecha de cumpleaños <span className="text-gray-300 font-normal normal-case">(opcional)</span>
              </label>
              <input type="date" value={fechaCumpleanos} onChange={e => setFechaCumpleanos(e.target.value)}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
            </div>
          )}

          <button onClick={enviarPedido} disabled={enviando || !cedula.trim() || !nombre.trim() || !telefono.trim()}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-base transition-colors mt-2">
            <CheckCircle size={20} />
            {enviando ? 'Enviando pedido…' : 'Confirmar pedido'}
          </button>
        </div>
      </div>
    </div>
  )

  // ── CARRITO ──────────────────────────────────────────────────────────────────
  if (paso === 'carrito') return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={() => setPaso('menu')} className="text-gray-400 hover:text-gray-600"><ChevronLeft size={22} /></button>
        <h2 className="font-bold text-gray-900">Tu pedido</h2>
        <span className="text-sm text-gray-400 ml-auto">{totalItems} {totalItems === 1 ? 'producto' : 'productos'}</span>
      </div>

      <div className="flex-1 p-4 space-y-3 pb-36">
        {carrito.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingBag size={44} className="mx-auto text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">Tu carrito está vacío</p>
            <button onClick={() => setPaso('menu')} className="mt-3 text-orange-500 font-semibold text-sm">← Volver al menú</button>
          </div>
        ) : carrito.map(item => (
          <div key={item.plato.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-gray-900">{item.plato.nombre}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => cambiarCantidad(item.plato.id, -1)} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center"><Minus size={12} /></button>
                <span className="font-bold w-5 text-center">{item.cantidad}</span>
                <button onClick={() => cambiarCantidad(item.plato.id, 1)} className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center"><Plus size={12} /></button>
              </div>
            </div>
            <p className="text-orange-500 text-sm font-bold">${(item.plato.precio * item.cantidad).toLocaleString('es-CO')}</p>
            <input type="text" placeholder="Nota especial (ej: sin cebolla)" value={item.notas}
              onChange={e => setCarrito(prev => prev.map(i => i.plato.id === item.plato.id ? { ...i, notas: e.target.value } : i))}
              className="mt-2.5 w-full text-sm border border-gray-100 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50" />
          </div>
        ))}
      </div>

      {carrito.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-xl">
          <div className="flex justify-between items-center mb-3">
            <span className="text-gray-600 font-medium">Total</span>
            <span className="text-xl font-black text-gray-900">${total.toLocaleString('es-CO')}</span>
          </div>
          {/* Si hay un pedido activo, agrega directo; si no, pide identificación */}
          {pedidoActualId ? (
            <button onClick={agregarAlPedidoActual} disabled={enviando}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-bold py-4 rounded-2xl text-base transition-colors">
              {enviando ? 'Agregando…' : 'Agregar al pedido ✓'}
            </button>
          ) : (
            <button onClick={() => setPaso('identificacion')}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 rounded-2xl text-base transition-colors">
              Continuar →
            </button>
          )}
        </div>
      )}
    </div>
  )

  // ── MENÚ ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div>
          <h1 className="font-bold text-gray-900">Las Delicias de Mirella</h1>
          {mesa && <p className="text-xs text-gray-400 mt-0.5">Mesa {mesa.numero}</p>}
        </div>
        <button onClick={() => setPaso('carrito')}
          className="relative bg-orange-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-sm">
          <ShoppingBag size={16} />
          Pedido
          {totalItems > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
              {totalItems}
            </span>
          )}
        </button>
      </div>

      <div className="flex gap-2 px-4 py-3 overflow-x-auto bg-white border-b shrink-0">
        {categorias.map(cat => (
          <button key={cat.id} onClick={() => setCategoriaActiva(cat.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              categoriaActiva === cat.id ? 'bg-orange-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {cat.nombre}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4 space-y-3">
        {platosFiltrados.map(plato => {
          const disp      = disponibilidad(plato)
          const sinStock  = disp === 0
          const enCarrito = carrito.find(i => i.plato.id === plato.id)
          return (
            <div key={plato.id} className={`bg-white rounded-2xl p-4 border flex items-center gap-3 shadow-sm transition-opacity ${sinStock ? 'opacity-50' : 'border-gray-100'}`}>
              {plato.imagen_url && <img src={plato.imagen_url} alt={plato.nombre} className="w-16 h-16 rounded-xl object-cover shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{plato.nombre}</p>
                {plato.descripcion && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{plato.descripcion}</p>}
                <p className="text-orange-500 font-bold mt-1.5">${plato.precio.toLocaleString('es-CO')}</p>
                {sinStock && <p className="text-red-500 text-xs font-semibold mt-0.5">No disponible</p>}
                {!sinStock && disp <= (plato.inventario?.[0]?.alerta_minima ?? 3) && (
                  <p className="text-yellow-600 text-xs mt-0.5">⚠️ Últimas unidades</p>
                )}
              </div>
              {!sinStock && (
                enCarrito ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => cambiarCantidad(plato.id, -1)} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center"><Minus size={14} /></button>
                    <span className="font-bold w-5 text-center">{enCarrito.cantidad}</span>
                    <button onClick={() => cambiarCantidad(plato.id, 1)} className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center"><Plus size={14} /></button>
                  </div>
                ) : (
                  <button onClick={() => agregar(plato)} className="w-9 h-9 bg-orange-500 text-white rounded-full flex items-center justify-center hover:bg-orange-600 shrink-0 shadow-sm">
                    <Plus size={18} />
                  </button>
                )
              )}
            </div>
          )
        })}
      </div>

      {/* ── MODAL: Pedido ya activo en esta mesa ── */}
      {modalDuplicado && pedidoActivoInfo && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm text-center space-y-4 fade-in shadow-2xl">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
              <span className="text-4xl">⚠️</span>
            </div>
            <div>
              <p className="text-xl font-black text-gray-900">¡Esta mesa ya tiene un pedido!</p>
              <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                {pedidoActivoInfo.tipo === 'mesera'
                  ? 'La mesera ya tomó un pedido para esta mesa'
                  : 'Ya hay un pedido activo en esta mesa'
                }{' '}con{' '}
                <span className="font-bold text-gray-700">
                  {pedidoActivoInfo.itemCount} plato{pedidoActivoInfo.itemCount !== 1 ? 's' : ''}
                </span>{' '}en preparación.
              </p>
            </div>
            <div className="space-y-2.5">
              <button onClick={verPedidoActivo}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 transition-colors">
                👀 Ver estado de mi pedido
              </button>
              <button onClick={agregarAPedidoActivo}
                className="w-full bg-white border-2 border-orange-200 text-orange-600 font-bold py-3.5 rounded-2xl text-sm hover:bg-orange-50 flex items-center justify-center gap-2 transition-colors">
                ➕ Agregar más platos al pedido
              </button>
              <button onClick={() => setModalDuplicado(false)}
                className="w-full text-gray-400 text-xs py-2 hover:text-gray-600 transition-colors">
                Continuar de todos modos (pedido nuevo)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
