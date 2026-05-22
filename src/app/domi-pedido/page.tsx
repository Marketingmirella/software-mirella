'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plato, Categoria, Inventario } from '@/types'
import toast from 'react-hot-toast'
import {
  Plus, Minus, ShoppingBag, CheckCircle, ChevronLeft,
  Bike, Upload, X, Navigation
} from 'lucide-react'

type ItemCarrito = { plato: Plato; cantidad: number; notas: string }
type Paso = 'menu' | 'carrito' | 'datos' | 'pago' | 'comprobante' | 'seguimiento'
type MetodoPago = 'efectivo' | 'nequi' | 'daviplata'
type EstadoItem = { id: string; nombre: string; cantidad: number; estado: string }

const ESTADO_CONFIG: Record<string, { label: string; dot: string; color: string }> = {
  pendiente:       { label: 'Esperando...',  dot: 'bg-gray-300',                 color: 'text-gray-400'   },
  en_preparacion:  { label: 'Preparando 🔥', dot: 'bg-orange-400 animate-pulse', color: 'text-orange-500' },
  listo:           { label: '¡Listo! ✅',    dot: 'bg-green-500',                color: 'text-green-600'  },
  entregado:       { label: 'En camino 🛵',  dot: 'bg-blue-400',                 color: 'text-blue-600'   },
}

