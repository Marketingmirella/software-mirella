'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Pedido, ItemPedido } from '@/types'
import toast from 'react-hot-toast'
import { Clock, ChefHat, CheckCircle, AlertTriangle, UtensilsCrossed, X } from 'lucide-react'

const MINUTOS_LIMITE = 20

const COCINERAS = ['Cocinera 1','Cocinera 2','Cocinera 3','Cocinera 4','Cocinera 5','Cocinera 6','Cocinera 7']

const COLORES_COCINERA = [
  'bg-pink-500','bg-purple-500','bg-blue-500','bg-green-500',
  'bg-yellow-500','bg-orange-500','bg-red-500'
]

function tiempoTranscurrido(fecha: string, ahora: number) {
  return Math.floor((ahora - new Date(fecha).getTime()) / 1000 / 60)
}

function segundosTranscurridos(fecha: string, ahora: number) {
  return Math.floor((ahora - new Date(fecha).getTime()) / 1000)
}

function BadgeTiempo({ minutos }: { minutos: number }) {
  if (minutos >= MINUTOS_LIMITE) return (
    <span className="flex items-center gap-1 bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
      <AlertTriangle size={12} /> {minutos} min — DEMORADO
    </span>
  )
  if (minutos >= Math.round(MINUTOS_LIMITE * 0.75)) return (
    <span className="flex items-center gap-1 bg-yellow-100 text-yellow-700 text-xs font-bold px-2 py-1 rounded-full">
      <Clock size={12} /> {minutos} min
    </span>
  )
  return (
    <span className="flex items-center gap-1 bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">
      <Clock size={12} /> {minutos} min
    </span>
  )
}

