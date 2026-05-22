'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Mesa, Plato, Categoria, Inventario } from '@/types'
import toast from 'react-hot-toast'
import { UtensilsCrossed, ShoppingBag, Bell, CheckCircle, X, Plus, Minus, Bike } from 'lucide-react'

type ItemCarrito = { plato: Plato; cantidad: number; notas: string }

export default function MeseraPage() {
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [mesaSeleccionada, setMesaSeleccionada] = useState<Mesa | null>(null)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [platos, setPlatos] = useState<(Plato & { inventario: Inventario[] })[]>([])
  const [categoriaActiva, setCategoriaActiva] = useState<number | null>(null)
  const [carrito, setCarrito] = useState<ItemCarrito[]>([])
  const [notaGeneral, setNotaGeneral] = useState('')
  const [pedidosListos, setPedidosListos] = useState<{ id: string; mesa: number }[]>([])
  const [vista, setVista] = useState<'mesas' | 'menu' | 'carrito'>('mesas')
  const [enviando, setEnviando] = useState(false)
  const [modoDomi, setModoDomi] = useState(false)
  const [domiCliente, setDomiCliente] = useState({ nombre: '', cedula: '', telefono: '', direccion: '' })

  // Mesa ocupada — pedido existente
  const [modalMesaOcupada, setModalMesaOcupada] = useState(false)
  const [pedidoExistenteId, setPedidoExistenteId] = useState<string | null>(null)
  const [mesaTemporal, setMesaTemporal] = useState<Mesa | null>(null)

  // Llamadas de clientes
  const [llamadasPendientes, setLlamadasPendientes] = useState<{ id: number; mesa_numero: number }[]>([])

  // Notificaciones de cocina: un plato específico quedó listo
  const [notifsCocina, setNotifsCocina] = useState<{
    id: number; mesa_numero: number; plato_nombre: string; pendientes: string[]
  }[]>([])

  const supabase = createClient()

  const cargarDatos = useCallback(async () => {
    const [{ data: mesasData }, { data: catData }, { data: platosData }, { data: invData }] = await Promise.all([
      supabase.from('mesas').select('*').order('numero'),
      supabase.from('categorias').select('*').order('orden'),
      supabase.from('platos').select('*').eq('activo', true),
      supabase.from('inventario').select('*'),
    ])
    if (mesasData) setMesas(mesasData)
    if (catData) { setCategorias(catData); if (!categoriaActiva && catData[0]) setCategoriaActiva(catData[0].id) }
    if (platosData) {
      const platosConInv = platosData.map(p => ({
        ...p,
        inventario: (invData || []).filter((i: Inventario) => i.plato_id === p.id)
      }))
      setPlatos(platosConInv as unknown as (Plato & { inventario: Inventario[] })[])
    }
  }, [supabase, categoriaActiva])

  const cargarPedidosListos = useCallback(async () => {
    const { data } = await supabase
      .from('pedidos')
      .select('id, mesa:mesas(numero)')
      .eq('estado', 'listo')
    if (data) {
      setPedidosListos(data.map((p: unknown) => {
        const ped = p as { id: string; mesa: { numero: number } }
        return { id: ped.id, mesa: ped.mesa?.numero }
      }))
    }
  }, [supabase])

  useEffect(() => {
    cargarDatos()
    cargarPedidosListos()
    const canal = supabase.channel('mesera-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => { cargarPedidosListos(); cargarDatos() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario' }, cargarDatos)
      .subscribe()

    // Escuchar llamadas de clientes vía tabla DB (confiable)
    const canalLlamadas = supabase.channel('llamadas-tabla')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'llamadas' }, (payload) => {
        const row = payload.new as { id: number; mesa_numero: number }
        setLlamadasPendientes(prev => [...prev, { id: row.id, mesa_numero: row.mesa_numero }])
      })
      .subscribe()

    // Escuchar cuando ítems individuales se marcan como listos en cocina
    const canalItems = supabase.channel('items-cocina-mesera')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'items_pedido' }, (payload) => {
        const item = payload.new as { id: string; estado: string; pedido_id: string }
        if (item.estado !== 'listo') return // solo nos interesa cuando algo queda listo

        // Usar .then() en lugar de async/await para mayor compatibilidad con realtime
        supabase
          .from('pedidos')
          .select('tipo, mesa:mesas(numero), items:items_pedido(id, estado, plato:platos(nombre))')
          .eq('id', item.pedido_id)
          .maybeSingle()
          .then(({ data: pedido }) => {
            if (!pedido) return
            const p = pedido as unknown as {
              tipo: string
              mesa: { numero: number } | null
              items: { id: string; estado: string; plato: { nombre: string } }[]
            }
            if (!p.mesa || p.tipo === 'domi') return // domicilios domi van al panel domi, no aquí

            // Identificar el plato específico que acaba de quedar listo
            const itemListo = p.items.find(i => i.id === item.id)
            const platoNombre = itemListo?.plato?.nombre ?? 'Plato'

            // Cuántos platos siguen pendientes después de este
            const pendientes = p.items
              .filter(i => i.estado === 'pendiente' || i.estado === 'en_preparacion')
              .map(i => i.plato.nombre)

            // Crear notificación con ID único para poder descartarla
            const notifId = Date.now()
            setNotifsCocina(prev => [...prev, {
              id: notifId,
              mesa_numero: p.mesa!.numero,
              plato_nombre: platoNombre,
              pendientes,
            }])

            // Auto-descartar después de 30 segundos
            setTimeout(() => {
              setNotifsCocina(prev => prev.filter(n => n.id !== notifId))
            }, 30000)
          })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
      supabase.removeChannel(canalLlamadas)
      supabase.removeChannel(canalItems)
    }
  }, [cargarDatos, cargarPedidosListos, supabase])

  // ── SELECCIONAR MESA ─────────────────────────────────────────
  async function seleccionarMesa(mesa: Mesa) {
    if (mesa.estado === 'ocupada' || mesa.estado === 'esperando_pago') {
      // Buscar pedido activo de esta mesa
      const { data: pedidoActivo } = await supabase
        .from('pedidos')
        .select('id')
        .eq('mesa_id', mesa.id)
        .in('estado', ['pendiente', 'en_preparacion', 'listo', 'entregado'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (pedidoActivo) {
        setMesaTemporal(mesa)
        setPedidoExistenteId(pedidoActivo.id)
        setModalMesaOcupada(true)
        return
      }
    }
    // Mesa libre o sin pedido activo — flujo normal
    setMesaSeleccionada(mesa)
    setPedidoExistenteId(null)
    setCarrito([])
    setVista('menu')
  }

  function confirmarAgregarAPedido() {
    setMesaSeleccionada(mesaTemporal)
    setModalMesaOcupada(false)
    setCarrito([])
    setVista('menu')
  }

  function confirmarNuevoPedido() {
    setMesaSeleccionada(mesaTemporal)
    setPedidoExistenteId(null)
    setModalMesaOcupada(false)
    setCarrito([])
    setVista('menu')
  }

  function disponibilidadPlato(plato: Plato & { inventario: Inventario[] }): number {
    return plato.inventario?.[0]?.cantidad_disponible ?? 0
  }

  function agregarAlCarrito(plato: Plato) {
    setCarrito(prev => {
      const existe = prev.find(i => i.plato.id === plato.id)
      if (existe) return prev.map(i => i.plato.id === plato.id ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...prev, { plato, cantidad: 1, notas: '' }]
    })
    toast.success(`${plato.nombre} agregado`)
  }

  function cambiarCantidad(platoId: string, delta: number) {
    setCarrito(prev => prev
      .map(i => i.plato.id === platoId ? { ...i, cantidad: Math.max(0, i.cantidad + delta) } : i)
      .filter(i => i.cantidad > 0)
    )
  }

  function actualizarNota(platoId: string, nota: string) {
    setCarrito(prev => prev.map(i => i.plato.id === platoId ? { ...i, notas: nota } : i))
  }

  function iniciarDomi() {
    setModoDomi(true)
    setMesaSeleccionada(null)
    setPedidoExistenteId(null)
    setCarrito([])
    setDomiCliente({ nombre: '', cedula: '', telefono: '', direccion: '' })
    setVista('menu')
  }

  async function enviarPedido() {
    if (!modoDomi && !mesaSeleccionada) return
    if (carrito.length === 0) return
    if (modoDomi && !domiCliente.nombre.trim()) { toast.error('El nombre del cliente es obligatorio para domicilios'); return }
    setEnviando(true)

    const { data: { user } } = await supabase.auth.getUser()

    if (pedidoExistenteId) {
      // ── AGREGAR A PEDIDO EXISTENTE ──────────────────────────
      const { error } = await supabase.from('items_pedido').insert(
        carrito.map(item => ({
          pedido_id: pedidoExistenteId,
          plato_id: item.plato.id,
          cantidad: item.cantidad,
          precio_unitario: item.plato.precio,
          notas: item.notas || null,
        }))
      )
      if (error) { toast.error('Error al agregar platos'); setEnviando(false); return }
      await supabase.from('pedidos').update({ estado: 'en_preparacion' }).eq('id', pedidoExistenteId)
      toast.success('¡Platos agregados al pedido!')
    } else {
      // ── PEDIDO NUEVO (mesa o domi) ──────────────────────────
      const { data: turno } = await supabase
        .from('turnos').select('id').is('cerrado_en', null)
        .order('abierto_en', { ascending: false }).limit(1).single()

      if (!turno) { toast.error('No hay turno abierto. El gerente debe abrir caja primero.'); setEnviando(false); return }

      const { data: pedido, error } = await supabase
        .from('pedidos')
        .insert({
          mesa_id: modoDomi ? null : mesaSeleccionada!.id,
          mesera_id: user?.id,
          turno_id: turno.id,
          tipo: modoDomi ? 'domi' : 'mesera',
          notas: notaGeneral || null,
          cliente_nombre: modoDomi ? domiCliente.nombre.trim() : null,
          cliente_cedula: modoDomi && domiCliente.cedula ? domiCliente.cedula.trim() : null,
          cliente_telefono: modoDomi && domiCliente.telefono ? domiCliente.telefono.trim() : null,
          cliente_direccion: modoDomi && domiCliente.direccion ? domiCliente.direccion.trim() : null,
        })
        .select().single()

      if (error || !pedido) { toast.error('Error al enviar el pedido'); setEnviando(false); return }

      await supabase.from('items_pedido').insert(
        carrito.map(item => ({
          pedido_id: pedido.id,
          plato_id: item.plato.id,
          cantidad: item.cantidad,
          precio_unitario: item.plato.precio,
          notas: item.notas || null,
        }))
      )
      if (!modoDomi && mesaSeleccionada) {
        await supabase.from('mesas').update({ estado: 'ocupada' }).eq('id', mesaSeleccionada.id)
      }
      toast.success(modoDomi ? '¡Domi enviado a cocina! 🛵' : '¡Pedido enviado a cocina!')
    }

    setCarrito([])
    setNotaGeneral('')
    setMesaSeleccionada(null)
    setPedidoExistenteId(null)
    setModoDomi(false)
    setDomiCliente({ nombre: '', cedula: '', telefono: '', direccion: '' })
    setVista('mesas')
    cargarDatos()
    setEnviando(false)
  }

  async function marcarEntregado(pedidoId: string) {
    await supabase.from('pedidos').update({ estado: 'entregado' }).eq('id', pedidoId)
    toast.success('Pedido marcado como entregado')
    cargarPedidosListos()
  }

  const platosFiltrados = platos.filter(p => p.categoria_id === categoriaActiva)
  const totalCarrito = carrito.reduce((acc, i) => acc + i.plato.precio * i.cantidad, 0)

  // Paleta de tonos suaves por zona (se asigna por índice)
  const ZONA_TONOS = [
    { fondo: 'bg-sky-50',    borde: 'border-sky-100',    titulo: 'text-sky-700',    badge: 'bg-sky-100' },
    { fondo: 'bg-violet-50', borde: 'border-violet-100', titulo: 'text-violet-700', badge: 'bg-violet-100' },
    { fondo: 'bg-emerald-50',borde: 'border-emerald-100',titulo: 'text-emerald-700',badge: 'bg-emerald-100' },
    { fondo: 'bg-amber-50',  borde: 'border-amber-100',  titulo: 'text-amber-700',  badge: 'bg-amber-100' },
    { fondo: 'bg-rose-50',   borde: 'border-rose-100',   titulo: 'text-rose-700',   badge: 'bg-rose-100' },
    { fondo: 'bg-teal-50',   borde: 'border-teal-100',   titulo: 'text-teal-700',   badge: 'bg-teal-100' },
  ]
  const zonasLista = [...new Set(mesas.map(m => m.zona || 'Sin zona'))].sort((a, b) =>
    a === 'Sin zona' ? 1 : b === 'Sin zona' ? -1 : a.localeCompare(b, 'es')
  )

  // ── VISTA: MESAS ─────────────────────────────────────────────
  if (vista === 'mesas') return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      {/* Pedidos listos para entregar */}
      {pedidosListos.length > 0 && (
        <div className="mb-4 space-y-2">
          {pedidosListos.map(p => (
            <div key={p.id} className="bg-green-500 text-white rounded-xl p-3 flex items-center justify-between fade-in">
              <div className="flex items-center gap-2">
                <Bell size={18} className="animate-bounce" />
                <span className="font-semibold">¡Mesa {p.mesa} lista para recoger!</span>
              </div>
              <button onClick={() => marcarEntregado(p.id)} className="bg-white text-green-600 text-xs font-bold px-3 py-1 rounded-lg">Entregado</button>
            </div>
          ))}
        </div>
      )}

      {/* Notificaciones de cocina: plato listo */}
      {notifsCocina.length > 0 && (
        <div className="mb-3 space-y-2">
          {notifsCocina.map(notif => (
            <div key={notif.id} className="bg-blue-50 border-2 border-blue-300 rounded-xl px-4 py-3 flex items-start justify-between gap-3 fade-in">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-blue-900">
                  🍽️ El <span className="text-orange-600">{notif.plato_nombre}</span> de la Mesa {notif.mesa_numero} está listo
                </p>
                {notif.pendientes.length > 0 ? (
                  <p className="text-xs text-orange-600 font-semibold mt-1">
                    ⏳ Faltan: {notif.pendientes.join(', ')}
                  </p>
                ) : (
                  <p className="text-xs text-green-600 font-semibold mt-1">
                    ✅ ¡Pedido completo! Ya puedes recoger todo
                  </p>
                )}
              </div>
              <button
                onClick={() => setNotifsCocina(prev => prev.filter(n => n.id !== notif.id))}
                className="text-blue-300 hover:text-blue-600 shrink-0 mt-0.5">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="bg-orange-500 p-2 rounded-xl"><UtensilsCrossed size={24} className="text-white" /></div>
          <h1 className="text-xl font-bold text-gray-900">Mesas</h1>
        </div>
        <button onClick={iniciarDomi}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <Bike size={18} /> Domi
        </button>
      </div>

      {/* Leyenda */}
      <div className="flex gap-3 mb-5 text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-200 inline-block" /> Libre</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-400 inline-block" /> Ocupada</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" /> Cobrando</span>
      </div>

      {/* Mesas agrupadas por zona */}
      <div className="space-y-5">
        {zonasLista.map((zona, idx) => {
          const tono = ZONA_TONOS[idx % ZONA_TONOS.length]
          const mesasZona = mesas
            .filter(m => (m.zona || 'Sin zona') === zona)
            .sort((a, b) => a.numero - b.numero)
          return (
            <div key={zona} className={`rounded-2xl border p-4 ${tono.fondo} ${tono.borde}`}>
              <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${tono.titulo}`}>
                {zona}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {mesasZona.map(mesa => (
                  <button key={mesa.id} onClick={() => seleccionarMesa(mesa)}
                    className={`rounded-2xl p-4 text-center font-bold transition-all border-2 ${
                      mesa.estado === 'libre'
                        ? `bg-white border-gray-200 text-gray-800 hover:border-orange-400 hover:shadow-md`
                        : mesa.estado === 'ocupada'
                        ? 'bg-orange-50 border-orange-300 text-orange-700'
                        : 'bg-yellow-50 border-yellow-300 text-yellow-700'
                    }`}>
                    <p className="text-2xl font-black">{mesa.numero}</p>
                    <p className="text-xs mt-1 capitalize">{mesa.estado.replace('_', ' ')}</p>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── POPUP: Llamada de cliente ── */}
      {llamadasPendientes.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-3xl p-8 w-full max-w-xs text-center shadow-2xl fade-in">
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell size={40} className="text-orange-500 animate-bounce" />
            </div>
            <p className="text-2xl font-black text-gray-900 mb-1">¡Llamada!</p>
            <p className="text-gray-500 mb-1 text-base">
              Mesa <span className="font-black text-gray-900 text-2xl">{llamadasPendientes[0].mesa_numero}</span>
            </p>
            <p className="text-gray-400 text-sm mb-6">El cliente te necesita</p>
            {llamadasPendientes.length > 1 && (
              <p className="text-xs text-orange-500 font-semibold mb-4">
                +{llamadasPendientes.length - 1} llamada{llamadasPendientes.length - 1 > 1 ? 's' : ''} más en espera
              </p>
            )}
            <button
              onClick={async () => {
                const llamadaId = llamadasPendientes[0].id
                setLlamadasPendientes(prev => prev.slice(1))
                await supabase.from('llamadas').update({ atendida: true }).eq('id', llamadaId)
              }}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 rounded-2xl text-lg transition-colors"
            >
              ✓ Atender
            </button>
          </div>
        </div>
      )}

      {/* Modal mesa ocupada */}
      {modalMesaOcupada && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm fade-in">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-lg">Mesa {mesaTemporal?.numero}</h3>
              <button onClick={() => setModalMesaOcupada(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <p className="text-gray-500 text-sm mb-5">Esta mesa ya tiene un pedido activo. ¿Qué deseas hacer?</p>
            <div className="space-y-3">
              <button onClick={confirmarAgregarAPedido}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2">
                <Plus size={18} /> Agregar platos al pedido actual
              </button>
              <button onClick={confirmarNuevoPedido}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3.5 rounded-xl">
                Crear pedido nuevo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // ── VISTA: MENÚ ──────────────────────────────────────────────
  if (vista === 'menu') return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <button onClick={() => { setVista('mesas'); setCarrito([]); setModoDomi(false) }} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
          <div>
            {modoDomi
              ? <div className="flex items-center gap-2"><span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">🛵 DOMI</span></div>
              : <h2 className="font-bold text-gray-900">Mesa {mesaSeleccionada?.numero}</h2>
            }
            {pedidoExistenteId && <p className="text-xs text-orange-500 font-medium">Agregando al pedido actual</p>}
          </div>
        </div>
        <button onClick={() => setVista('carrito')} className="relative bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2">
          <ShoppingBag size={16} /> Ver pedido
          {carrito.length > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">{carrito.length}</span>}
        </button>
      </div>

      <div className="flex gap-2 px-4 py-3 overflow-x-auto bg-white border-b">
        {categorias.map(cat => (
          <button key={cat.id} onClick={() => setCategoriaActiva(cat.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${categoriaActiva === cat.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {cat.nombre}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4 space-y-3">
        {platosFiltrados.map(plato => {
          const disp = disponibilidadPlato(plato)
          const sinStock = disp === 0
          const stockBajo = disp > 0 && disp <= (plato.inventario?.[0]?.alerta_minima ?? 3)
          const enCarrito = carrito.find(i => i.plato.id === plato.id)
          return (
            <div key={plato.id} className={`bg-white rounded-2xl p-4 border flex items-center gap-3 ${sinStock ? 'opacity-50' : 'border-gray-100'}`}>
              {plato.imagen_url && <img src={plato.imagen_url} alt={plato.nombre} className="w-16 h-16 rounded-xl object-cover" />}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{plato.nombre}</p>
                {plato.descripcion && <p className="text-xs text-gray-400 truncate">{plato.descripcion}</p>}
                <p className="text-orange-600 font-bold mt-1">${plato.precio.toLocaleString('es-CO')}</p>
                {sinStock && <p className="text-red-500 text-xs font-semibold">Sin disponibilidad</p>}
                {stockBajo && <p className="text-yellow-600 text-xs font-semibold">⚠️ Quedan {disp}</p>}
              </div>
              {!sinStock && (
                enCarrito ? (
                  <div className="flex items-center gap-2">
                    <button onClick={() => cambiarCantidad(plato.id, -1)} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center"><Minus size={14} /></button>
                    <span className="font-bold w-4 text-center">{enCarrito.cantidad}</span>
                    <button onClick={() => cambiarCantidad(plato.id, 1)} className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center"><Plus size={14} /></button>
                  </div>
                ) : (
                  <button onClick={() => agregarAlCarrito(plato)} className="w-9 h-9 bg-orange-500 text-white rounded-full flex items-center justify-center hover:bg-orange-600"><Plus size={18} /></button>
                )
              )}
            </div>
          )
        })}
        {platosFiltrados.length === 0 && <p className="text-center text-gray-400 py-8">No hay platos en esta categoría</p>}
      </div>
    </div>
  )

  // ── VISTA: CARRITO ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => setVista('menu')} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
        <div>
          {modoDomi
            ? <div className="flex items-center gap-2"><span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">🛵 DOMI</span><span className="font-bold text-gray-900">Confirmar pedido</span></div>
            : <h2 className="font-bold text-gray-900">Confirmar — Mesa {mesaSeleccionada?.numero}</h2>
          }
          {pedidoExistenteId && <p className="text-xs text-orange-500 font-medium">Se agrega al pedido actual</p>}
        </div>
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
            <p className="text-orange-600 text-sm font-semibold mb-2">${(item.plato.precio * item.cantidad).toLocaleString('es-CO')}</p>
            <input type="text" placeholder="Nota especial (ej: sin cebolla)" value={item.notas}
              onChange={e => actualizarNota(item.plato.id, e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300" />
          </div>
        ))}

        {modoDomi && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-2">
            <p className="text-sm font-bold text-blue-800">🛵 Datos del cliente (domicilio)</p>
            <input type="text" placeholder="Nombre del cliente *" value={domiCliente.nombre}
              onChange={e => setDomiCliente(p => ({ ...p, nombre: e.target.value }))}
              className="w-full text-sm border border-blue-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
            <input type="text" placeholder="Cédula (opcional)" value={domiCliente.cedula}
              onChange={e => setDomiCliente(p => ({ ...p, cedula: e.target.value }))}
              className="w-full text-sm border border-blue-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
            <input type="tel" placeholder="Teléfono / Celular" value={domiCliente.telefono}
              onChange={e => setDomiCliente(p => ({ ...p, telefono: e.target.value }))}
              className="w-full text-sm border border-blue-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
            <input type="text" placeholder="Dirección de entrega" value={domiCliente.direccion}
              onChange={e => setDomiCliente(p => ({ ...p, direccion: e.target.value }))}
              className="w-full text-sm border border-blue-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
          </div>
        )}

        {!pedidoExistenteId && !modoDomi && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <label className="text-sm font-medium text-gray-700 block mb-1">Nota general del pedido</label>
            <textarea value={notaGeneral} onChange={e => setNotaGeneral(e.target.value)}
              placeholder="Observaciones generales..." rows={2}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300" />
          </div>
        )}
      </div>

      <div className="bg-white border-t p-4">
        <div className="flex justify-between items-center mb-3">
          <span className="text-gray-600 font-medium">{pedidoExistenteId ? 'Adicional' : 'Total estimado'}</span>
          <span className="text-xl font-black text-gray-900">${totalCarrito.toLocaleString('es-CO')}</span>
        </div>
        <button onClick={enviarPedido} disabled={enviando || carrito.length === 0}
          className={`w-full disabled:bg-gray-300 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors text-lg ${modoDomi ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-500 hover:bg-orange-600'}`}>
          {modoDomi ? <Bike size={22} /> : <CheckCircle size={22} />}
          {enviando ? 'Enviando...' : modoDomi ? 'Enviar domi a cocina' : pedidoExistenteId ? 'Agregar a cocina' : 'Enviar a cocina'}
        </button>
      </div>
    </div>
  )
}