export default function DomiPedidoPage() {
  const [paso, setPaso]             = useState<Paso>('menu')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [platos, setPlatos]         = useState<(Plato & { inventario: Inventario[] })[]>([])
  const [catActiva, setCatActiva]   = useState<number | null>(null)
  const [carrito, setCarrito]       = useState<ItemCarrito[]>([])

  // Datos del cliente
  const [nombre, setNombre]         = useState('')
  const [telefono, setTelefono]     = useState('')
  const [direccion, setDireccion]   = useState('')
  const [cedula, setCedula]         = useState('')

  // Pago
  const [metodoPago, setMetodoPago] = useState<MetodoPago | null>(null)
  const [comprobante, setComprobante] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [subiendoFoto, setSubiendoFoto] = useState(false)

  // Seguimiento
  const [pedidoId, setPedidoId]     = useState<string | null>(null)
  const [itemsSeg, setItemsSeg]     = useState<EstadoItem[]>([])
  const [enviando, setEnviando]     = useState(false)
  const [domiEnCamino, setDomiEnCamino] = useState(false)
  const [showPopupDomi, setShowPopupDomi] = useState(false)

  const supabase = createClient()

  // ── CARGAR MENÚ ───────────────────────────────────────────────
  const cargarMenu = useCallback(async () => {
    const [{ data: cats }, { data: pls }, { data: inv }] = await Promise.all([
      supabase.from('categorias').select('*').order('orden'),
      supabase.from('platos').select('*').eq('activo', true),
      supabase.from('inventario').select('*'),
    ])
    if (cats) { setCategorias(cats); if (cats[0]) setCatActiva(cats[0].id) }
    if (pls) setPlatos(pls.map(p => ({ ...p, inventario: (inv || []).filter((i: Inventario) => i.plato_id === p.id) })) as unknown as (Plato & { inventario: Inventario[] })[])
  }, [supabase])

  useEffect(() => { cargarMenu() }, [cargarMenu])

  // ── SEGUIMIENTO EN TIEMPO REAL ────────────────────────────────
  const cargarItemsSeg = useCallback(async (pid: string) => {
    const { data } = await supabase
      .from('items_pedido')
      .select('id, cantidad, estado, plato:platos(nombre)')
      .eq('pedido_id', pid)
      .order('created_at')
    if (data) setItemsSeg(data.map(i => ({
      id: i.id, cantidad: i.cantidad, estado: i.estado,
      nombre: (i.plato as unknown as { nombre: string })?.nombre || '',
    })))
  }, [supabase])

  useEffect(() => {
    if (paso !== 'seguimiento' || !pedidoId) return
    const canal = supabase.channel(`domi-cli-${pedidoId}`)
      // Cambios en items
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'items_pedido',
        filter: `pedido_id=eq.${pedidoId}`,
      }, (payload) => {
        const nuevo = payload.new as { id: string; estado: string }
        setItemsSeg(prev => prev.map(i => i.id === nuevo.id ? { ...i, estado: nuevo.estado } : i))
      })
      // Domi tomó el pedido
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'pedidos',
        filter: `id=eq.${pedidoId}`,
      }, (payload) => {
        const nuevo = payload.new as { domi_tomado_en: string | null }
        if (nuevo.domi_tomado_en && !domiEnCamino) {
          setDomiEnCamino(true)
          setShowPopupDomi(true)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [paso, pedidoId, supabase, domiEnCamino])

  // ── CARRITO ───────────────────────────────────────────────────
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

  // ── SELECCIONAR COMPROBANTE ───────────────────────────────────
  function seleccionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setComprobante(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  // ── ENVIAR PEDIDO ─────────────────────────────────────────────
  async function enviarPedido() {
    if (carrito.length === 0 || !metodoPago) return
    if (!nombre.trim() || !telefono.trim() || !direccion.trim()) {
      toast.error('Completa todos los campos'); return
    }
    if ((metodoPago === 'nequi' || metodoPago === 'daviplata') && !comprobante) {
      toast.error('Debes adjuntar el comprobante de pago'); return
    }
    setEnviando(true)

    const { data: turno } = await supabase.from('turnos').select('id').is('cerrado_en', null)
      .order('abierto_en', { ascending: false }).limit(1).single()
    if (!turno) {
      toast.error('El restaurante no está recibiendo pedidos en este momento')
      setEnviando(false); return
    }

    // Subir comprobante si aplica
    let comprob_url: string | null = null
    if (comprobante && (metodoPago === 'nequi' || metodoPago === 'daviplata')) {
      setSubiendoFoto(true)
      const ext = comprobante.name.split('.').pop() || 'jpg'
      const filename = `comprobante-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('comprobantes')
        .upload(filename, comprobante, { cacheControl: '3600', upsert: false })
      if (upErr) {
        toast.error('Error al subir el comprobante. Intenta de nuevo.')
        setEnviando(false); setSubiendoFoto(false); return
      }
      const { data: urlData } = supabase.storage.from('comprobantes').getPublicUrl(filename)
      comprob_url = urlData.publicUrl
      setSubiendoFoto(false)
    }

    // Crear cliente si tiene cédula
    let clienteId: string | null = null
    if (cedula.trim()) {
      const { data: clData } = await supabase.from('clientes').select('id').eq('cedula', cedula.trim()).single()
      if (clData) {
        clienteId = clData.id
      } else {
        const { data: nuevo } = await supabase.from('clientes').insert({
          cedula: cedula.trim(), nombre: nombre.trim(), telefono: telefono.trim(),
        }).select('id').single()
        clienteId = nuevo?.id || null
      }
    }

    // Crear pedido
    const { data: pedido, error } = await supabase.from('pedidos').insert({
      turno_id:           turno.id,
      tipo:               'domi',
      cliente_id:         clienteId,
      cliente_nombre:     nombre.trim(),
      cliente_cedula:     cedula.trim() || null,
      cliente_telefono:   telefono.trim(),
      cliente_direccion:  direccion.trim(),
      metodo_pago_cliente: metodoPago,
      comprobante_url:    comprob_url,
    }).select().single()

    if (error || !pedido) {
      toast.error('Error al enviar el pedido. Inténtalo de nuevo.')
      setEnviando(false); return
    }

    await supabase.from('items_pedido').insert(
      carrito.map(i => ({
        pedido_id: pedido.id,
        plato_id: i.plato.id,
        cantidad: i.cantidad,
        precio_unitario: i.plato.precio,
        notas: i.notas || null,
      }))
    )

    setPedidoId(pedido.id)
    await cargarItemsSeg(pedido.id)
    setCarrito([])
    setPaso('seguimiento')
    setEnviando(false)
  }

  const total      = carrito.reduce((a, i) => a + i.plato.precio * i.cantidad, 0)
  const totalItems = carrito.reduce((a, i) => a + i.cantidad, 0)
  const platosFiltrados = platos.filter(p => p.categoria_id === catActiva)
  const datosCompletos = nombre.trim() && telefono.trim() && direccion.trim()
  const esTransferencia = metodoPago === 'nequi' || metodoPago === 'daviplata'

  // ── SEGUIMIENTO ───────────────────────────────────────────────
  if (paso === 'seguimiento') return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex flex-col">
      <div className="bg-white border-b px-4 py-4 text-center shadow-sm">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2 bg-blue-600">
          <Bike size={28} className="text-white" />
        </div>
        <h2 className="font-bold text-gray-900 text-lg">¡Pedido en preparación!</h2>
        <p className="text-sm text-gray-400">Te avisaremos cuando el domi esté en camino 🛵</p>
      </div>

      <div className="flex-1 p-4 space-y-2 pb-10">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Estado de tu pedido</p>
        {itemsSeg.map(item => {
          const cfg = ESTADO_CONFIG[item.estado] || ESTADO_CONFIG.pendiente
          return (
            <div key={item.id} className="bg-white rounded-2xl px-4 py-3.5 border border-gray-100 shadow-sm flex items-center justify-between">
              <p className="font-semibold text-gray-900 text-sm">{item.cantidad}× {item.nombre}</p>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
              </div>
            </div>
          )
        })}

        {domiEnCamino && (
          <div className="mt-4 bg-blue-600 text-white rounded-2xl p-5 text-center shadow-lg">
            <Navigation size={36} className="mx-auto mb-2" />
            <p className="font-black text-xl">¡Tu domi está en camino!</p>
            <p className="text-blue-200 text-sm mt-1">Pronto llegará a tu dirección</p>
          </div>
        )}
      </div>

      {/* Popup cuando domi sale */}
      {showPopupDomi && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 w-full max-w-xs text-center shadow-2xl">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Navigation size={40} className="text-blue-600" />
            </div>
            <p className="text-2xl font-black text-gray-900 mb-2">¡Va en camino!</p>
            <p className="text-gray-500 text-sm mb-6">Tu domi salió y está llevando tu pedido. ¡En breve llega!</p>
            <button onClick={() => setShowPopupDomi(false)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl text-lg">
              ✓ Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  )

  // ── COMPROBANTE ───────────────────────────────────────────────
  if (paso === 'comprobante') return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 shadow-sm">
        <button onClick={() => setPaso('pago')} className="text-gray-400 hover:text-gray-600"><ChevronLeft size={22} /></button>
        <h2 className="font-bold text-gray-900">Comprobante de pago</h2>
      </div>
      <div className="flex-1 flex items-start justify-center p-5 pt-8">
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Upload size={28} className="text-blue-600" />
            </div>
            <h3 className="font-black text-xl text-gray-900">Adjunta tu comprobante</h3>
            <p className="text-gray-500 text-sm mt-1">
              Para confirmar tu pedido, sube la foto del comprobante de pago por{' '}
              <span className="font-bold text-blue-600 capitalize">{metodoPago}</span>
            </p>
          </div>

          {previewUrl ? (
            <div className="relative">
              <img src={previewUrl} alt="Comprobante" className="w-full rounded-2xl object-cover max-h-72 border-2 border-blue-300" />
              <button onClick={() => { setComprobante(null); setPreviewUrl(null) }}
                className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow">
                <X size={16} />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-blue-300 rounded-2xl cursor-pointer bg-blue-50 hover:bg-blue-100 transition-colors">
              <Upload size={32} className="text-blue-400 mb-2" />
              <p className="text-sm font-semibold text-blue-600">Toca para adjuntar foto</p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG — desde tu galería o cámara</p>
              <input type="file" accept="image/*" className="hidden" onChange={seleccionarFoto} capture="environment" />
            </label>
          )}

          <button
            onClick={enviarPedido}
            disabled={!comprobante || enviando}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-base transition-colors">
            <CheckCircle size={20} />
            {subiendoFoto ? 'Subiendo comprobante...' : enviando ? 'Enviando pedido...' : 'Confirmar y enviar a cocina'}
          </button>
          <p className="text-center text-xs text-gray-400">
            Al confirmar recibirás una notificación cuando el domi salga con tu pedido
          </p>
        </div>
      </div>
    </div>
  )

  // ── PAGO ──────────────────────────────────────────────────────
  if (paso === 'pago') return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 shadow-sm">
        <button onClick={() => setPaso('datos')} className="text-gray-400 hover:text-gray-600"><ChevronLeft size={22} /></button>
        <h2 className="font-bold text-gray-900">¿Cómo vas a pagar?</h2>
      </div>
      <div className="flex-1 flex items-start justify-center p-5 pt-8">
        <div className="w-full max-w-sm space-y-4">
          <p className="text-gray-500 text-sm text-center">Elige tu método de pago</p>

          {/* Efectivo */}
          <button onClick={() => setMetodoPago('efectivo')}
            className={`w-full p-5 rounded-2xl border-2 text-left transition-all ${metodoPago === 'efectivo' ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:border-green-300'}`}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">💵</span>
              <div>
                <p className="font-bold text-gray-900">Efectivo</p>
                <p className="text-xs text-gray-400">Pagas al recibir tu pedido</p>
              </div>
              {metodoPago === 'efectivo' && <CheckCircle className="ml-auto text-green-500" size={22} />}
            </div>
          </button>

          {/* Nequi */}
          <button onClick={() => setMetodoPago('nequi')}
            className={`w-full p-5 rounded-2xl border-2 text-left transition-all ${metodoPago === 'nequi' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white hover:border-purple-300'}`}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">💜</span>
              <div>
                <p className="font-bold text-gray-900">Nequi</p>
                <p className="text-xs text-gray-400">Transferencia — debes subir el comprobante</p>
              </div>
              {metodoPago === 'nequi' && <CheckCircle className="ml-auto text-purple-500" size={22} />}
            </div>
          </button>

          {/* Daviplata */}
          <button onClick={() => setMetodoPago('daviplata')}
            className={`w-full p-5 rounded-2xl border-2 text-left transition-all ${metodoPago === 'daviplata' ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-white hover:border-red-300'}`}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">❤️</span>
              <div>
                <p className="font-bold text-gray-900">Daviplata</p>
                <p className="text-xs text-gray-400">Transferencia — debes subir el comprobante</p>
              </div>
              {metodoPago === 'daviplata' && <CheckCircle className="ml-auto text-red-500" size={22} />}
            </div>
          </button>

          {metodoPago && (
            <button
              onClick={() => {
                if (metodoPago === 'efectivo') {
                  enviarPedido()
                } else {
                  setPaso('comprobante')
                }
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl text-base transition-colors mt-2">
              {metodoPago === 'efectivo' ? 'Confirmar pedido →' : 'Adjuntar comprobante →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )

  // ── DATOS DEL CLIENTE ─────────────────────────────────────────
  if (paso === 'datos') return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 shadow-sm">
        <button onClick={() => setPaso('carrito')} className="text-gray-400 hover:text-gray-600"><ChevronLeft size={22} /></button>
        <h2 className="font-bold text-gray-900">Datos de entrega</h2>
      </div>
      <div className="flex-1 flex items-start justify-center p-5 pt-6">
        <div className="w-full max-w-sm space-y-4">
          <p className="text-gray-500 text-sm text-center">Necesitamos tus datos para llevar el pedido</p>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Nombre completo *</label>
            <input type="text" placeholder="Tu nombre" value={nombre} onChange={e => setNombre(e.target.value)}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Teléfono *</label>
            <input type="tel" placeholder="Tu número de celular" value={telefono} onChange={e => setTelefono(e.target.value)}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Dirección de entrega *</label>
            <input type="text" placeholder="Calle, barrio, referencias" value={direccion} onChange={e => setDireccion(e.target.value)}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Cédula <span className="text-gray-300 font-normal normal-case">(opcional)</span>
            </label>
            <input type="number" placeholder="Número de cédula" value={cedula} onChange={e => setCedula(e.target.value)}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
          </div>

          <button
            onClick={() => setPaso('pago')}
            disabled={!datosCompletos}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-2xl text-base transition-colors mt-2">
            Continuar →
          </button>
          {!datosCompletos && <p className="text-center text-xs text-red-400">* Nombre, teléfono y dirección son obligatorios</p>}
        </div>
      </div>
    </div>
  )

  // ── CARRITO ───────────────────────────────────────────────────
  if (paso === 'carrito') return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 shadow-sm">
        <button onClick={() => setPaso('menu')} className="text-gray-400 hover:text-gray-600"><ChevronLeft size={22} /></button>
        <h2 className="font-bold text-gray-900">Tu pedido</h2>
        <span className="text-sm text-gray-400 ml-auto">{totalItems} producto(s)</span>
      </div>
      <div className="flex-1 p-4 space-y-3 pb-36">
        {carrito.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingBag size={44} className="mx-auto text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">Tu carrito está vacío</p>
            <button onClick={() => setPaso('menu')} className="mt-3 text-blue-500 font-semibold text-sm">← Volver al menú</button>
          </div>
        ) : carrito.map(item => (
          <div key={item.plato.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-gray-900">{item.plato.nombre}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => cambiarCantidad(item.plato.id, -1)} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center"><Minus size={12} /></button>
                <span className="font-bold w-5 text-center">{item.cantidad}</span>
                <button onClick={() => cambiarCantidad(item.plato.id, 1)} className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center"><Plus size={12} /></button>
              </div>
            </div>
            <p className="text-blue-500 text-sm font-bold">${(item.plato.precio * item.cantidad).toLocaleString('es-CO')}</p>
            <input type="text" placeholder="Nota especial (ej: sin cebolla)" value={item.notas}
              onChange={e => setCarrito(prev => prev.map(i => i.plato.id === item.plato.id ? { ...i, notas: e.target.value } : i))}
              className="mt-2 w-full text-sm border border-gray-100 rounded-xl px-3 py-2.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
        ))}
      </div>
      {carrito.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-xl">
          <div className="flex justify-between items-center mb-3">
            <span className="text-gray-600 font-medium">Total estimado</span>
            <span className="text-xl font-black">${total.toLocaleString('es-CO')}</span>
          </div>
          <button onClick={() => setPaso('datos')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl text-base">
            Continuar →
          </button>
        </div>
      )}
    </div>
  )

  // ── MENÚ ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 shadow-sm">
        <div>
          <h1 className="font-bold text-gray-900">Las Delicias de Mirella</h1>
          <p className="text-xs text-gray-400 flex items-center gap-1"><Bike size={11} /> Pedido a domicilio</p>
        </div>
        <button onClick={() => setPaso('carrito')}
          className="relative bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-sm">
          <ShoppingBag size={16} /> Pedido
          {totalItems > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">{totalItems}</span>}
        </button>
      </div>

      <div className="flex gap-2 px-4 py-3 overflow-x-auto bg-white border-b shrink-0">
        {categorias.map(cat => (
          <button key={cat.id} onClick={() => setCatActiva(cat.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${catActiva === cat.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {cat.nombre}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4 space-y-3">
        {platosFiltrados.map(plato => {
          const inv = (plato.inventario?.[0] as { cantidad_disponible: number } | undefined)
          const disp = inv?.cantidad_disponible ?? 0
          const sinStock = disp === 0
          const enCarrito = carrito.find(i => i.plato.id === plato.id)
          return (
            <div key={plato.id} className={`bg-white rounded-2xl p-4 border flex items-center gap-3 shadow-sm ${sinStock ? 'opacity-50' : 'border-gray-100'}`}>
              {plato.imagen_url && <img src={plato.imagen_url} alt={plato.nombre} className="w-16 h-16 rounded-xl object-cover shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{plato.nombre}</p>
                {plato.descripcion && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{plato.descripcion}</p>}
                <p className="text-blue-500 font-bold mt-1">${plato.precio.toLocaleString('es-CO')}</p>
                {sinStock && <p className="text-red-500 text-xs font-semibold mt-0.5">No disponible</p>}
              </div>
              {!sinStock && (enCarrito ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => cambiarCantidad(plato.id, -1)} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center"><Minus size={14} /></button>
                  <span className="font-bold w-5 text-center">{enCarrito.cantidad}</span>
                  <button onClick={() => cambiarCantidad(plato.id, 1)} className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center"><Plus size={14} /></button>
                </div>
              ) : (
                <button onClick={() => agregar(plato)} className="w-9 h-9 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 shrink-0">
                  <Plus size={18} />
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