function BarraProgreso({ fecha, ahora }: { fecha: string; ahora: number }) {
  const totalSegs = MINUTOS_LIMITE * 60
  const segsTransc = Math.min(segundosTranscurridos(fecha, ahora), totalSegs * 1.5)
  const pct = Math.min((segsTransc / totalSegs) * 100, 100)
  const minutos = Math.floor(segsTransc / 60)
  const segundos = segsTransc % 60
  const pasado = segsTransc >= totalSegs

  const colorBarra = pct < 50 ? 'bg-green-500' : pct < 75 ? 'bg-yellow-400' : 'bg-red-500'
  const colorTexto = pct < 50 ? 'text-green-400' : pct < 75 ? 'text-yellow-300' : 'text-red-400'

  return (
    <div className="mt-3 mb-1">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-400">Tiempo transcurrido</span>
        <span className={`text-xs font-black tabular-nums ${colorTexto} ${pasado ? 'animate-pulse' : ''}`}>
          {minutos}:{String(segundos).padStart(2, '0')} / {MINUTOS_LIMITE}:00
        </span>
      </div>
      <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${colorBarra} ${pasado ? 'animate-pulse' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {pasado && (
        <p className="text-red-400 text-xs font-bold mt-1 flex items-center gap-1">
          <AlertTriangle size={11} /> Superó el límite de {MINUTOS_LIMITE} min
        </p>
      )}
    </div>
  )
}

interface ItemConCocinero extends Omit<ItemPedido, 'plato'> {
  plato: { nombre: string }
  cocinero?: string
}

export default function CocinaPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [cargando, setCargando] = useState(true)
  const [ahora, setAhora] = useState(Date.now())

  // Modal selector de cocinera
  const [modalCocinero, setModalCocinero] = useState<{
    itemId: string
    pedidoId: string
    accion: 'preparar' | 'listo'
  } | null>(null)

  const supabase = createClient()

  const cargarPedidos = useCallback(async () => {
    const { data } = await supabase
      .from('pedidos')
      .select(`*, mesa:mesas(numero), items:items_pedido(*, plato:platos(nombre))`)
      .in('estado', ['pendiente', 'en_preparacion'])
      .order('created_at', { ascending: true })
    if (data) setPedidos(data as unknown as Pedido[])
    setCargando(false)
  }, [supabase])

  useEffect(() => {
    cargarPedidos()
    const canal = supabase.channel('cocina-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, cargarPedidos)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items_pedido' }, cargarPedidos)
      .subscribe()
    const intervalo = setInterval(cargarPedidos, 60000)
    const tick = setInterval(() => setAhora(Date.now()), 1000)
    return () => { supabase.removeChannel(canal); clearInterval(intervalo); clearInterval(tick) }
  }, [cargarPedidos, supabase])

  // Al hacer clic en "Preparar" o "Listo" — abre modal de selección de cocinera
  function pedirCocinero(itemId: string, pedidoId: string, accion: 'preparar' | 'listo') {
    setModalCocinero({ itemId, pedidoId, accion })
  }

  async function confirmarConCocinero(cocinero: string) {
    if (!modalCocinero) return
    const { itemId, pedidoId, accion } = modalCocinero
    setModalCocinero(null)

    if (accion === 'preparar') {
      await supabase.from('items_pedido').update({
        estado: 'en_preparacion',
        tiempo_inicio_prep: new Date().toISOString(),
        cocinero,
      }).eq('id', itemId)

      await supabase.from('pedidos').update({ estado: 'en_preparacion' })
        .eq('id', pedidoId).eq('estado', 'pendiente')

      toast.success(`${cocinero} — en preparación`)
    } else {
      await supabase.from('items_pedido').update({
        estado: 'listo',
        tiempo_listo: new Date().toISOString(),
        cocinero,
      }).eq('id', itemId)

      // Revisar si todos los items están listos
      const { data: items } = await supabase
        .from('items_pedido').select('estado').eq('pedido_id', pedidoId)
      const todosListos = items?.every(i => i.estado === 'listo' || i.estado === 'entregado')
      if (todosListos) {
        await supabase.from('pedidos').update({ estado: 'listo' }).eq('id', pedidoId)
        toast.success('¡Pedido listo! La mesera fue notificada.')
      } else {
        toast.success(`${cocinero} — plato listo`)
      }
    }
    cargarPedidos()
  }

  if (cargando) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-white text-center">
        <ChefHat size={48} className="mx-auto mb-3 animate-pulse" />
        <p>Cargando pedidos...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-orange-500 p-2 rounded-xl"><ChefHat size={28} /></div>
          <div>
            <h1 className="text-xl font-bold">Cocina</h1>
            <p className="text-gray-400 text-sm">{pedidos.length} pedido(s) activo(s)</p>
          </div>
        </div>
        <div className="text-right text-sm text-gray-400">
          <p>Límite de entrega</p>
          <p className="text-red-400 font-bold">{MINUTOS_LIMITE} min</p>
        </div>
      </div>

      {pedidos.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <UtensilsCrossed size={48} className="mb-3" />
          <p className="text-lg">No hay pedidos pendientes</p>
          <p className="text-sm">Los nuevos pedidos aparecerán aquí automáticamente</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {pedidos.map(pedido => {
          const minutos = tiempoTranscurrido(pedido.created_at, ahora)
          const esDemorado = minutos >= MINUTOS_LIMITE
          const mesa = (pedido.mesa as unknown as { numero: number } | null)
          return (
            <div key={pedido.id}
              className={`rounded-2xl border p-4 fade-in ${esDemorado ? 'bg-red-950 border-red-700 alert-pulse' : 'bg-gray-800 border-gray-700'}`}>

              <div className="flex items-center justify-between mb-1">
                <div>
                  {pedido.tipo === 'domi' ? (
                    <span className="text-2xl font-black text-blue-400">🛵 DOMI</span>
                  ) : (
                    <span className="text-2xl font-black text-orange-400">Mesa {mesa?.numero}</span>
                  )}
                  {pedido.tipo !== 'domi' && (
                    <span className="ml-2 text-xs text-gray-400">
                      {pedido.tipo === 'cliente_qr' ? '📱 QR' : '👩 Mesera'}
                    </span>
                  )}
                </div>
                <BadgeTiempo minutos={minutos} />
              </div>

              <BarraProgreso fecha={pedido.created_at} ahora={ahora} />

              {pedido.notas && (
                <div className="bg-yellow-900/40 border border-yellow-700 rounded-lg px-3 py-2 mb-3 text-yellow-300 text-sm">
                  📝 {pedido.notas}
                </div>
              )}

              <div className="space-y-2">
                {(pedido.items as unknown as ItemConCocinero[])?.map(item => (
                  <div key={item.id}
                    className={`rounded-xl p-3 ${
                      item.estado === 'listo' ? 'bg-green-900/50 border border-green-700' :
                      item.estado === 'en_preparacion' ? 'bg-blue-900/50 border border-blue-700' :
                      'bg-gray-700 border border-gray-600'
                    }`}>

                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{item.cantidad}x {item.plato?.nombre}</p>
                        {item.notas && <p className="text-xs text-yellow-300 mt-0.5">⚠️ {item.notas}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-gray-400 capitalize">
                            {item.estado === 'pendiente' ? '⏳ Pendiente' :
                             item.estado === 'en_preparacion' ? '🔥 En preparación' : '✅ Listo'}
                          </p>
                          {item.cocinero && (
                            <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-gray-300">
                              👩‍🍳 {item.cocinero}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 shrink-0">
                        {item.estado === 'pendiente' && (
                          <button onClick={() => pedirCocinero(item.id, pedido.id, 'preparar')}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors">
                            Preparar
                          </button>
                        )}
                        {item.estado === 'en_preparacion' && (
                          <button onClick={() => pedirCocinero(item.id, pedido.id, 'listo')}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors">
                            <CheckCircle size={14} className="inline mr-1" />Listo
                          </button>
                        )}
                        {item.estado === 'listo' && (
                          <span className="text-green-400 text-xs font-bold">✓ Listo</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── MODAL SELECTOR DE COCINERA ──────────────────────── */}
      {modalCocinero && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-5 w-full max-w-sm fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-lg">
                {modalCocinero.accion === 'preparar' ? '¿Quién prepara?' : '¿Quién lo terminó?'}
              </h3>
              <button onClick={() => setModalCocinero(null)}
                className="text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full bg-gray-700">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {COCINERAS.map((c, i) => (
                <button key={c} onClick={() => confirmarConCocinero(c)}
                  className={`${COLORES_COCINERA[i]} hover:opacity-90 text-white font-bold py-3 rounded-xl text-sm transition-all active:scale-95`}>
                  👩‍🍳 {c}
                </button>
              ))}
            </div>
            <button onClick={() => confirmarConCocinero('Sin asignar')}
              className="w-full mt-2 bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium py-2.5 rounded-xl text-sm">
              Continuar sin asignar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
