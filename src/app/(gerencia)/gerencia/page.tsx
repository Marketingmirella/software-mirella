'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import {
  BarChart3, TrendingUp, Users, DollarSign, Clock, ChefHat,
  Plus, X, Play, Square, MapPin, CheckCircle, Banknote,
  Pencil, Trash2, UtensilsCrossed, Timer, UserCircle, Search, Bike,
  Download, SlidersHorizontal, CalendarDays, Settings
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid
} from 'recharts'

// ─── TIPOS ───────────────────────────────────────────────────
interface PlatoStat { nombre: string; cantidad: number; total: number }
interface MeseraStat { nombre: string; pedidos: number; total: number }
interface PedidoResumen { id: string; mesa: number; total: number; estado: string; created_at: string; pagado_en?: string | null; tipo: string; turno_id?: string | null }
interface ItemDetalle { nombre: string; cantidad: number; precio_unitario: number; notas: string | null; estado: string }
interface PedidoDetalle {
  id: string; estado: string; tipo: string; created_at: string; notas: string | null
  mesa: { numero: number }; mesera: { nombre: string } | null; items: ItemDetalle[]
  cliente_nombre?: string | null; cliente_telefono?: string | null
  cliente_cedula?: string | null; cliente_direccion?: string | null
}
interface PagoRegistrado { id: string; metodo: string; monto: number; propina: number; created_at: string }
interface TiempoStat { nombre: string; espera: number; preparacion: number; total: number; cantidad: number }
interface CocineroStat { nombre: string; platos: number; tiempoPromedio: number }
interface Categoria { id: number; nombre: string; orden: number }
interface ClienteStat {
  id: string; cedula: string | null; nombre: string; telefono: string | null
  fecha_cumpleanos: string | null; pedidos: number; totalGastado: number; ultimaVisita: string | null
}
interface ClientePedidoItem { nombre: string; cantidad: number; precio_unitario: number }
interface ClientePedido { id: string; created_at: string; total: number; tipo: string; estado: string; items: ClientePedidoItem[] }
interface Plato {
  id: string; nombre: string; descripcion: string | null; precio: number; costo: number | null
  categoria_id: number; imagen_url: string | null; activo: boolean
}

type MetodoPago = 'efectivo' | 'nequi' | 'daviplata' | 'bancolombia'
type Seccion = 'mesas' | 'carta' | 'resumen' | 'tiempos' | 'caja' | 'usuarios' | 'clientes'
type RangoResumen = 'hoy' | 'semana' | 'mes' | 'personalizado'

const METODOS: { id: MetodoPago; label: string; color: string; emoji: string }[] = [
  { id: 'efectivo',    label: 'Efectivo',    color: 'bg-green-500',  emoji: '💵' },
  { id: 'nequi',       label: 'Nequi',       color: 'bg-purple-500', emoji: '💜' },
  { id: 'daviplata',   label: 'Daviplata',   color: 'bg-red-500',    emoji: '❤️' },
  { id: 'bancolombia', label: 'Bancolombia', color: 'bg-yellow-500', emoji: '🟡' },
]

const PLATO_VACIO: Omit<Plato, 'id'> = { nombre: '', descripcion: '', precio: 0, costo: 0, categoria_id: 0, imagen_url: '', activo: true }

export default function GerenciaPage() {
  const [seccion, setSeccion] = useState<Seccion>('mesas')
  const [turnoActivo, setTurnoActivo] = useState<{ id: string; abierto_en: string; monto_inicial: number } | null>(null)
  const [stats, setStats] = useState({ ventas: 0, pedidos: 0, utilidad: 0 })
  const [platosTop, setPlatosTop] = useState<PlatoStat[]>([])
  const [meseras, setMeseras] = useState<MeseraStat[]>([])
  const [pedidosHoy, setPedidosHoy] = useState<PedidoResumen[]>([])

  // Mesas y cobro
  const [mesas, setMesas] = useState<{ id: number; numero: number; estado: string; zona: string | null }[]>([])
  const [domiActivos, setDomiActivos] = useState<{ id: string; created_at: string; total: number; cliente_nombre: string | null; cliente_telefono: string | null; estado: string; metodos: string[] }[]>([])
  const [mesaDetalle, setMesaDetalle] = useState<{ mesa: typeof mesas[0] | null; pedido: PedidoDetalle; pagos: PagoRegistrado[]; isDomi?: boolean } | null>(null)
  const [montoPago, setMontoPago] = useState(''); const [propinaPago, setPropinaPago] = useState('')
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo'); const [agregandoPago, setAgregandoPago] = useState(false)
  const [vistaModal, setVistaModal] = useState<'pago' | 'cliente'>('pago')

  // Captura cliente al cobrar
  const [cedulaCliente, setCedulaCliente] = useState('')
  const [clienteEncontrado, setClienteEncontrado] = useState<{ id: string; nombre: string; telefono: string | null } | null>(null)
  const [clienteForm, setClienteForm] = useState({ nombre: '', telefono: '', fecha_cumpleanos: '' })
  const [buscandoCl, setBuscandoCl] = useState(false)
  const [guardandoCl, setGuardandoCl] = useState(false)
  const [pedidoPagadoId, setPedidoPagadoId] = useState<string | null>(null)

  // Caja
  const [montoInicial, setMontoInicial] = useState('')
  const [modalCaja, setModalCaja] = useState<'abrir' | 'cerrar' | null>(null)
  const [conteoFinal, setConteoFinal] = useState<Record<string, string>>({})
  const [pagosPorMetodo, setPagosPorMetodo] = useState<{ metodo: string; monto: number; propina: number }[]>([])
  const [movimientosCaja, setMovimientosCaja] = useState<{ id: string; tipo: string; monto: number; descripcion: string | null; created_at: string }[]>([])
  const [nuevoMov, setNuevoMov] = useState({ tipo: 'egreso' as 'ingreso' | 'egreso', monto: '', descripcion: '' })
  const [agregandoMov, setAgregandoMov] = useState(false)
  // Inventario por turno
  const [pasoCaja, setPasoCaja] = useState<'efectivo' | 'inventario'>('efectivo')
  const [inventarioTurno, setInventarioTurno] = useState<Record<string, number>>({})
  const [resumenInventario, setResumenInventario] = useState<{ plato_id: string; nombre: string; categoria: string; precio: number; cantidad_inicial: number; cantidad_restante: number }[]>([])

  // Usuarios
  const [modalUsuario, setModalUsuario] = useState(false)
  const [nuevoUsuario, setNuevoUsuario] = useState({ nombre: '', email: '', password: '', rol: 'mesera' })
  const [creandoUsuario, setCreandoUsuario] = useState(false)
  const [listaUsuarios, setListaUsuarios] = useState<{ id: string; nombre: string; rol: string }[]>([])
  const [editandoUsuario, setEditandoUsuario] = useState<{ id: string; nombre: string; rol: string } | null>(null)
  const [guardandoUsuario, setGuardandoUsuario] = useState(false)

  // Tiempos
  const [tiemposPorPlato, setTiemposPorPlato] = useState<TiempoStat[]>([])
  const [tiemposPorCocinero, setTiemposPorCocinero] = useState<CocineroStat[]>([])
  const [tiemposPorMesera, setTiemposPorMesera] = useState<{ nombre: string; pedidos: number; tiempoPromedio: number }[]>([])

  // Resumen / informes
  const [rangoResumen, setRangoResumen] = useState<RangoResumen>('hoy')
  const hoyStr = new Date().toISOString().split('T')[0]
  const [fechaDesde, setFechaDesde] = useState(hoyStr)
  const [fechaHasta, setFechaHasta] = useState(hoyStr)
  const [ventasPorHora, setVentasPorHora] = useState<{ hora: string; ventas: number }[]>([])
  const [ventasPorDia, setVentasPorDia] = useState<{ dia: string; ventas: number; domis: number }[]>([])
  const [datosPagosMetodo, setDatosPagosMetodo] = useState<{ name: string; value: number; color: string }[]>([])
  const [resumenStats, setResumenStats] = useState({ ventas: 0, pedidos: 0, utilidad: 0, domis: 0 })
  const [cargandoResumen, setCargandoResumen] = useState(false)

  // Clientes
  const [clientes, setClientes] = useState<ClienteStat[]>([])
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [clienteDetalle, setClienteDetalle] = useState<{ cliente: ClienteStat; pedidos: ClientePedido[] } | null>(null)
  const [cargandoClientes, setCargandoClientes] = useState(false)
  const [ordenClientes, setOrdenClientes] = useState<'mayor_consumo' | 'menor_consumo' | 'az' | 'cumpleanos'>('mayor_consumo')
  const [filtroMesCumple, setFiltroMesCumple] = useState<number>(0) // 0 = todos los meses

  // Gestión de zonas y mesas
  const [modoGestionMesas, setModoGestionMesas] = useState(false)
  const [modalNuevaZona, setModalNuevaZona] = useState(false)
  const [nuevaZonaNombre, setNuevaZonaNombre] = useState('')
  const [modalRenombrarZona, setModalRenombrarZona] = useState<string | null>(null)
  const [renombrarZonaValor, setRenombrarZonaValor] = useState('')
  const [modalAgregarMesa, setModalAgregarMesa] = useState<string | null>(null)
  const [nuevaMesaNumero, setNuevaMesaNumero] = useState('')
  const [guardandoMesa, setGuardandoMesa] = useState(false)
  const [modalQR, setModalQR] = useState<{ id: number; numero: number; zona: string | null } | null>(null)

  // Carta
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [platos, setPlatos] = useState<Plato[]>([])
  const [modalPlato, setModalPlato] = useState<'nuevo' | 'editar' | null>(null)
  const [platoForm, setPlatoForm] = useState<Omit<Plato, 'id'>>(PLATO_VACIO)
  const [platoEditandoId, setPlatoEditandoId] = useState<string | null>(null)
  const [guardandoPlato, setGuardandoPlato] = useState(false)
  const [categoriaActivaCarta, setCategoriaActivaCarta] = useState<number | 'todas'>('todas')

  const supabase = createClient()
  const hoy = new Date().toISOString().split('T')[0]

  // ── CARGAR MESAS ─────────────────────────────────────────────
  const cargarMesas = useCallback(async () => {
    const [{ data: mesasData }, { data: domiData }] = await Promise.all([
      supabase.from('mesas').select('*').order('numero'),
      supabase.from('pedidos')
        .select('id, created_at, estado, cliente_nombre, cliente_telefono, items:items_pedido(cantidad, precio_unitario)')
        .eq('tipo', 'domi')
        .gte('created_at', `${hoy}T00:00:00`)
        .neq('estado', 'cancelado')
        .order('created_at', { ascending: false }),
    ])
    if (mesasData) setMesas(mesasData)
    if (domiData) {
      const ids = domiData.map((p: unknown) => (p as { id: string }).id)
      // Cargar pagos de todos los domis en una sola consulta
      const { data: pagosDomi } = ids.length > 0
        ? await supabase.from('pagos').select('pedido_id, metodo, monto, propina').in('pedido_id', ids)
        : { data: [] }

      setDomiActivos(domiData.map((p: unknown) => {
        const ped = p as { id: string; created_at: string; estado: string; cliente_nombre: string | null; cliente_telefono: string | null; items: { cantidad: number; precio_unitario: number }[] }
        const total = ped.items?.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0) ?? 0
        const pagosEste = (pagosDomi || []).filter((pg: { pedido_id: string }) => pg.pedido_id === ped.id) as { metodo: string; monto: number; propina: number }[]
        const metodos = [...new Set(pagosEste.map(pg => pg.metodo))]
        return { id: ped.id, created_at: ped.created_at, total, cliente_nombre: ped.cliente_nombre, cliente_telefono: ped.cliente_telefono, estado: ped.estado, metodos }
      }))
    }
  }, [supabase])

  // ── CARGAR CARTA ─────────────────────────────────────────────
  const cargarCarta = useCallback(async () => {
    const [{ data: cats }, { data: pls }] = await Promise.all([
      supabase.from('categorias').select('*').order('orden'),
      supabase.from('platos').select('*').order('nombre'),
    ])
    if (cats) setCategorias(cats)
    if (pls) setPlatos(pls)
  }, [supabase])

  // ── CARGAR RESUMEN / INFORMES ────────────────────────────────
  const cargarResumen = useCallback(async (desde: string, hasta: string) => {
    setCargandoResumen(true)
    const desdeISO = `${desde}T00:00:00`
    const hastaISO = `${hasta}T23:59:59`
    const esSoloDia = desde === hasta

    const [{ data: pedidos }, { data: pagos }] = await Promise.all([
      supabase.from('pedidos')
        .select('id, created_at, tipo, items:items_pedido(cantidad, precio_unitario, plato:platos(costo))')
        .gte('created_at', desdeISO).lte('created_at', hastaISO).neq('estado', 'cancelado'),
      supabase.from('pagos')
        .select('metodo, monto, propina')
        .gte('created_at', desdeISO).lte('created_at', hastaISO),
    ])

    // KPIs del período
    let totalVentas = 0, totalUtilidad = 0, totalDomis = 0
    ;(pedidos || []).forEach((p: unknown) => {
      const ped = p as { tipo: string; items: { cantidad: number; precio_unitario: number; plato: { costo: number } }[] }
      const sub = ped.items?.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0) ?? 0
      totalVentas += sub
      totalUtilidad += ped.items?.reduce((a, i) => a + i.cantidad * (i.precio_unitario - (i.plato?.costo || 0)), 0) ?? 0
      if (ped.tipo === 'domi') totalDomis += sub
    })
    setResumenStats({ ventas: totalVentas, pedidos: (pedidos || []).length, utilidad: totalUtilidad, domis: totalDomis })

    // Gráfico: por hora si es un solo día, por fecha si es rango
    if (esSoloDia) {
      const porHora: Record<number, number> = {}
      for (let h = 6; h <= 22; h++) porHora[h] = 0
      ;(pedidos || []).forEach((p: unknown) => {
        const ped = p as { created_at: string; items: { cantidad: number; precio_unitario: number }[] }
        const h = new Date(ped.created_at).getHours()
        const total = ped.items?.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0) ?? 0
        if (h >= 6 && h <= 22) porHora[h] = (porHora[h] || 0) + total
      })
      setVentasPorHora(Object.entries(porHora).map(([h, v]) => ({ hora: `${h}h`, ventas: v })))
      setVentasPorDia([])
    } else {
      const porDia: Record<string, { ventas: number; domis: number; iso: string }> = {}
      ;(pedidos || []).forEach((p: unknown) => {
        const ped = p as { created_at: string; tipo: string; items: { cantidad: number; precio_unitario: number }[] }
        const iso = ped.created_at.split('T')[0]
        const dia = new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
        const total = ped.items?.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0) ?? 0
        if (!porDia[iso]) porDia[iso] = { ventas: 0, domis: 0, iso }
        porDia[iso].ventas += total
        if (ped.tipo === 'domi') porDia[iso].domis += total
        void dia
      })
      // Rellenar días vacíos dentro del rango
      const result: { dia: string; ventas: number; domis: number }[] = []
      const d = new Date(desde + 'T12:00:00')
      const fin = new Date(hasta + 'T12:00:00')
      while (d <= fin) {
        const iso = d.toISOString().split('T')[0]
        const etiqueta = d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
        const v = porDia[iso]
        result.push({ dia: etiqueta, ventas: (v?.ventas ?? 0) - (v?.domis ?? 0), domis: v?.domis ?? 0 })
        d.setDate(d.getDate() + 1)
      }
      setVentasPorDia(result)
      setVentasPorHora([])
    }

    // Torta métodos de pago
    const colores: Record<string, string> = { efectivo: '#22c55e', nequi: '#a855f7', daviplata: '#ef4444', bancolombia: '#eab308' }
    const porMetodo: Record<string, number> = {}
    ;(pagos || []).forEach((p: unknown) => {
      const pago = p as { metodo: string; monto: number; propina: number }
      porMetodo[pago.metodo] = (porMetodo[pago.metodo] || 0) + pago.monto + pago.propina
    })
    setDatosPagosMetodo(Object.entries(porMetodo).map(([m, v]) => ({
      name: m.charAt(0).toUpperCase() + m.slice(1), value: v, color: colores[m] || '#6b7280'
    })))
    setCargandoResumen(false)
  }, [supabase])

  // ── CARGAR CLIENTES ──────────────────────────────────────────
  const cargarClientes = useCallback(async () => {
    setCargandoClientes(true)
    const { data } = await supabase.from('clientes').select('*').order('nombre')
    if (!data) { setCargandoClientes(false); return }
    // Para cada cliente, obtener stats de pedidos vinculados
    const { data: pedidosClientes } = await supabase
      .from('pedidos').select('cliente_id, created_at, items:items_pedido(cantidad, precio_unitario)')
      .not('cliente_id', 'is', null).neq('estado', 'cancelado')

    const statsMap: Record<string, { pedidos: number; total: number; ultima: string }> = {}
    ;(pedidosClientes || []).forEach((p: unknown) => {
      const ped = p as { cliente_id: string; created_at: string; items: { cantidad: number; precio_unitario: number }[] }
      if (!ped.cliente_id) return
      const total = ped.items?.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0) ?? 0
      if (!statsMap[ped.cliente_id]) statsMap[ped.cliente_id] = { pedidos: 0, total: 0, ultima: '' }
      statsMap[ped.cliente_id].pedidos++
      statsMap[ped.cliente_id].total += total
      if (!statsMap[ped.cliente_id].ultima || ped.created_at > statsMap[ped.cliente_id].ultima)
        statsMap[ped.cliente_id].ultima = ped.created_at
    })
    setClientes(data.map((c: ClienteStat) => ({
      ...c,
      pedidos: statsMap[c.id]?.pedidos ?? 0,
      totalGastado: statsMap[c.id]?.total ?? 0,
      ultimaVisita: statsMap[c.id]?.ultima ?? null,
    })))
    setCargandoClientes(false)
  }, [supabase])

  async function abrirClienteDetalle(cliente: ClienteStat) {
    const { data } = await supabase.from('pedidos')
      .select('id, created_at, tipo, estado, items:items_pedido(cantidad, precio_unitario, plato:platos(nombre))')
      .eq('cliente_id', cliente.id).order('created_at', { ascending: false })
    const pedidos = (data || []).map((p: unknown) => {
      const ped = p as {
        id: string; created_at: string; tipo: string; estado: string
        items: { cantidad: number; precio_unitario: number; plato: { nombre: string } }[]
      }
      return {
        id: ped.id,
        created_at: ped.created_at,
        tipo: ped.tipo,
        estado: ped.estado,
        total: ped.items?.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0) ?? 0,
        items: ped.items?.map(i => ({
          nombre: i.plato?.nombre || '?',
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
        })) ?? [],
      }
    })
    setClienteDetalle({ cliente, pedidos })
  }

  // ── CARGAR CAJA ──────────────────────────────────────────────
  const cargarCaja = useCallback(async (turnoId: string) => {
    const { data: pedidosTurno } = await supabase
      .from('pedidos').select('id').eq('turno_id', turnoId).neq('estado', 'cancelado')

    const ids = (pedidosTurno || []).map((p: { id: string }) => p.id)
    const [{ data: pagos }, { data: movs }] = await Promise.all([
      ids.length > 0
        ? supabase.from('pagos').select('metodo, monto, propina').in('pedido_id', ids)
        : Promise.resolve({ data: [] }),
      supabase.from('movimientos_caja').select('*').eq('turno_id', turnoId).order('created_at'),
    ])

    const porMetodo: Record<string, { monto: number; propina: number }> = {}
    ;(pagos || []).forEach((p: { metodo: string; monto: number; propina: number }) => {
      if (!porMetodo[p.metodo]) porMetodo[p.metodo] = { monto: 0, propina: 0 }
      porMetodo[p.metodo].monto += p.monto
      porMetodo[p.metodo].propina += p.propina
    })
    setPagosPorMetodo(Object.entries(porMetodo).map(([metodo, v]) => ({ metodo, ...v })))
    setMovimientosCaja(movs || [])
  }, [supabase])

  // ── RESUMEN DE INVENTARIO AL CERRAR TURNO ───────────────────
  const cargarResumenInventario = useCallback(async (turnoId: string) => {
    const { data: snapshots } = await supabase
      .from('turnos_inventario')
      .select('plato_id, cantidad_inicial, plato:platos(nombre, precio, categoria:categorias(nombre))')
      .eq('turno_id', turnoId)
    if (!snapshots || snapshots.length === 0) { setResumenInventario([]); return }
    const platosIds = (snapshots as unknown as { plato_id: string }[]).map(s => s.plato_id)
    const { data: invActual } = await supabase
      .from('inventario').select('plato_id, cantidad_disponible').in('plato_id', platosIds)
    setResumenInventario((snapshots as unknown as {
      plato_id: string; cantidad_inicial: number;
      plato: { nombre: string; precio: number; categoria: { nombre: string } | null }
    }[]).map(s => {
      const inv = (invActual || []).find((i: { plato_id: string }) => i.plato_id === s.plato_id) as { cantidad_disponible: number } | undefined
      return {
        plato_id: s.plato_id,
        nombre: s.plato.nombre,
        categoria: s.plato.categoria?.nombre || '',
        precio: s.plato.precio,
        cantidad_inicial: s.cantidad_inicial,
        cantidad_restante: inv?.cantidad_disponible ?? 0,
      }
    }))
  }, [supabase])

  // ── CARGAR ESTADÍSTICAS Y TIEMPOS ────────────────────────────
  const cargarDatos = useCallback(async () => {
    const [{ data: pedidos }, { data: itemsTiempos }, { data: turno }] = await Promise.all([
      supabase.from('pedidos').select(`
        id, estado, tipo, created_at, pagado_en, turno_id,
        mesa:mesas(numero), mesera:usuarios(nombre),
        items:items_pedido(cantidad, precio_unitario, plato:platos(nombre, costo))
      `).gte('created_at', `${hoy}T00:00:00`).neq('estado', 'cancelado').order('created_at', { ascending: false }),

      supabase.from('items_pedido').select(`
        plato_id, cocinero, estado,
        created_at, tiempo_inicio_prep, tiempo_listo,
        pedido:pedidos(created_at, mesera:usuarios(nombre)),
        plato:platos(nombre)
      `).not('tiempo_listo', 'is', null).gte('created_at', `${hoy}T00:00:00`),

      supabase.from('turnos').select('*').is('cerrado_en', null).order('abierto_en', { ascending: false }).limit(1).maybeSingle(),
    ])

    setTurnoActivo(turno ?? null)
    if (turno?.id) cargarCaja(turno.id)

    if (pedidos) {
      let totalVentas = 0, totalUtilidad = 0
      const resumen: PedidoResumen[] = []
      const platosMap: Record<string, PlatoStat> = {}
      const mesesMap: Record<string, MeseraStat> = {}

      pedidos.forEach((p: unknown) => {
        const ped = p as {
          id: string; estado: string; tipo: string; created_at: string; pagado_en?: string | null; turno_id?: string | null
          mesa: { numero: number }; mesera: { nombre: string } | null
          items: { cantidad: number; precio_unitario: number; plato: { nombre: string; costo: number } }[]
        }
        let totalPedido = 0
        ped.items?.forEach(item => {
          const sub = item.cantidad * item.precio_unitario
          totalPedido += sub; totalVentas += sub
          totalUtilidad += item.cantidad * (item.precio_unitario - (item.plato?.costo || 0))
          const nm = item.plato?.nombre || '?'
          if (!platosMap[nm]) platosMap[nm] = { nombre: nm, cantidad: 0, total: 0 }
          platosMap[nm].cantidad += item.cantidad; platosMap[nm].total += sub
        })
        if (ped.mesera?.nombre) {
          const nm = ped.mesera.nombre
          if (!mesesMap[nm]) mesesMap[nm] = { nombre: nm, pedidos: 0, total: 0 }
          mesesMap[nm].pedidos++; mesesMap[nm].total += totalPedido
        }
        resumen.push({ id: ped.id, mesa: ped.mesa?.numero, total: totalPedido, estado: ped.estado, created_at: ped.created_at, pagado_en: ped.pagado_en, tipo: ped.tipo, turno_id: ped.turno_id })
      })
      setStats({ ventas: totalVentas, pedidos: pedidos.length, utilidad: totalUtilidad })
      setPlatosTop(Object.values(platosMap).sort((a, b) => b.cantidad - a.cantidad))
      setMeseras(Object.values(mesesMap).sort((a, b) => b.total - a.total))
      setPedidosHoy(resumen)
    }

    if (itemsTiempos) {
      // Tiempos por plato
      const porPlato: Record<string, { nombre: string; esperas: number[]; preps: number[]; totales: number[] }> = {}
      const porCocinero: Record<string, { platos: number; tiempos: number[] }> = {}
      const porMesera: Record<string, { pedidos: Set<string>; tiempos: number[] }> = {}

      itemsTiempos.forEach((i: unknown) => {
        const item = i as {
          plato_id: string; cocinero: string | null; estado: string
          created_at: string; tiempo_inicio_prep: string | null; tiempo_listo: string | null
          pedido: { created_at: string; mesera: { nombre: string } | null }
          plato: { nombre: string }
        }
        const nombre = item.plato?.nombre || '?'
        const t0 = new Date(item.created_at).getTime()
        const t1 = item.tiempo_inicio_prep ? new Date(item.tiempo_inicio_prep).getTime() : null
        const t2 = item.tiempo_listo ? new Date(item.tiempo_listo).getTime() : null

        if (!porPlato[nombre]) porPlato[nombre] = { nombre, esperas: [], preps: [], totales: [] }
        if (t1) porPlato[nombre].esperas.push((t1 - t0) / 60000)
        if (t1 && t2) porPlato[nombre].preps.push((t2 - t1) / 60000)
        if (t2) porPlato[nombre].totales.push((t2 - t0) / 60000)

        if (item.cocinero && t1 && t2) {
          if (!porCocinero[item.cocinero]) porCocinero[item.cocinero] = { platos: 0, tiempos: [] }
          porCocinero[item.cocinero].platos++
          porCocinero[item.cocinero].tiempos.push((t2 - t1) / 60000)
        }

        const meseraNm = item.pedido?.mesera?.nombre
        if (meseraNm && t2) {
          if (!porMesera[meseraNm]) porMesera[meseraNm] = { pedidos: new Set(), tiempos: [] }
          porMesera[meseraNm].tiempos.push((t2 - t0) / 60000)
        }
      })

      const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0

      setTiemposPorPlato(Object.values(porPlato).map(p => ({
        nombre: p.nombre,
        espera: avg(p.esperas),
        preparacion: avg(p.preps),
        total: avg(p.totales),
        cantidad: p.totales.length,
      })).sort((a, b) => b.cantidad - a.cantidad))

      setTiemposPorCocinero(Object.entries(porCocinero).map(([nombre, d]) => ({
        nombre, platos: d.platos, tiempoPromedio: avg(d.tiempos)
      })).sort((a, b) => b.platos - a.platos))

      setTiemposPorMesera(Object.entries(porMesera).map(([nombre, d]) => ({
        nombre, pedidos: d.pedidos.size, tiempoPromedio: avg(d.tiempos)
      })))
    }
  }, [supabase, hoy])

  useEffect(() => {
    cargarDatos(); cargarMesas(); cargarCarta()
    cargarResumen(hoyStr, hoyStr)
    const canal = supabase.channel('gerencia-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => { cargarDatos(); cargarMesas() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesas' }, cargarMesas)
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [cargarDatos, cargarMesas, cargarCarta, cargarResumen, supabase, hoyStr])

  // Cargar resumen de inventario al abrir modal cerrar turno
  useEffect(() => {
    if (modalCaja === 'cerrar' && turnoActivo) {
      cargarResumenInventario(turnoActivo.id)
    }
    if (modalCaja !== 'abrir') {
      // Limpiar paso caja al cerrar modal
      if (modalCaja === null) { setPasoCaja('efectivo') }
    }
  }, [modalCaja, turnoActivo, cargarResumenInventario])

  useEffect(() => {
    if (seccion === 'resumen') {
      if (rangoResumen === 'personalizado') return // se dispara manualmente con el botón
      let desde = hoyStr
      const hasta = hoyStr
      if (rangoResumen === 'semana') {
        const d = new Date(); d.setDate(d.getDate() - 6)
        desde = d.toISOString().split('T')[0]
      } else if (rangoResumen === 'mes') {
        const d = new Date(); d.setDate(1)
        desde = d.toISOString().split('T')[0]
      }
      cargarResumen(desde, hasta)
    }
    if (seccion === 'clientes') cargarClientes()
    if (seccion === 'usuarios') {
      supabase.from('usuarios').select('id, nombre, rol').order('nombre').then(({ data }) => {
        if (data) setListaUsuarios(data)
      })
    }
  }, [seccion, rangoResumen, cargarResumen, cargarClientes, hoyStr, supabase])

  // ── DETALLE MESA ─────────────────────────────────────────────
  async function abrirDetalleMesa(mesa: typeof mesas[0]) {
    if (mesa.estado === 'libre') { toast('Mesa libre'); return }
    const { data: pedido } = await supabase.from('pedidos').select(`
      id, estado, tipo, created_at, notas, cliente_nombre, cliente_cedula, cliente_telefono,
      mesa:mesas(numero), mesera:usuarios(nombre),
      items:items_pedido(estado, cantidad, precio_unitario, notas, plato:platos(nombre))
    `).eq('mesa_id', mesa.id).in('estado', ['pendiente','en_preparacion','listo','entregado','esperando_pago'])
      .order('created_at', { ascending: false }).limit(1).single()
    if (!pedido) { toast.error('No se encontró el pedido'); return }
    const { data: pagos } = await supabase.from('pagos').select('*').eq('pedido_id', pedido.id).order('created_at')
    const p = pedido as typeof pedido & { cliente_nombre: string | null; cliente_cedula: string | null; cliente_telefono: string | null }
    const fmt: PedidoDetalle = {
      ...pedido,
      mesa: (pedido.mesa as unknown as { numero: number }),
      mesera: pedido.mesera as unknown as { nombre: string } | null,
      items: (pedido.items as unknown as { estado: string; cantidad: number; precio_unitario: number; notas: string | null; plato: { nombre: string } }[])
        .map(i => ({ nombre: i.plato?.nombre || '', cantidad: i.cantidad, precio_unitario: i.precio_unitario, notas: i.notas, estado: i.estado })),
      cliente_nombre:   p.cliente_nombre,
      cliente_cedula:   p.cliente_cedula,
      cliente_telefono: p.cliente_telefono,
    }
    // Si el pedido ya tiene datos del cliente (vino por QR), pre-llenamos el formulario
    if (p.cliente_cedula) {
      setCedulaCliente(p.cliente_cedula)
      setClienteForm({ nombre: p.cliente_nombre || '', telefono: p.cliente_telefono || '', fecha_cumpleanos: '' })
      const { data: cl } = await supabase.from('clientes').select('id, nombre, telefono').eq('cedula', p.cliente_cedula).single()
      if (cl) setClienteEncontrado(cl)
    }
    setMesaDetalle({ mesa, pedido: fmt, pagos: (pagos || []) as PagoRegistrado[] })
    setMontoPago(''); setPropinaPago(''); setMetodoPago('efectivo'); setVistaModal('pago')
  }

  async function abrirDetalleDomi(pedidoId: string) {
    const { data: pedido } = await supabase.from('pedidos').select(`
      id, estado, tipo, created_at, notas, cliente_nombre, cliente_cedula, cliente_telefono, cliente_direccion,
      mesera:usuarios(nombre),
      items:items_pedido(estado, cantidad, precio_unitario, notas, plato:platos(nombre))
    `).eq('id', pedidoId).single()
    if (!pedido) { toast.error('No se encontró el domi'); return }
    const { data: pagos } = await supabase.from('pagos').select('*').eq('pedido_id', pedido.id).order('created_at')
    const p = pedido as typeof pedido & { cliente_nombre: string | null; cliente_cedula: string | null; cliente_telefono: string | null; cliente_direccion: string | null }
    const fmt: PedidoDetalle = {
      ...pedido,
      mesa: { numero: 0 } as { numero: number },
      mesera: pedido.mesera as unknown as { nombre: string } | null,
      items: (pedido.items as unknown as { estado: string; cantidad: number; precio_unitario: number; notas: string | null; plato: { nombre: string } }[])
        .map(i => ({ nombre: i.plato?.nombre || '', cantidad: i.cantidad, precio_unitario: i.precio_unitario, notas: i.notas, estado: i.estado })),
      cliente_nombre: p.cliente_nombre,
      cliente_cedula: p.cliente_cedula,
      cliente_telefono: p.cliente_telefono,
      cliente_direccion: p.cliente_direccion,
    }
    setMesaDetalle({ mesa: null, pedido: fmt, pagos: (pagos || []) as PagoRegistrado[], isDomi: true })
    setMontoPago(''); setPropinaPago(''); setMetodoPago('efectivo'); setVistaModal('pago')
  }

  async function agregarPago() {
    if (!mesaDetalle || !montoPago) return
    // ── Bloqueo: todos los ítems deben estar listos o entregados ──────────────
    const hayEnPreparacion = mesaDetalle.pedido.items.some(
      i => i.estado === 'pendiente' || i.estado === 'en_preparacion'
    )
    if (hayEnPreparacion) {
      toast.error('⏳ Hay platos que aún no han salido de cocina. Espera a que todo esté listo.')
      return
    }
    setAgregandoPago(true)
    const monto = parseFloat(montoPago); const propina = parseFloat(propinaPago || '0')
    if (isNaN(monto) || monto <= 0) { toast.error('Monto inválido'); setAgregandoPago(false); return }
    await supabase.from('pagos').insert({ pedido_id: mesaDetalle.pedido.id, metodo: metodoPago, monto, propina })
    const { data: pagosActualizados } = await supabase.from('pagos').select('*').eq('pedido_id', mesaDetalle.pedido.id).order('created_at')
    const totalPagadoNuevo = (pagosActualizados || []).reduce((a: number, p: PagoRegistrado) => a + p.monto + p.propina, 0)
    const totalPedidoActual = mesaDetalle.pedido.items.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0)
    setMontoPago(''); setPropinaPago('')
    if (totalPagadoNuevo >= totalPedidoActual) {
      // Pago completo → cerrar pedido + (si tiene mesa) liberarla
      await supabase.from('pedidos').update({ estado: 'pagado', pagado_en: new Date().toISOString() }).eq('id', mesaDetalle.pedido.id)
      if (!mesaDetalle.isDomi && mesaDetalle.mesa) {
        await supabase.from('mesas').update({ estado: 'libre' }).eq('id', mesaDetalle.mesa.id)
        toast.success(`✅ Mesa ${mesaDetalle.mesa.numero} pagada y liberada`)
      } else {
        toast.success('✅ Domi pagado')
      }
      setPedidoPagadoId(mesaDetalle.pedido.id)
      // Si el pedido ya trae datos del cliente (pedido por QR), no preguntamos de nuevo
      if (mesaDetalle.pedido.cliente_cedula) {
        setMesaDetalle(null)
        setCedulaCliente(''); setClienteEncontrado(null); setClienteForm({ nombre: '', telefono: '', fecha_cumpleanos: '' })
        setVistaModal('pago')
      } else {
        setCedulaCliente(''); setClienteEncontrado(null); setClienteForm({ nombre: '', telefono: '', fecha_cumpleanos: '' })
        setVistaModal('cliente')
      }
      cargarMesas(); cargarDatos()
    } else {
      setMesaDetalle(prev => prev ? { ...prev, pagos: (pagosActualizados || []) as PagoRegistrado[] } : null)
      toast.success(`Falta: $${(totalPedidoActual - totalPagadoNuevo).toLocaleString('es-CO')}`)
    }
    setAgregandoPago(false)
  }

  async function cerrarMesa() {
    if (!mesaDetalle) return
    await supabase.from('pedidos').update({ estado: 'pagado', pagado_en: new Date().toISOString() }).eq('id', mesaDetalle.pedido.id)
    if (!mesaDetalle.isDomi && mesaDetalle.mesa) {
      await supabase.from('mesas').update({ estado: 'libre' }).eq('id', mesaDetalle.mesa.id)
      toast.success(`Mesa ${mesaDetalle.mesa.numero} cerrada ✓`)
    } else {
      toast.success('Domi cerrado ✓')
    }
    setMesaDetalle(null); setVistaModal('pago'); cargarMesas(); cargarDatos()
  }

  async function buscarCliente() {
    if (!cedulaCliente.trim()) return
    setBuscandoCl(true)
    const { data } = await supabase.from('clientes').select('id, nombre, telefono').eq('cedula', cedulaCliente.trim()).single()
    if (data) { setClienteEncontrado(data); setClienteForm({ nombre: data.nombre, telefono: data.telefono || '', fecha_cumpleanos: '' }) }
    else { setClienteEncontrado(null); setClienteForm({ nombre: '', telefono: '', fecha_cumpleanos: '' }) }
    setBuscandoCl(false)
  }

  async function guardarCliente() {
    if (!cedulaCliente.trim() || !clienteForm.nombre.trim()) { toast.error('Cédula y nombre son obligatorios'); return }
    setGuardandoCl(true)
    let clienteId = clienteEncontrado?.id
    if (!clienteEncontrado) {
      const { data: nuevo } = await supabase.from('clientes').insert({
        cedula: cedulaCliente.trim(),
        nombre: clienteForm.nombre.trim(),
        telefono: clienteForm.telefono || null,
        fecha_cumpleanos: clienteForm.fecha_cumpleanos || null,
      }).select('id').single()
      clienteId = nuevo?.id
    }
    if (clienteId && pedidoPagadoId) {
      await supabase.from('pedidos').update({ cliente_id: clienteId }).eq('id', pedidoPagadoId)
    }
    toast.success(clienteEncontrado ? `Cliente registrado en pedido ✓` : `¡Cliente ${clienteForm.nombre} guardado!`)
    setMesaDetalle(null); setVistaModal('pago'); setGuardandoCl(false)
  }

  function saltarCliente() {
    setMesaDetalle(null); setVistaModal('pago'); setCedulaCliente(''); setClienteEncontrado(null)
  }

  const totalPedido = mesaDetalle?.pedido.items.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0) ?? 0
  const totalPagado = mesaDetalle?.pagos.reduce((a, p) => a + p.monto + p.propina, 0) ?? 0
  const saldoPendiente = totalPedido - totalPagado
  const vuelto = totalPagado > totalPedido ? totalPagado - totalPedido : 0
  // Bloqueo de pago: ningún ítem puede estar pendiente o en preparación
  const itemsSinListar  = mesaDetalle?.pedido.items.filter(i => i.estado === 'pendiente' || i.estado === 'en_preparacion') ?? []
  const pedidoListoPagar = itemsSinListar.length === 0

  // ── CAJA ─────────────────────────────────────────────────────
  async function irAInventario() {
    // Pre-cargar cantidades actuales de inventario para el formulario
    const { data: invActual } = await supabase.from('inventario').select('plato_id, cantidad_disponible')
    if (invActual) {
      const init: Record<string, number> = {}
      ;(invActual as { plato_id: string; cantidad_disponible: number }[]).forEach(i => {
        init[i.plato_id] = i.cantidad_disponible
      })
      setInventarioTurno(init)
    }
    setPasoCaja('inventario')
  }

  async function abrirTurno() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: nuevoTurno } = await supabase
      .from('turnos').insert({ abierto_por: user?.id, monto_inicial: parseFloat(montoInicial) || 0 })
      .select().single()

    if (nuevoTurno?.id) {
      // Guardar snapshot de inventario para este turno
      const entries = Object.entries(inventarioTurno).filter(([, qty]) => qty > 0)
      if (entries.length > 0) {
        for (const [platoId, qty] of entries) {
          await supabase.from('inventario').update({ cantidad_disponible: qty }).eq('plato_id', platoId)
          await supabase.from('turnos_inventario').insert({ turno_id: nuevoTurno.id, plato_id: platoId, cantidad_inicial: qty })
        }
      }
      cargarCaja(nuevoTurno.id)
    }

    toast.success('Turno abierto')
    setModalCaja(null); setMontoInicial(''); setPasoCaja('efectivo'); setInventarioTurno({})
    await cargarDatos()
  }
  async function cerrarTurno() {
    if (!turnoActivo) { toast.error('No hay turno activo'); return }
    const montoFinalTotal = Object.values(conteoFinal).reduce((a, v) => a + (parseFloat(v) || 0), 0)
    const { error } = await supabase
      .from('turnos')
      .update({ cerrado_en: new Date().toISOString(), monto_final: montoFinalTotal })
      .eq('id', turnoActivo.id)
    if (error) { toast.error('Error al cerrar turno: ' + error.message); return }
    toast.success('Turno cerrado ✓')
    setModalCaja(null); setConteoFinal({})
    setPagosPorMetodo([]); setMovimientosCaja([])
    cargarDatos()
  }

  async function agregarMovimiento() {
    if (!turnoActivo) { toast.error('No hay turno activo'); return }
    if (!nuevoMov.monto || parseFloat(nuevoMov.monto) <= 0) { toast.error('Ingresa un monto válido'); return }
    if (!nuevoMov.descripcion.trim()) { toast.error('Escribe una descripción'); return }
    setAgregandoMov(true)
    const { error } = await supabase.from('movimientos_caja').insert({
      turno_id: turnoActivo.id,
      tipo: nuevoMov.tipo,
      monto: parseFloat(nuevoMov.monto),
      descripcion: nuevoMov.descripcion.trim(),
    })
    if (error) { toast.error('Error al guardar'); setAgregandoMov(false); return }
    toast.success(nuevoMov.tipo === 'ingreso' ? '✓ Ingreso registrado' : '✓ Egreso registrado')
    setNuevoMov({ tipo: 'egreso', monto: '', descripcion: '' })
    cargarCaja(turnoActivo.id)
    setAgregandoMov(false)
  }

  // ── USUARIOS ─────────────────────────────────────────────────
  async function crearUsuario() {
    if (!nuevoUsuario.nombre || !nuevoUsuario.email || !nuevoUsuario.password) {
      toast.error('Completa todos los campos'); return
    }
    setCreandoUsuario(true)
    try {
      const res = await fetch('/api/crear-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevoUsuario),
      })
      const data = await res.json()
      if (!res.ok) { toast.error('Error: ' + data.error); setCreandoUsuario(false); return }
      toast.success(`✅ Usuario ${nuevoUsuario.nombre} creado correctamente`)
      setModalUsuario(false)
      setNuevoUsuario({ nombre: '', email: '', password: '', rol: 'mesera' })
      // Recargar lista
      const { data: ul } = await supabase.from('usuarios').select('id, nombre, rol').order('nombre')
      if (ul) setListaUsuarios(ul)
    } catch {
      toast.error('Error de conexión al crear usuario')
    }
    setCreandoUsuario(false)
  }

  // ── EDITAR USUARIO (rol / nombre) ────────────────────────────
  async function guardarCambiosUsuario() {
    if (!editandoUsuario) return
    setGuardandoUsuario(true)
    const { error } = await supabase
      .from('usuarios')
      .update({ nombre: editandoUsuario.nombre.trim(), rol: editandoUsuario.rol })
      .eq('id', editandoUsuario.id)
    setGuardandoUsuario(false)
    if (error) { toast.error('No se pudo guardar'); return }
    toast.success('✅ Usuario actualizado')
    setEditandoUsuario(null)
    const { data: ul } = await supabase.from('usuarios').select('id, nombre, rol').order('nombre')
    if (ul) setListaUsuarios(ul)
  }

  // ── GESTIÓN ZONAS / MESAS ────────────────────────────────────
  async function crearZonaConMesa() {
    if (!nuevaZonaNombre.trim()) { toast.error('Escribe el nombre de la zona'); return }
    const num = parseInt(nuevaMesaNumero)
    if (isNaN(num) || num <= 0) { toast.error('Número de mesa inválido'); return }
    setGuardandoMesa(true)
    const { error } = await supabase.from('mesas').insert({ numero: num, estado: 'libre', zona: nuevaZonaNombre.trim() })
    setGuardandoMesa(false)
    if (error) { toast.error('Error: ' + error.message); return }
    toast.success(`Zona "${nuevaZonaNombre.trim()}" creada con mesa ${num}`)
    setModalNuevaZona(false); setNuevaZonaNombre(''); setNuevaMesaNumero('')
    await cargarMesas()
  }

  async function agregarMesaEnZona(zona: string) {
    const num = parseInt(nuevaMesaNumero)
    if (isNaN(num) || num <= 0) { toast.error('Número inválido'); return }
    setGuardandoMesa(true)
    const { error } = await supabase.from('mesas').insert({ numero: num, estado: 'libre', zona })
    setGuardandoMesa(false)
    if (error) { toast.error('Error: ' + error.message); return }
    toast.success(`Mesa ${num} agregada`)
    setModalAgregarMesa(null); setNuevaMesaNumero('')
    await cargarMesas()
  }

  async function renombrarZona(viejo: string, nuevo: string) {
    if (!nuevo.trim()) { toast.error('Escribe el nuevo nombre'); return }
    const { error } = await supabase.from('mesas').update({ zona: nuevo.trim() }).eq('zona', viejo)
    if (error) { toast.error('Error: ' + error.message); return }
    toast.success('Zona renombrada')
    setModalRenombrarZona(null); setRenombrarZonaValor('')
    await cargarMesas()
  }

  async function eliminarMesa(id: number) {
    const mesa = mesas.find(m => m.id === id)
    if (mesa?.estado !== 'libre') { toast.error('Solo puedes eliminar mesas que estén libres'); return }
    if (!confirm('¿Eliminar esta mesa?')) return
    const { error } = await supabase.from('mesas').delete().eq('id', id)
    if (error) { toast.error('Error: ' + error.message); return }
    toast.success('Mesa eliminada')
    await cargarMesas()
  }

  // ── CARTA ─────────────────────────────────────────────────────
  function abrirNuevoPlato() {
    setPlatoForm({ ...PLATO_VACIO, categoria_id: categorias[0]?.id || 0 })
    setPlatoEditandoId(null); setModalPlato('nuevo')
  }
  function abrirEditarPlato(plato: Plato) {
    setPlatoForm({ nombre: plato.nombre, descripcion: plato.descripcion || '', precio: plato.precio, costo: plato.costo || 0, categoria_id: plato.categoria_id, imagen_url: plato.imagen_url || '', activo: plato.activo })
    setPlatoEditandoId(plato.id); setModalPlato('editar')
  }
  async function guardarPlato() {
    if (!platoForm.nombre || !platoForm.precio || !platoForm.categoria_id) { toast.error('Completa nombre, precio y categoría'); return }
    setGuardandoPlato(true)
    const datos = { nombre: platoForm.nombre, descripcion: platoForm.descripcion || null, precio: platoForm.precio, costo: platoForm.costo || null, categoria_id: platoForm.categoria_id, imagen_url: platoForm.imagen_url || null, activo: platoForm.activo }
    if (modalPlato === 'nuevo') {
      const { data: nuevoPl, error } = await supabase.from('platos').insert(datos).select().single()
      if (error) { toast.error('Error al crear plato'); setGuardandoPlato(false); return }
      await supabase.from('inventario').insert({ plato_id: nuevoPl.id, cantidad_disponible: 0, alerta_minima: 3 })
      toast.success('Plato creado')
    } else {
      await supabase.from('platos').update(datos).eq('id', platoEditandoId!)
      toast.success('Plato actualizado')
    }
    setModalPlato(null); setGuardandoPlato(false); cargarCarta()
  }
  async function toggleActivoPlato(plato: Plato) {
    await supabase.from('platos').update({ activo: !plato.activo }).eq('id', plato.id)
    toast.success(plato.activo ? 'Plato desactivado' : 'Plato activado')
    cargarCarta()
  }
  async function eliminarPlato(plato: Plato) {
    if (!confirm(`¿Eliminar "${plato.nombre}"? Esta acción no se puede deshacer.`)) return
    await supabase.from('platos').delete().eq('id', plato.id)
    toast.success('Plato eliminado'); cargarCarta()
  }

  const platosFiltradosCarta = categoriaActivaCarta === 'todas' ? platos : platos.filter(p => p.categoria_id === categoriaActivaCarta)
  const utilidadPlato = (p: Plato) => p.costo ? ((p.precio - p.costo) / p.precio * 100).toFixed(0) : null

  // ── CLIENTES: filtrado, ordenado y exportación ────────────────
  const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  const clientesFiltradosOrdenados = clientes
    .filter(c =>
      (!busquedaCliente ||
        c.nombre.toLowerCase().includes(busquedaCliente.toLowerCase()) ||
        (c.cedula || '').includes(busquedaCliente)) &&
      (filtroMesCumple === 0 ||
        (c.fecha_cumpleanos != null &&
          new Date(c.fecha_cumpleanos + 'T12:00:00').getMonth() + 1 === filtroMesCumple))
    )
    .sort((a, b) => {
      if (ordenClientes === 'mayor_consumo') return b.totalGastado - a.totalGastado
      if (ordenClientes === 'menor_consumo') return a.totalGastado - b.totalGastado
      if (ordenClientes === 'az') return a.nombre.localeCompare(b.nombre, 'es')
      if (ordenClientes === 'cumpleanos') {
        // Ordena por proximidad del cumpleaños al día de hoy
        const hoy = new Date()
        const mesHoy = hoy.getMonth() + 1
        const diaHoy = hoy.getDate()
        const diasHasta = (c: ClienteStat) => {
          if (!c.fecha_cumpleanos) return 9999
          const [, mm, dd] = c.fecha_cumpleanos.split('-').map(Number)
          let diff = (mm - mesHoy) * 31 + (dd - diaHoy)
          if (diff < 0) diff += 365
          return diff
        }
        return diasHasta(a) - diasHasta(b)
      }
      return 0
    })

  function exportarClientesCSV() {
    const lista = clientesFiltradosOrdenados
    if (lista.length === 0) { toast('No hay clientes para exportar'); return }
    const encabezado = ['Nombre', 'Cédula', 'Teléfono', 'Cumpleaños', 'Visitas', 'Total gastado ($)', 'Última visita']
    const filas = lista.map(c => [
      c.nombre,
      c.cedula || '',
      c.telefono || '',
      c.fecha_cumpleanos
        ? new Date(c.fecha_cumpleanos + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })
        : '',
      String(c.pedidos),
      String(c.totalGastado),
      c.ultimaVisita
        ? new Date(c.ultimaVisita).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
        : '',
    ])
    // Punto y coma como separador — Excel en español lo requiere así
    const csv = [encabezado, ...filas].map(row => row.map(v => `"${v}"`).join(';')).join('\n')
    // BOM para que Excel reconozca tildes y ñ correctamente
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clientes_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`${lista.length} clientes exportados ✓`)
  }

  // Zonas únicas derivadas de las mesas (orden alfabético, nulas al final)
  const zonasLista = [...new Set(mesas.map(m => m.zona || 'Sin zona'))].sort((a, b) =>
    a === 'Sin zona' ? 1 : b === 'Sin zona' ? -1 : a.localeCompare(b, 'es')
  )

  const nav = [
    { id: 'mesas',    label: 'Mesas',    icon: <MapPin size={16} />          },
    { id: 'carta',    label: 'Carta',    icon: <UtensilsCrossed size={16} /> },
    { id: 'resumen',  label: 'Informes', icon: <BarChart3 size={16} />       },
    { id: 'tiempos',  label: 'Tiempos',  icon: <Timer size={16} />           },
    { id: 'clientes', label: 'Clientes', icon: <UserCircle size={16} />      },
    { id: 'caja',     label: 'Caja',     icon: <DollarSign size={16} />      },
    { id: 'usuarios', label: 'Usuarios', icon: <Plus size={16} />            },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-purple-600 p-2 rounded-xl"><BarChart3 size={22} className="text-white" /></div>
          <div>
            <h1 className="font-bold text-gray-900">Panel Gerencia</h1>
            <p className="text-xs text-gray-400">{new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${turnoActivo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {turnoActivo ? '● Turno abierto' : '○ Sin turno'}
        </div>
      </div>

      {/* Navegación */}
      <div className="flex gap-1 px-4 py-3 bg-white border-b overflow-x-auto">
        {nav.map(n => (
          <button key={n.id} onClick={() => setSeccion(n.id as Seccion)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${seccion === n.id ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {n.icon} {n.label}
          </button>
        ))}
      </div>

      <div className="p-4">

        {/* ══ MESAS ══════════════════════════════════════════════ */}
        {seccion === 'mesas' && (
          <div>
            {/* Header: leyenda + botón gestionar */}
            <div className="flex items-center justify-between mb-4">
              {!modoGestionMesas ? (
                <div className="flex gap-3 text-xs flex-wrap">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-200 inline-block" /> Libre</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-400 inline-block" /> Ocupada</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" /> Esperando pago</span>
                </div>
              ) : (
                <p className="text-sm font-bold text-purple-700">Modo gestión de mesas</p>
              )}
              <button onClick={() => setModoGestionMesas(g => !g)}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors ${modoGestionMesas ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                <Settings size={13} /> {modoGestionMesas ? 'Salir' : 'Gestionar'}
              </button>
            </div>

            {modoGestionMesas ? (
              /* ── MODO GESTIÓN ── */
              <div className="space-y-4">
                <button onClick={() => { setModalNuevaZona(true); setNuevaZonaNombre(''); setNuevaMesaNumero('') }}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2">
                  <Plus size={18} /> Nueva zona
                </button>
                {zonasLista.length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-8">No hay zonas. Crea la primera.</p>
                )}
                {zonasLista.map(zona => (
                  <div key={zona} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-center justify-between mb-3 gap-2">
                      <span className="font-bold text-gray-900 text-base">{zona}</span>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => { setModalRenombrarZona(zona); setRenombrarZonaValor(zona) }}
                          className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1.5 rounded-lg flex items-center gap-1 font-medium">
                          <Pencil size={12} /> Renombrar
                        </button>
                        <button onClick={() => { setModalAgregarMesa(zona); setNuevaMesaNumero('') }}
                          className="text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 px-2 py-1.5 rounded-lg flex items-center gap-1 font-medium">
                          <Plus size={12} /> Mesa
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {mesas
                        .filter(m => (m.zona || 'Sin zona') === zona)
                        .sort((a, b) => a.numero - b.numero)
                        .map(m => (
                          <div key={m.id} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                            <span className="font-bold text-gray-700 text-sm">Mesa {m.numero}</span>
                            <button onClick={() => setModalQR(m)} className="text-gray-400 hover:text-purple-600 ml-0.5" title="Ver QR">
                              <span className="text-xs">QR</span>
                            </button>
                            {m.estado === 'libre' ? (
                              <button onClick={() => eliminarMesa(m.id)} className="text-red-400 hover:text-red-600 ml-0.5" title="Eliminar">
                                <X size={14} />
                              </button>
                            ) : (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${m.estado === 'ocupada' ? 'bg-orange-100 text-orange-600' : 'bg-yellow-100 text-yellow-700'}`}>
                                {m.estado === 'ocupada' ? 'ocupada' : 'cobrando'}
                              </span>
                            )}
                          </div>
                        ))}
                      {mesas.filter(m => (m.zona || 'Sin zona') === zona).length === 0 && (
                        <p className="text-sm text-gray-400 italic">Sin mesas</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* ── MODO NORMAL: agrupado por zona ── */
              <div className="space-y-5">
                {zonasLista.map(zona => (
                  <div key={zona}>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{zona}</h3>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {mesas
                        .filter(m => (m.zona || 'Sin zona') === zona)
                        .sort((a, b) => a.numero - b.numero)
                        .map(mesa => (
                          <button key={mesa.id} onClick={() => abrirDetalleMesa(mesa)}
                            className={`rounded-2xl p-4 text-center font-bold transition-all border-2 ${
                              mesa.estado === 'libre'          ? 'bg-white border-gray-200 text-gray-500' :
                              mesa.estado === 'ocupada'        ? 'bg-orange-50 border-orange-400 text-orange-700' :
                              'bg-yellow-50 border-yellow-400 text-yellow-700'
                            }`}>
                            <p className="text-3xl font-black">{mesa.numero}</p>
                            <p className="text-xs mt-1 capitalize">{mesa.estado.replace('_', ' ')}</p>
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
                {mesas.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-gray-400 text-sm mb-3">No hay mesas configuradas.</p>
                    <button onClick={() => setModoGestionMesas(true)} className="text-purple-600 font-bold text-sm underline">
                      Crear primera zona →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Panel domicilios del día */}
            {domiActivos.length > 0 && (
              <div className="mt-5">
                <h3 className="font-bold text-gray-700 text-sm mb-2 flex items-center gap-2">🛵 Domicilios de hoy</h3>
                <div className="space-y-2">
                  {domiActivos.map(d => {
                    const mins = Math.floor((Date.now() - new Date(d.created_at).getTime()) / 60000)
                    const pagado = d.estado === 'pagado'
                    const EMOJIS: Record<string, string> = { efectivo: '💵', nequi: '💜', daviplata: '❤️', bancolombia: '🟡' }
                    return (
                      <button key={d.id} onClick={() => !pagado && abrirDetalleDomi(d.id)}
                        disabled={pagado}
                        className={`w-full rounded-2xl px-4 py-3 text-left transition-colors border ${pagado ? 'bg-gray-50 border-gray-200 opacity-70 cursor-default' : 'bg-blue-50 border-blue-200 hover:bg-blue-100'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-black px-2 py-0.5 rounded-full ${pagado ? 'bg-gray-400 text-white' : 'bg-blue-600 text-white'}`}>
                                {pagado ? '✓ PAGADO' : 'DOMI'}
                              </span>
                              <span className="font-bold text-gray-900 text-sm">
                                {d.cliente_nombre || <span className="text-gray-400 italic font-normal">Sin nombre</span>}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              {d.cliente_telefono && <span className="text-xs text-gray-500">📞 {d.cliente_telefono}</span>}
                              <span className="text-xs font-semibold text-gray-700">${d.total.toLocaleString('es-CO')}</span>
                              {d.metodos.length > 0 && (
                                <span className="text-xs text-gray-500">{d.metodos.map(m => EMOJIS[m] || m).join(' ')} {d.metodos.join(' / ')}</span>
                              )}
                            </div>
                          </div>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${pagado ? 'bg-gray-100 text-gray-500' : mins >= 40 ? 'bg-red-100 text-red-700' : mins >= 20 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                            {pagado ? new Date(d.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : `${mins} min`}
                          </span>
                        </div>
                        {!pagado && <p className="text-xs text-blue-500 mt-1">Toca para cobrar →</p>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ CARTA ══════════════════════════════════════════════ */}
        {seccion === 'carta' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Gestión de carta</h2>
              <button onClick={abrirNuevoPlato} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                <Plus size={16} /> Nuevo plato
              </button>
            </div>

            {/* Filtro por categoría */}
            <div className="flex gap-2 mb-4 overflow-x-auto">
              <button onClick={() => setCategoriaActivaCarta('todas')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${categoriaActivaCarta === 'todas' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                Todas
              </button>
              {categorias.map(c => (
                <button key={c.id} onClick={() => setCategoriaActivaCarta(c.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${categoriaActivaCarta === c.id ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {c.nombre}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {platosFiltradosCarta.map(plato => {
                const margen = utilidadPlato(plato)
                return (
                  <div key={plato.id} className={`bg-white rounded-2xl p-4 border ${plato.activo ? 'border-gray-100' : 'border-gray-200 opacity-60'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900">{plato.nombre}</p>
                          {!plato.activo && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Inactivo</span>}
                          {margen && <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${parseInt(margen) >= 50 ? 'bg-green-100 text-green-700' : parseInt(margen) >= 30 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{margen}% margen</span>}
                        </div>
                        {plato.descripcion && <p className="text-xs text-gray-400 mt-0.5 truncate">{plato.descripcion}</p>}
                        <div className="flex gap-4 mt-1">
                          <span className="text-sm font-bold text-gray-900">${plato.precio.toLocaleString('es-CO')} <span className="font-normal text-gray-400">precio</span></span>
                          {plato.costo ? <span className="text-sm text-gray-500">${plato.costo.toLocaleString('es-CO')} <span className="text-gray-400">costo</span></span> : <span className="text-xs text-orange-400">Sin costo registrado</span>}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{categorias.find(c => c.id === plato.categoria_id)?.nombre}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => abrirEditarPlato(plato)} className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center"><Pencil size={14} className="text-gray-600" /></button>
                        <button onClick={() => toggleActivoPlato(plato)} className={`w-8 h-8 rounded-xl flex items-center justify-center ${plato.activo ? 'bg-orange-100 hover:bg-orange-200' : 'bg-green-100 hover:bg-green-200'}`}>
                          {plato.activo ? <X size={14} className="text-orange-600" /> : <CheckCircle size={14} className="text-green-600" />}
                        </button>
                        <button onClick={() => eliminarPlato(plato)} className="w-8 h-8 bg-red-50 hover:bg-red-100 rounded-xl flex items-center justify-center"><Trash2 size={14} className="text-red-500" /></button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ══ RESUMEN / INFORMES ══════════════════════════════════ */}
        {seccion === 'resumen' && (
          <div className="space-y-4">
            {/* Selector de rango */}
            <div className="bg-white rounded-2xl border border-gray-100 p-3 space-y-2">
              <div className="flex gap-1.5">
                {([['hoy', 'Hoy'], ['semana', 'Últimos 7 días'], ['mes', 'Este mes'], ['personalizado', '📅 Personalizado']] as [RangoResumen, string][]).map(([r, label]) => (
                  <button key={r} onClick={() => setRangoResumen(r)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${rangoResumen === r ? 'bg-purple-600 text-white' : 'text-gray-500 hover:bg-gray-100 bg-gray-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
              {rangoResumen === 'personalizado' && (
                <div className="flex gap-2 items-end pt-1">
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 block mb-1">Desde</label>
                    <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 block mb-1">Hasta</label>
                    <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                  </div>
                  <button onClick={() => cargarResumen(fechaDesde, fechaHasta)}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-xl text-sm whitespace-nowrap">
                    Ver
                  </button>
                </div>
              )}
            </div>

            {cargandoResumen ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <div className="text-center"><BarChart3 size={32} className="mx-auto mb-2 animate-pulse" /><p>Cargando datos...</p></div>
              </div>
            ) : (<>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Ventas totales', valor: `$${resumenStats.ventas.toLocaleString('es-CO')}`, icon: <DollarSign size={18}/>, color: 'bg-green-500' },
                { label: 'Pedidos', valor: resumenStats.pedidos, icon: <ChefHat size={18}/>, color: 'bg-blue-500' },
                { label: 'Utilidad', valor: `$${resumenStats.utilidad.toLocaleString('es-CO')}`, icon: <TrendingUp size={18}/>, color: 'bg-purple-500' },
                { label: 'Domicilios', valor: `$${resumenStats.domis.toLocaleString('es-CO')}`, icon: <Bike size={18}/>, color: 'bg-blue-400' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl p-3 border border-gray-100 text-center">
                  <div className={`${s.color} w-8 h-8 rounded-xl flex items-center justify-center text-white mx-auto mb-1.5`}>{s.icon}</div>
                  <p className="text-lg font-black text-gray-900 leading-tight">{s.valor}</p>
                  <p className="text-xs text-gray-400">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Gráfico ventas por hora o por día */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <h3 className="font-bold text-gray-900 mb-3">
                {(rangoResumen === 'hoy' || (rangoResumen === 'personalizado' && fechaDesde === fechaHasta)) ? '📈 Ventas por hora' : '📅 Ventas por día'}
              </h3>
              {(() => {
                const esPorHora = ventasPorHora.length > 0
                return (
                  <ResponsiveContainer width="100%" height={180}>
                    {esPorHora ? (
                      <BarChart data={ventasPorHora} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                        <Tooltip formatter={(v) => [`$${Number(v ?? 0).toLocaleString('es-CO')}`, 'Ventas']} />
                        <Bar dataKey="ventas" fill="#9333ea" radius={[4,4,0,0]} />
                      </BarChart>
                    ) : (
                      <BarChart data={ventasPorDia} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="dia" tick={{ fontSize: 9 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                        <Tooltip formatter={(v, n) => [`$${Number(v ?? 0).toLocaleString('es-CO')}`, n === 'ventas' ? 'Establecimiento' : 'Domicilios']} />
                        <Bar dataKey="ventas" stackId="a" fill="#9333ea" radius={[0,0,0,0]} name="ventas" />
                        <Bar dataKey="domis" stackId="a" fill="#3b82f6" radius={[4,4,0,0]} name="domis" />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                )
              })()}
              {ventasPorDia.length > 0 && (
                <div className="flex gap-3 mt-2 justify-center text-xs">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-600 inline-block"/>Establecimiento</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block"/>Domicilios</span>
                </div>
              )}
            </div>

            {/* Torta métodos de pago + Top platos */}
            <div className="grid grid-cols-1 gap-4">
              {/* Torta */}
              {datosPagosMetodo.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-4">
                  <h3 className="font-bold text-gray-900 mb-2">💳 Métodos de pago</h3>
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width={130} height={130}>
                      <PieChart>
                        <Pie data={datosPagosMetodo} cx="50%" cy="50%" innerRadius={35} outerRadius={58} dataKey="value" paddingAngle={3}>
                          {datosPagosMetodo.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={(v) => [`$${Number(v ?? 0).toLocaleString('es-CO')}`, '']} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2">
                      {datosPagosMetodo.map(m => (
                        <div key={m.name} className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-sm text-gray-700">
                            <span className="w-3 h-3 rounded-full inline-block shrink-0" style={{ backgroundColor: m.color }} />
                            {m.name}
                          </span>
                          <span className="font-bold text-sm text-gray-900">${m.value.toLocaleString('es-CO')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Top platos gráfico */}
              {platosTop.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-4">
                  <h3 className="font-bold text-gray-900 mb-3">🏆 Platos más vendidos</h3>
                  <ResponsiveContainer width="100%" height={Math.min(platosTop.slice(0,6).length * 36, 220)}>
                    <BarChart layout="vertical" data={platosTop.slice(0,6).map(p => ({ nombre: p.nombre.length > 18 ? p.nombre.slice(0,16)+'…' : p.nombre, cant: p.cantidad, total: p.total }))}
                      margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => String(v)} />
                      <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={90} />
                      <Tooltip formatter={(v) => [Number(v ?? 0), 'Unidades']} />
                      <Bar dataKey="cant" fill="#f97316" radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Desempeño meseras */}
            {meseras.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b"><h3 className="font-bold text-gray-900">👩 Desempeño meseras</h3></div>
                <div className="divide-y">
                  {meseras.map((m, i) => (
                    <div key={m.nombre} className="flex items-center gap-3 px-4 py-3">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white ${i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-gray-400' : 'bg-purple-300'}`}>{i+1}</span>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 text-sm">{m.nombre}</p>
                        <p className="text-xs text-gray-400">{m.pedidos} pedido(s)</p>
                      </div>
                      <span className="font-bold text-gray-900 text-sm">${m.total.toLocaleString('es-CO')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Historial pedidos */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b"><h3 className="font-bold text-gray-900">📋 Pedidos del período</h3></div>
              <div className="divide-y max-h-64 overflow-y-auto">
                {pedidosHoy.slice(0, 30).map(p => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      {p.tipo === 'domi' ? <Bike size={14} className="text-blue-500 shrink-0"/> : <MapPin size={14} className="text-gray-400 shrink-0"/>}
                      <div>
                        <span className="font-semibold text-gray-800">{p.tipo === 'domi' ? 'Domi' : `Mesa ${p.mesa}`}</span>
                        <span className="ml-1.5 text-gray-400 text-xs">{new Date(p.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">${p.total.toLocaleString('es-CO')}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.estado === 'pagado' ? 'bg-green-100 text-green-700' : p.estado === 'listo' ? 'bg-blue-100 text-blue-700' : p.estado === 'en_preparacion' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                        {p.estado.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))}
                {pedidosHoy.length === 0 && <p className="text-center text-gray-400 py-6 text-sm">Sin pedidos en este período</p>}
              </div>
            </div>
            </>)}
          </div>
        )}

        {/* ══ TIEMPOS ═════════════════════════════════════════════ */}
        {seccion === 'tiempos' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-400">Datos de hoy — basado en pedidos completados</p>

            {/* Por cocinera */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <ChefHat size={16} className="text-orange-500" />
                <h3 className="font-bold text-gray-900">Rendimiento por cocinera</h3>
              </div>
              <div className="divide-y">
                {tiemposPorCocinero.map(c => (
                  <div key={c.nombre} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">👩‍🍳 {c.nombre}</p>
                      <p className="text-xs text-gray-400">{c.platos} plato(s) preparado(s)</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">{c.tiempoPromedio} min</p>
                      <p className="text-xs text-gray-400">prom. preparación</p>
                    </div>
                  </div>
                ))}
                {tiemposPorCocinero.length === 0 && <p className="text-center text-gray-400 py-6 text-sm">Sin datos — los tiempos se registran cuando cocina asigna platos</p>}
              </div>
            </div>

            {/* Permanencia en mesa */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <MapPin size={16} className="text-green-500" />
                <h3 className="font-bold text-gray-900">Tiempo de permanencia en mesa</h3>
              </div>
              <div className="divide-y">
                {(() => {
                  const pagadosHoy = pedidosHoy.filter(p => p.estado === 'pagado')
                  if (pagadosHoy.length === 0) return <p className="text-center text-gray-400 py-6 text-sm">Sin mesas cerradas hoy</p>
                  return pagadosHoy.slice(0, 8).map(p => {
                    const mins = p.pagado_en ? Math.round((new Date(p.pagado_en).getTime() - new Date(p.created_at).getTime()) / 60000) : null
                    return (
                      <div key={p.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">Mesa {p.mesa}</p>
                          <p className="text-xs text-gray-400">{new Date(p.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-900">{mins !== null ? `${mins} min` : '—'}</p>
                          <p className="text-xs text-gray-400">en mesa</p>
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>

            {/* Por mesera */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <Users size={16} className="text-purple-500" />
                <h3 className="font-bold text-gray-900">Tiempos por mesera</h3>
              </div>
              <div className="divide-y">
                {tiemposPorMesera.map(m => (
                  <div key={m.nombre} className="flex items-center justify-between px-4 py-3">
                    <p className="font-semibold text-gray-900 text-sm">{m.nombre}</p>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">{m.tiempoPromedio} min</p>
                      <p className="text-xs text-gray-400">tiempo total promedio</p>
                    </div>
                  </div>
                ))}
                {tiemposPorMesera.length === 0 && <p className="text-center text-gray-400 py-6 text-sm">Sin datos hoy</p>}
              </div>
            </div>

            {/* Por plato */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <Clock size={16} className="text-blue-500" />
                <h3 className="font-bold text-gray-900">Tiempos por plato</h3>
              </div>
              <div className="divide-y">
                {tiemposPorPlato.map(p => (
                  <div key={p.nombre} className="px-4 py-3">
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-semibold text-gray-900 text-sm">{p.nombre}</p>
                      <span className="text-xs text-gray-400">{p.cantidad} veces</span>
                    </div>
                    <div className="flex gap-4 text-xs">
                      <span className="text-blue-600">⏳ Espera: <b>{p.espera} min</b></span>
                      <span className="text-orange-600">🔥 Prep: <b>{p.preparacion} min</b></span>
                      <span className="text-green-600">✅ Total: <b>{p.total} min</b></span>
                    </div>
                  </div>
                ))}
                {tiemposPorPlato.length === 0 && <p className="text-center text-gray-400 py-6 text-sm">Sin datos hoy</p>}
              </div>
            </div>
          </div>
        )}

        {/* ══ CLIENTES ════════════════════════════════════════════ */}
        {seccion === 'clientes' && (
          <div className="space-y-3">

            {/* Buscador + botón exportar */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Buscar por nombre o cédula..." value={busquedaCliente}
                  onChange={e => setBusquedaCliente(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>
              <button onClick={exportarClientesCSV}
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-2.5 rounded-xl text-sm whitespace-nowrap transition-colors">
                <Download size={15} /> Excel
              </button>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-2xl border border-gray-100 p-3 space-y-2">
              {/* Ordenar por */}
              <div>
                <p className="text-xs text-gray-400 font-medium mb-1.5 flex items-center gap-1"><SlidersHorizontal size={12}/> Ordenar por</p>
                <div className="flex gap-1.5 flex-wrap">
                  {([
                    ['mayor_consumo', '💰 Mayor consumo'],
                    ['menor_consumo', '📉 Menor consumo'],
                    ['az',            '🔤 A → Z'],
                    ['cumpleanos',    '🎂 Cumpleaños próximo'],
                  ] as ['mayor_consumo'|'menor_consumo'|'az'|'cumpleanos', string][]).map(([v, label]) => (
                    <button key={v} onClick={() => setOrdenClientes(v)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${ordenClientes === v ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Filtrar por mes de cumpleaños */}
              <div>
                <p className="text-xs text-gray-400 font-medium mb-1.5 flex items-center gap-1"><CalendarDays size={12}/> Filtrar por mes de cumpleaños</p>
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => setFiltroMesCumple(0)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filtroMesCumple === 0 ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    Todos
                  </button>
                  {MESES_ES.map((mes, i) => (
                    <button key={mes} onClick={() => setFiltroMesCumple(i + 1)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filtroMesCumple === i + 1 ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {mes.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Contador resultados */}
            {(busquedaCliente || filtroMesCumple > 0) && (
              <p className="text-xs text-gray-400 px-1">
                {clientesFiltradosOrdenados.length} resultado(s)
                {filtroMesCumple > 0 && ` · Cumpleaños en ${MESES_ES[filtroMesCumple - 1]}`}
              </p>
            )}

            {cargandoClientes ? (
              <div className="flex justify-center py-12 text-gray-400">
                <div className="text-center"><UserCircle size={32} className="mx-auto mb-2 animate-pulse"/><p>Cargando...</p></div>
              </div>
            ) : (
              <div className="space-y-2">
                {clientesFiltradosOrdenados.map((c, idx) => {
                  // Resaltar si cumpleaños este mes
                  const esCumpleMes = c.fecha_cumpleanos != null &&
                    new Date(c.fecha_cumpleanos + 'T12:00:00').getMonth() === new Date().getMonth()
                  // Badge de posición si está ordenado por consumo
                  const mostrarRanking = ordenClientes === 'mayor_consumo' || ordenClientes === 'menor_consumo'
                  return (
                    <button key={c.id} onClick={() => abrirClienteDetalle(c)}
                      className={`w-full rounded-2xl border p-4 text-left transition-colors ${esCumpleMes ? 'bg-pink-50 border-pink-200 hover:border-pink-400' : 'bg-white border-gray-100 hover:border-purple-300'}`}>
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${esCumpleMes ? 'bg-pink-200' : 'bg-purple-100'}`}>
                            <span className={`font-black text-sm ${esCumpleMes ? 'text-pink-700' : 'text-purple-700'}`}>{c.nombre.charAt(0).toUpperCase()}</span>
                          </div>
                          {mostrarRanking && idx < 3 && (
                            <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-[10px] font-black flex items-center justify-center ${idx === 0 ? 'bg-yellow-400' : idx === 1 ? 'bg-gray-400' : 'bg-amber-600'}`}>{idx + 1}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900">{c.nombre}</p>
                            {esCumpleMes && <span className="text-xs bg-pink-200 text-pink-700 px-1.5 py-0.5 rounded-full font-bold">🎂 Este mes</span>}
                          </div>
                          <div className="flex gap-3 text-xs text-gray-400 mt-0.5 flex-wrap">
                            {c.cedula && <span>🪪 {c.cedula}</span>}
                            {c.telefono && <span>📞 {c.telefono}</span>}
                            {c.fecha_cumpleanos && (
                              <span className={esCumpleMes ? 'text-pink-500 font-semibold' : ''}>
                                🎂 {new Date(c.fecha_cumpleanos + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-black text-gray-900 text-sm">${c.totalGastado.toLocaleString('es-CO')}</p>
                          <p className="text-xs text-gray-400">{c.pedidos} visita(s)</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
                {clientes.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <UserCircle size={40} className="mx-auto mb-2"/>
                    <p>Sin clientes registrados aún</p>
                    <p className="text-xs mt-1">Se agregan al cobrar y capturar cédula</p>
                  </div>
                )}
                {clientes.length > 0 && clientesFiltradosOrdenados.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <Search size={32} className="mx-auto mb-2"/>
                    <p>Sin resultados para los filtros aplicados</p>
                  </div>
                )}
              </div>
            )}

            {/* Modal detalle cliente */}
            {clienteDetalle && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
                <div className="bg-white w-full md:max-w-lg md:rounded-3xl rounded-t-3xl max-h-[90vh] flex flex-col overflow-hidden fade-in">
                  <div className="flex items-center justify-between px-5 py-4 border-b">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                        <span className="text-purple-700 font-black text-lg">{clienteDetalle.cliente.nombre.charAt(0)}</span>
                      </div>
                      <div>
                        <h2 className="text-lg font-black text-gray-900">{clienteDetalle.cliente.nombre}</h2>
                        <p className="text-xs text-gray-400">
                          {clienteDetalle.cliente.pedidos} visita(s) · ${clienteDetalle.cliente.totalGastado.toLocaleString('es-CO')} total
                        </p>
                      </div>
                    </div>
                    <button onClick={() => setClienteDetalle(null)} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"><X size={18}/></button>
                  </div>
                  <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                    {/* Datos */}
                    <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
                      {clienteDetalle.cliente.cedula && <div className="flex justify-between"><span className="text-gray-500">Cédula</span><span className="font-semibold">{clienteDetalle.cliente.cedula}</span></div>}
                      {clienteDetalle.cliente.telefono && <div className="flex justify-between"><span className="text-gray-500">Teléfono</span><span className="font-semibold">{clienteDetalle.cliente.telefono}</span></div>}
                      {clienteDetalle.cliente.fecha_cumpleanos && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Cumpleaños</span>
                          <span className="font-semibold">🎂 {new Date(clienteDetalle.cliente.fecha_cumpleanos + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}</span>
                        </div>
                      )}
                      {clienteDetalle.cliente.ultimaVisita && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Última visita</span>
                          <span className="font-semibold">{new Date(clienteDetalle.cliente.ultimaVisita).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                      )}
                    </div>
                    {/* Platos favoritos — resumen para patrones */}
                    {clienteDetalle.pedidos.length > 0 && (() => {
                      const conteo: Record<string, number> = {}
                      clienteDetalle.pedidos.forEach(p =>
                        p.items.forEach(i => { conteo[i.nombre] = (conteo[i.nombre] || 0) + i.cantidad })
                      )
                      const top = Object.entries(conteo).sort((a, b) => b[1] - a[1])
                      return (
                        <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
                          <p className="text-xs font-bold text-purple-700 uppercase mb-2">🏆 Platos más pedidos</p>
                          <div className="flex flex-wrap gap-1.5">
                            {top.map(([nombre, cant]) => (
                              <span key={nombre}
                                className={`text-xs px-2.5 py-1 rounded-full font-semibold ${cant >= 3 ? 'bg-purple-600 text-white' : cant >= 2 ? 'bg-purple-200 text-purple-800' : 'bg-white text-purple-600 border border-purple-200'}`}>
                                {nombre} <span className="opacity-75">×{cant}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Historial de visitas con platos */}
                    <div>
                      <h3 className="font-bold text-gray-800 mb-2">Historial de visitas</h3>
                      <div className="space-y-2">
                        {clienteDetalle.pedidos.map(p => (
                          <div key={p.id} className="bg-white border border-gray-100 rounded-xl text-sm overflow-hidden">
                            {/* Cabecera de la visita */}
                            <div className="flex items-center justify-between px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-800">{p.tipo === 'domi' ? '🛵 Domi' : '🍽️ Mesa'}</span>
                                <span className="text-gray-400 text-xs">
                                  {new Date(p.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-900">${p.total.toLocaleString('es-CO')}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${p.estado === 'pagado' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {p.estado}
                                </span>
                              </div>
                            </div>
                            {/* Platos consumidos */}
                            {p.items.length > 0 && (
                              <div className="px-3 pb-2.5 pt-1.5 border-t border-gray-50 flex flex-wrap gap-1">
                                {p.items.map((item, i) => (
                                  <span key={i} className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">
                                    {item.cantidad}× {item.nombre}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        {clienteDetalle.pedidos.length === 0 && (
                          <p className="text-center text-gray-400 py-4 text-sm">Sin historial vinculado aún</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ CAJA ════════════════════════════════════════════════ */}
        {seccion === 'caja' && (() => {
          const EMOJIS: Record<string, string> = { efectivo: '💵', nequi: '💜', daviplata: '❤️', bancolombia: '🟡' }
          // Solo pedidos del turno activo (no mezclar con turnos anteriores del mismo día)
          const pedidosTurno = turnoActivo
            ? pedidosHoy.filter(p => p.turno_id === turnoActivo.id)
            : pedidosHoy
          const ventasEstab  = pedidosTurno.filter(p => p.tipo !== 'domi').reduce((a, p) => a + p.total, 0)
          const ventasDomi   = pedidosTurno.filter(p => p.tipo === 'domi').reduce((a, p) => a + p.total, 0)
          const pedidosDomi  = pedidosTurno.filter(p => p.tipo === 'domi').length
          const pedidosEstab = pedidosTurno.filter(p => p.tipo !== 'domi').length
          const totalIngresos = movimientosCaja.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0)
          const totalEgresos  = movimientosCaja.filter(m => m.tipo === 'egreso').reduce((a, m) => a + m.monto, 0)
          const efectivoEnPagos = pagosPorMetodo.find(p => p.metodo === 'efectivo')
          const efectivoEsperado = (efectivoEnPagos ? efectivoEnPagos.monto + efectivoEnPagos.propina : 0)
            + (turnoActivo?.monto_inicial ?? 0) + totalIngresos - totalEgresos

          return (
          <div className="space-y-4">

            {/* Estado turno */}
            <div className={`rounded-2xl p-4 text-white ${turnoActivo ? 'bg-green-600' : 'bg-gray-500'}`}>
              <p className="text-sm opacity-80">{turnoActivo ? '● Turno abierto desde' : '○ Sin turno activo'}</p>
              {turnoActivo && <>
                <p className="font-bold">{new Date(turnoActivo.abierto_en).toLocaleString('es-CO', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</p>
                <p className="text-sm opacity-80">Base inicial: ${turnoActivo.monto_inicial.toLocaleString('es-CO')}</p>
              </>}
            </div>

            {turnoActivo && <>
              {/* Desglose por método de pago */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b"><h3 className="font-bold text-gray-900">Pagos recibidos por método</h3></div>
                <div className="divide-y">
                  {pagosPorMetodo.length === 0 && <p className="text-center text-gray-400 py-4 text-sm">Sin pagos aún</p>}
                  {pagosPorMetodo.map(p => (
                    <div key={p.metodo} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{EMOJIS[p.metodo] || '💳'} {p.metodo.charAt(0).toUpperCase() + p.metodo.slice(1)}</p>
                        {p.propina > 0 && <p className="text-xs text-gray-400">Incluye ${p.propina.toLocaleString('es-CO')} en propinas</p>}
                      </div>
                      <p className="font-black text-gray-900">${(p.monto + p.propina).toLocaleString('es-CO')}</p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                    <p className="font-bold text-gray-700 text-sm">Total cobrado</p>
                    <p className="font-black text-gray-900">${pagosPorMetodo.reduce((a, p) => a + p.monto + p.propina, 0).toLocaleString('es-CO')}</p>
                  </div>
                </div>
              </div>

              {/* Ventas establecimiento vs domicilios */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b"><h3 className="font-bold text-gray-900">Ventas del turno</h3></div>
                <div className="divide-y">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div><p className="font-semibold text-gray-800 text-sm">🍽️ Establecimiento</p><p className="text-xs text-gray-400">{pedidosEstab} pedido(s)</p></div>
                    <p className="font-black text-gray-900">${ventasEstab.toLocaleString('es-CO')}</p>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div><p className="font-semibold text-gray-800 text-sm">🛵 Domicilios</p><p className="text-xs text-gray-400">{pedidosDomi} pedido(s)</p></div>
                    <p className="font-black text-gray-900">${ventasDomi.toLocaleString('es-CO')}</p>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                    <p className="font-black text-gray-800">Total</p>
                    <p className="font-black text-purple-700 text-lg">${(ventasEstab + ventasDomi).toLocaleString('es-CO')}</p>
                  </div>
                </div>
              </div>

              {/* Movimientos de caja */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">Notas de caja</h3>
                  {(totalIngresos > 0 || totalEgresos > 0) && (
                    <span className="text-xs text-gray-500">
                      +${totalIngresos.toLocaleString('es-CO')} / -${totalEgresos.toLocaleString('es-CO')}
                    </span>
                  )}
                </div>
                <div className="divide-y">
                  {movimientosCaja.length === 0 && <p className="text-center text-gray-400 py-3 text-sm">Sin movimientos</p>}
                  {movimientosCaja.map(m => (
                    <div key={m.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{m.descripcion}</p>
                        <p className="text-xs text-gray-400">{new Date(m.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <span className={`font-black text-sm ${m.tipo === 'ingreso' ? 'text-green-600' : 'text-red-600'}`}>
                        {m.tipo === 'ingreso' ? '+' : '-'}${m.monto.toLocaleString('es-CO')}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Formulario nuevo movimiento */}
                <div className="px-4 py-3 border-t bg-gray-50 space-y-2">
                  <p className="text-xs font-bold text-gray-600 uppercase">Registrar movimiento</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setNuevoMov(p => ({ ...p, tipo: 'ingreso' }))}
                      className={`py-2 rounded-xl text-sm font-bold border-2 transition-all ${nuevoMov.tipo === 'ingreso' ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-600 border-gray-200'}`}>
                      ↑ Ingreso
                    </button>
                    <button onClick={() => setNuevoMov(p => ({ ...p, tipo: 'egreso' }))}
                      className={`py-2 rounded-xl text-sm font-bold border-2 transition-all ${nuevoMov.tipo === 'egreso' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200'}`}>
                      ↓ Egreso
                    </button>
                  </div>
                  <input type="text" placeholder='Descripción (ej: "Se sacó para mercado")' value={nuevoMov.descripcion}
                    onChange={e => setNuevoMov(p => ({ ...p, descripcion: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white" />
                  <div className="flex gap-2">
                    <input type="number" placeholder="Monto $" value={nuevoMov.monto}
                      onChange={e => setNuevoMov(p => ({ ...p, monto: e.target.value }))}
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white" />
                    <button onClick={agregarMovimiento} disabled={agregandoMov}
                      className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-bold px-4 rounded-xl text-sm">
                      {agregandoMov ? '...' : 'Agregar'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Efectivo esperado en caja */}
              <div className={`rounded-2xl p-4 border-2 ${efectivoEsperado >= 0 ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                <p className="text-xs font-bold text-gray-600 uppercase mb-1">Efectivo esperado en caja física</p>
                <p className={`text-2xl font-black ${efectivoEsperado >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  ${efectivoEsperado.toLocaleString('es-CO')}
                </p>
                <p className="text-xs text-gray-500 mt-1">Base ${turnoActivo.monto_inicial.toLocaleString('es-CO')} + efectivo cobrado + ingresos − egresos</p>
              </div>

              {/* Domicilios para cuadre */}
              {pedidosDomi > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b"><h3 className="font-bold text-gray-900 text-sm">Domicilios del turno</h3></div>
                  <div className="divide-y">
                    {pedidosTurno.filter(p => p.tipo === 'domi').map(p => {
                      const domi = domiActivos.find(d => d.id === p.id)
                      return (
                        <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                          <div>
                            <p className="font-semibold text-gray-800">{domi?.cliente_nombre || 'Sin nombre'}</p>
                            {domi?.metodos.length ? <p className="text-xs text-gray-500">{domi.metodos.map(m => `${EMOJIS[m] || ''} ${m}`).join(' · ')}</p> : <p className="text-xs text-orange-500">⚠️ Sin pago</p>}
                          </div>
                          <div className="text-right">
                            <p className="font-bold">${p.total.toLocaleString('es-CO')}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${p.estado === 'pagado' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{p.estado === 'pagado' ? 'Pagado' : 'Pendiente'}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>}

            {!turnoActivo
              ? <button onClick={() => setModalCaja('abrir')} className="w-full bg-green-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-lg"><Play size={20} /> Abrir turno</button>
              : <button onClick={() => setModalCaja('cerrar')} className="w-full bg-red-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-lg"><Square size={20} /> Cerrar turno</button>
            }
          </div>
          )
        })()}

        {/* ══ USUARIOS ════════════════════════════════════════════ */}
        {seccion === 'usuarios' && (
          <div className="space-y-4">
            <button onClick={() => setModalUsuario(true)} className="w-full bg-purple-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2">
              <Plus size={20} /> Crear nuevo usuario
            </button>
            {listaUsuarios.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
                <p className="text-gray-400 text-sm">No hay usuarios registrados todavía.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {listaUsuarios.map((u, i) => {
                  const ROL_BADGE: Record<string, string> = {
                    gerente: 'bg-purple-100 text-purple-700',
                    mesera:  'bg-orange-100 text-orange-700',
                    cocina:  'bg-green-100 text-green-700',
                  }
                  const ROL_LABEL: Record<string, string> = {
                    gerente: 'Gerente', mesera: 'Mesera', cocina: 'Cocina',
                  }
                  return (
                    <div key={u.id} className={`flex items-center justify-between px-4 py-3.5 ${i !== 0 ? 'border-t border-gray-50' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-500 text-sm">
                          {u.nombre.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900 text-sm">{u.nombre}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${ROL_BADGE[u.rol] || 'bg-gray-100 text-gray-600'}`}>
                          {ROL_LABEL[u.rol] || u.rol}
                        </span>
                        <button
                          onClick={() => setEditandoUsuario({ id: u.id, nombre: u.nombre, rol: u.rol })}
                          className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center transition-colors"
                          title="Editar usuario">
                          <Pencil size={13} className="text-gray-500" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ MODAL DETALLE MESA ══════════════════════════════════════ */}
      {mesaDetalle && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white w-full md:max-w-lg md:rounded-3xl rounded-t-3xl max-h-[92vh] flex flex-col overflow-hidden fade-in">

            {/* ── Paso: captura de cliente (aparece después de pago) ── */}
            {vistaModal === 'cliente' && (
              <>
                <div className="flex items-center justify-between px-5 py-4 border-b">
                  <div>
                    <h2 className="text-xl font-black text-gray-900">Datos del cliente</h2>
                    <p className="text-xs text-green-600 font-medium">✅ Mesa pagada y liberada</p>
                  </div>
                  <button onClick={saltarCliente} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"><X size={18} /></button>
                </div>
                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
                  <p className="text-sm text-gray-500">Opcional — para la base de datos de clientes y marketing</p>
                  <div className="flex gap-2">
                    <input type="text" value={cedulaCliente} onChange={e => setCedulaCliente(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && buscarCliente()}
                      placeholder="Cédula del cliente"
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    <button onClick={buscarCliente} disabled={buscandoCl || !cedulaCliente.trim()}
                      className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white px-4 py-2.5 rounded-xl text-sm font-bold">
                      {buscandoCl ? '...' : 'Buscar'}
                    </button>
                  </div>
                  {cedulaCliente && !buscandoCl && (
                    <div className={`rounded-xl p-3 text-sm ${clienteEncontrado ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                      {clienteEncontrado
                        ? <p className="text-green-700 font-semibold">✓ Cliente frecuente: {clienteEncontrado.nombre}</p>
                        : <p className="text-gray-500">Cliente nuevo — completa los datos:</p>
                      }
                    </div>
                  )}
                  {cedulaCliente && !clienteEncontrado && !buscandoCl && (
                    <div className="space-y-2">
                      <input type="text" placeholder="Nombre completo *" value={clienteForm.nombre}
                        onChange={e => setClienteForm(p => ({ ...p, nombre: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                      <input type="tel" placeholder="Teléfono" value={clienteForm.telefono}
                        onChange={e => setClienteForm(p => ({ ...p, telefono: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">🎂 Cumpleaños (opcional)</label>
                        <div className="grid grid-cols-3 gap-2">
                          <select value={clienteForm.fecha_cumpleanos ? clienteForm.fecha_cumpleanos.split('-')[2] : ''}
                            onChange={e => {
                              const parts = clienteForm.fecha_cumpleanos ? clienteForm.fecha_cumpleanos.split('-') : ['2000', '01', '01']
                              setClienteForm(p => ({ ...p, fecha_cumpleanos: `${parts[0]}-${parts[1]}-${e.target.value.padStart(2,'0')}` }))
                            }}
                            className="border border-gray-200 rounded-xl px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                            <option value="">Día</option>
                            {Array.from({length:31},(_,i)=>i+1).map(d=><option key={d} value={String(d).padStart(2,'0')}>{d}</option>)}
                          </select>
                          <select value={clienteForm.fecha_cumpleanos ? clienteForm.fecha_cumpleanos.split('-')[1] : ''}
                            onChange={e => {
                              const parts = clienteForm.fecha_cumpleanos ? clienteForm.fecha_cumpleanos.split('-') : ['2000', '01', '01']
                              setClienteForm(p => ({ ...p, fecha_cumpleanos: `${parts[0]}-${e.target.value}-${parts[2]}` }))
                            }}
                            className="border border-gray-200 rounded-xl px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                            <option value="">Mes</option>
                            {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((m,i)=><option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
                          </select>
                          <select value={clienteForm.fecha_cumpleanos ? clienteForm.fecha_cumpleanos.split('-')[0] : ''}
                            onChange={e => {
                              const parts = clienteForm.fecha_cumpleanos ? clienteForm.fecha_cumpleanos.split('-') : ['2000', '01', '01']
                              setClienteForm(p => ({ ...p, fecha_cumpleanos: `${e.target.value}-${parts[1]}-${parts[2]}` }))
                            }}
                            className="border border-gray-200 rounded-xl px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                            <option value="">Año</option>
                            {Array.from({length:80},(_,i)=>new Date().getFullYear()-i).map(y=><option key={y} value={y}>{y}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="px-5 py-4 border-t space-y-2">
                  {cedulaCliente && (clienteEncontrado || clienteForm.nombre) && (
                    <button onClick={guardarCliente} disabled={guardandoCl}
                      className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl">
                      {guardandoCl ? 'Guardando...' : clienteEncontrado ? 'Registrar en este pedido' : 'Guardar cliente'}
                    </button>
                  )}
                  <button onClick={saltarCliente} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium py-3 rounded-xl text-sm">
                    Saltar — cerrar sin guardar
                  </button>
                </div>
              </>
            )}

            {/* ── Paso: detalle + pago ── */}
            {vistaModal === 'pago' && (<>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                {mesaDetalle.isDomi ? (
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="bg-blue-600 text-white text-xs font-black px-2 py-0.5 rounded-full">🛵 DOMI</span>
                      <span className="text-lg font-black text-gray-900">{mesaDetalle.pedido.cliente_nombre || 'Sin nombre'}</span>
                    </div>
                    {mesaDetalle.pedido.cliente_cedula && <p className="text-xs text-gray-400">🪪 C.C. {mesaDetalle.pedido.cliente_cedula}</p>}
                    {mesaDetalle.pedido.cliente_telefono && <p className="text-xs text-gray-400">📞 {mesaDetalle.pedido.cliente_telefono}</p>}
                    {mesaDetalle.pedido.cliente_direccion && <p className="text-xs text-gray-400">📍 {mesaDetalle.pedido.cliente_direccion}</p>}
                  </div>
                ) : (
                  <h2 className="text-xl font-black text-gray-900">Mesa {mesaDetalle.mesa?.numero}</h2>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  {mesaDetalle.pedido.mesera ? `Por ${mesaDetalle.pedido.mesera.nombre}` : '📱 Pedido QR'}
                  {' · '}{new Date(mesaDetalle.pedido.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button onClick={() => { setMesaDetalle(null); setVistaModal('pago') }} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              <div>
                <h3 className="font-bold text-gray-700 text-sm mb-2">Pedido</h3>
                <div className="space-y-2">
                  {mesaDetalle.pedido.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${item.estado === 'listo' || item.estado === 'entregado' ? 'bg-green-500' : item.estado === 'en_preparacion' ? 'bg-orange-400' : 'bg-gray-300'}`} />
                        <span>{item.cantidad}x {item.nombre}</span>
                        {item.notas && <span className="text-yellow-600 text-xs">({item.notas})</span>}
                      </div>
                      <span className="font-semibold">${(item.cantidad * item.precio_unitario).toLocaleString('es-CO')}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between font-black text-gray-900 text-base mt-3 pt-3 border-t">
                  <span>Total</span><span>${totalPedido.toLocaleString('es-CO')}</span>
                </div>
              </div>
              {mesaDetalle.pagos.length > 0 && (
                <div>
                  <h3 className="font-bold text-gray-700 text-sm mb-2">Pagos recibidos</h3>
                  <div className="space-y-2">
                    {mesaDetalle.pagos.map(pago => (
                      <div key={pago.id} className="flex items-center justify-between bg-green-50 rounded-xl px-3 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span>{METODOS.find(m => m.id === pago.metodo)?.emoji}</span>
                          <span className="capitalize">{pago.metodo}</span>
                          {pago.propina > 0 && <span className="text-gray-400 text-xs">(+${pago.propina.toLocaleString('es-CO')} propina)</span>}
                        </div>
                        <span className="font-bold text-green-700">${pago.monto.toLocaleString('es-CO')}</span>
                      </div>
                    ))}
                  </div>
                  <div className={`mt-3 rounded-2xl p-3 text-center ${saldoPendiente <= 0 ? 'bg-green-100' : 'bg-orange-50'}`}>
                    {saldoPendiente > 0
                      ? <p className="font-black text-orange-700 text-lg">Saldo: ${saldoPendiente.toLocaleString('es-CO')}</p>
                      : <><p className="font-black text-green-700 text-lg">✓ Pago completo</p>{vuelto > 0 && <p className="text-green-600 text-sm">Vuelto: ${vuelto.toLocaleString('es-CO')}</p>}</>
                    }
                  </div>
                </div>
              )}
              {/* ── Aviso: ítems aún en preparación ── */}
              {!pedidoListoPagar && (
                <div className="bg-orange-50 border-2 border-orange-300 rounded-2xl p-4">
                  <p className="font-black text-orange-700 text-sm flex items-center gap-2">
                    ⏳ Pedido aún en cocina
                  </p>
                  <p className="text-xs text-orange-600 mt-1 leading-relaxed">
                    {itemsSinListar.length} plato{itemsSinListar.length !== 1 ? 's' : ''} todavía {itemsSinListar.length !== 1 ? 'están' : 'está'} en preparación:
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {itemsSinListar.map((item, i) => (
                      <span key={i} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.estado === 'en_preparacion' ? 'bg-orange-200 text-orange-800' : 'bg-gray-200 text-gray-700'}`}>
                        {item.cantidad}× {item.nombre} · {item.estado === 'en_preparacion' ? 'preparando' : 'pendiente'}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-orange-500 mt-2 font-medium">El pago se habilitará cuando cocina marque todo como listo.</p>
                </div>
              )}

              {saldoPendiente > 0 && (
                <div>
                  <h3 className="font-bold text-gray-700 text-sm mb-3">Registrar pago</h3>
                  <div className={`grid grid-cols-4 gap-2 mb-3 transition-opacity ${!pedidoListoPagar ? 'opacity-40 pointer-events-none' : ''}`}>
                    {METODOS.map(m => (
                      <button key={m.id} onClick={() => setMetodoPago(m.id)}
                        className={`py-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border-2 transition-all ${metodoPago === m.id ? `${m.color} text-white border-transparent` : 'bg-white border-gray-200 text-gray-600'}`}>
                        <span className="text-lg">{m.emoji}</span>{m.label}
                      </button>
                    ))}
                  </div>
                  <div className={`flex gap-2 mb-2 transition-opacity ${!pedidoListoPagar ? 'opacity-40 pointer-events-none' : ''}`}>
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 block mb-1">Monto</label>
                      <input type="number" value={montoPago} onChange={e => setMontoPago(e.target.value)} placeholder={`$${saldoPendiente.toLocaleString('es-CO')}`} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                    <div className="w-28">
                      <label className="text-xs text-gray-500 block mb-1">Propina</label>
                      <input type="number" value={propinaPago} onChange={e => setPropinaPago(e.target.value)} placeholder="$0" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                  </div>
                  {pedidoListoPagar && (
                    <button onClick={() => setMontoPago(String(saldoPendiente))} className="text-xs text-purple-600 font-medium mb-3 hover:underline">→ Usar saldo exacto (${saldoPendiente.toLocaleString('es-CO')})</button>
                  )}
                  <button
                    onClick={agregarPago}
                    disabled={agregandoPago || !montoPago || !pedidoListoPagar}
                    title={!pedidoListoPagar ? 'Hay platos que aún no han salido de cocina' : ''}
                    className={`w-full font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all ${
                      !pedidoListoPagar
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white'
                    }`}>
                    <Banknote size={18} />
                    {!pedidoListoPagar ? '🔒 Pago bloqueado — pedido en curso' : agregandoPago ? 'Registrando...' : 'Agregar pago'}
                  </button>
                </div>
              )}
            </div>
            {saldoPendiente <= 0 && (
              <div className="px-5 py-4 border-t">
                <button
                  onClick={pedidoListoPagar ? cerrarMesa : undefined}
                  disabled={!pedidoListoPagar}
                  title={!pedidoListoPagar ? 'Hay platos que aún no han salido de cocina' : ''}
                  className={`w-full font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-lg transition-all ${
                    pedidoListoPagar
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}>
                  <CheckCircle size={22} />
                  {pedidoListoPagar ? 'Cerrar mesa' : '🔒 Esperando cocina…'}
                </button>
                {!pedidoListoPagar && (
                  <p className="text-center text-xs text-orange-500 mt-2 font-medium">
                    ⏳ {itemsSinListar.length} plato{itemsSinListar.length !== 1 ? 's' : ''} aún en preparación
                  </p>
                )}
              </div>
            )}
            </>)}
          </div>
        </div>
      )}

      {/* ══ MODAL PLATO ══════════════════════════════════════════════ */}
      {modalPlato && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-md fade-in max-h-[90vh] overflow-y-auto space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">{modalPlato === 'nuevo' ? 'Nuevo plato' : 'Editar plato'}</h3>
              <button onClick={() => setModalPlato(null)}><X size={20} /></button>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Nombre del plato *</label>
              <input type="text" value={platoForm.nombre} onChange={e => setPlatoForm(p => ({ ...p, nombre: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Descripción (visible para meseras y clientes)</label>
              <textarea value={platoForm.descripcion || ''} onChange={e => setPlatoForm(p => ({ ...p, descripcion: e.target.value }))} rows={2} placeholder="Describe el plato para que las meseras puedan explicárselo al cliente..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Precio público *</label>
                <input type="number" value={platoForm.precio || ''} onChange={e => setPlatoForm(p => ({ ...p, precio: parseFloat(e.target.value) || 0 }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Costo (para utilidad)</label>
                <input type="number" value={platoForm.costo || ''} onChange={e => setPlatoForm(p => ({ ...p, costo: parseFloat(e.target.value) || 0 }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>
            </div>
            {platoForm.precio && platoForm.costo ? (
              <div className="bg-green-50 rounded-xl px-3 py-2 text-sm">
                <span className="text-green-700 font-semibold">Utilidad: ${(platoForm.precio - (platoForm.costo || 0)).toLocaleString('es-CO')} ({Math.round((platoForm.precio - (platoForm.costo || 0)) / platoForm.precio * 100)}% margen)</span>
              </div>
            ) : null}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Categoría *</label>
              <select value={platoForm.categoria_id} onChange={e => setPlatoForm(p => ({ ...p, categoria_id: parseInt(e.target.value) }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">URL de imagen (opcional)</label>
              <input type="url" value={platoForm.imagen_url || ''} onChange={e => setPlatoForm(p => ({ ...p, imagen_url: e.target.value }))} placeholder="https://..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-700 font-medium">Disponible en el menú</label>
              <button onClick={() => setPlatoForm(p => ({ ...p, activo: !p.activo }))}
                className={`w-12 h-6 rounded-full transition-colors ${platoForm.activo ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${platoForm.activo ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
            <button onClick={guardarPlato} disabled={guardandoPlato} className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl">
              {guardandoPlato ? 'Guardando...' : modalPlato === 'nuevo' ? 'Crear plato' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}

      {/* ══ MODALES CAJA Y USUARIOS ══════════════════════════════════ */}
      {modalCaja === 'abrir' && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm fade-in max-h-[90vh] flex flex-col overflow-hidden">

            {/* Header con indicador de pasos */}
            <div className="flex justify-between items-center px-5 py-4 border-b shrink-0">
              <div>
                <h3 className="font-bold text-lg">
                  {pasoCaja === 'efectivo' ? 'Abrir turno' : '📦 Inventario inicial'}
                </h3>
                <div className="flex gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${pasoCaja === 'efectivo' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>1. Caja</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${pasoCaja === 'inventario' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>2. Inventario</span>
                </div>
              </div>
              <button onClick={() => { setModalCaja(null); setPasoCaja('efectivo') }}><X size={20} /></button>
            </div>

            {pasoCaja === 'efectivo' ? (
              /* ── Paso 1: Efectivo ── */
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Monto inicial en caja (efectivo)</label>
                  <input type="number" value={montoInicial} onChange={e => setMontoInicial(e.target.value)}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>
                <button onClick={irAInventario}
                  className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                  Siguiente — Inventario →
                </button>
              </div>
            ) : (
              /* ── Paso 2: Inventario ── */
              <>
                <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">
                  <p className="text-sm text-gray-500 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2.5">
                    ✏️ Escribe cuántas unidades hay de cada plato <strong>al abrir el turno</strong>. El sistema las descontará automáticamente con cada pedido.
                  </p>
                  {categorias.map(cat => {
                    const platosCategoria = platos.filter(p => p.activo && p.categoria_id === cat.id)
                    if (platosCategoria.length === 0) return null
                    return (
                      <div key={cat.id}>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{cat.nombre}</p>
                        <div className="space-y-2">
                          {platosCategoria.map(p => (
                            <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                              <div className="flex-1 min-w-0 mr-3">
                                <p className="text-sm font-medium text-gray-800 truncate">{p.nombre}</p>
                                <p className="text-xs text-gray-400">${p.precio.toLocaleString('es-CO')}</p>
                              </div>
                              <input
                                type="number" min="0"
                                value={inventarioTurno[p.id] ?? ''}
                                onChange={e => setInventarioTurno(prev => ({
                                  ...prev, [p.id]: parseInt(e.target.value) || 0
                                }))}
                                placeholder="0"
                                className="w-16 border border-gray-200 rounded-xl px-2 py-1.5 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  {platos.filter(p => p.activo).length === 0 && (
                    <p className="text-center text-gray-400 text-sm py-4">Sin platos activos en la carta</p>
                  )}
                </div>
                <div className="px-5 py-4 border-t shrink-0 space-y-2">
                  <button onClick={abrirTurno}
                    className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-xl">
                    ✓ Abrir turno
                  </button>
                  <button onClick={() => setPasoCaja('efectivo')}
                    className="w-full text-gray-400 text-sm py-1 hover:text-gray-600">
                    ← Volver
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {modalCaja === 'cerrar' && turnoActivo && (() => {
        const totalIngresos = movimientosCaja.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0)
        const totalEgresos  = movimientosCaja.filter(m => m.tipo === 'egreso').reduce((a, m) => a + m.monto, 0)

        // Calcular esperado por método
        const esperadoPorMetodo = METODOS.map(m => {
          const pago = pagosPorMetodo.find(p => p.metodo === m.id)
          let esperado = pago ? pago.monto + pago.propina : 0
          if (m.id === 'efectivo') esperado += turnoActivo.monto_inicial + totalIngresos - totalEgresos
          return { ...m, esperado }
        })

        // Sólo mostrar métodos con movimiento (o efectivo siempre)
        const metodosActivos = esperadoPorMetodo.filter(m => m.id === 'efectivo' || m.esperado > 0)

        // Resumen de descuadre total
        let totalEsperado = 0, totalContado = 0, hayAlgunConteo = false
        metodosActivos.forEach(m => {
          totalEsperado += m.esperado
          const v = parseFloat(conteoFinal[m.id] || '')
          if (!isNaN(v)) { totalContado += v; hayAlgunConteo = true }
        })
        const descuadreTotal = totalContado - totalEsperado

        return (
          <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
            <div className="bg-white rounded-3xl w-full max-w-md fade-in max-h-[92vh] flex flex-col overflow-hidden">

              {/* Header */}
              <div className="flex justify-between items-center px-5 py-4 border-b shrink-0">
                <div>
                  <h3 className="font-bold text-lg text-gray-900">Cuadre de caja</h3>
                  <p className="text-xs text-gray-400">Ingresa lo que tienes en cada medio</p>
                </div>
                <button onClick={() => setModalCaja(null)} className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center"><X size={18}/></button>
              </div>

              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">

                {/* Resumen ventas */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-gray-50 rounded-2xl p-3 text-center">
                    <p className="text-xs text-gray-500 mb-0.5">Ventas</p>
                    <p className="font-black text-gray-900 text-sm">${stats.ventas.toLocaleString('es-CO')}</p>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-3 text-center">
                    <p className="text-xs text-gray-500 mb-0.5">Ingresos extra</p>
                    <p className="font-black text-green-700 text-sm">+${totalIngresos.toLocaleString('es-CO')}</p>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-3 text-center">
                    <p className="text-xs text-gray-500 mb-0.5">Egresos</p>
                    <p className="font-black text-red-600 text-sm">-${totalEgresos.toLocaleString('es-CO')}</p>
                  </div>
                </div>

                {/* Fila por método */}
                {metodosActivos.map(m => {
                  const val = conteoFinal[m.id]
                  const contado = parseFloat(val || '')
                  const tieneValor = val !== undefined && val !== ''
                  const diff = tieneValor && !isNaN(contado) ? contado - m.esperado : null

                  return (
                    <div key={m.id} className={`rounded-2xl border-2 p-4 space-y-3 transition-all ${
                      diff === null ? 'bg-white border-gray-200' :
                      diff === 0   ? 'bg-green-50 border-green-400' :
                      diff > 0     ? 'bg-blue-50 border-blue-300' :
                                     'bg-red-50 border-red-400'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{m.emoji}</span>
                          <div>
                            <p className="font-bold text-gray-900">{m.label}</p>
                            {m.id === 'efectivo' && (
                              <p className="text-xs text-gray-400">
                                Base ${turnoActivo.monto_inicial.toLocaleString('es-CO')}
                                {totalIngresos > 0 && ` + ingresos $${totalIngresos.toLocaleString('es-CO')}`}
                                {totalEgresos  > 0 && ` − egresos $${totalEgresos.toLocaleString('es-CO')}`}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">Sistema espera</p>
                          <p className="font-black text-gray-900">${m.esperado.toLocaleString('es-CO')}</p>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">
                          {m.id === 'efectivo' ? '💵 ¿Cuánto hay en caja?' : `📱 ¿Cuánto hay en ${m.label}?`}
                        </label>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={val || ''}
                          onChange={e => setConteoFinal(p => ({ ...p, [m.id]: e.target.value }))}
                          placeholder={`$${m.esperado.toLocaleString('es-CO')}`}
                          className={`w-full border-2 rounded-xl px-3 py-2.5 text-base font-bold focus:outline-none transition-all ${
                            diff === null   ? 'border-gray-200 focus:border-purple-400' :
                            diff === 0      ? 'border-green-400 bg-green-50' :
                            diff > 0        ? 'border-blue-300 bg-blue-50' :
                                              'border-red-400 bg-red-50'
                          }`}
                        />
                      </div>

                      {diff !== null && (
                        <div className={`rounded-xl px-3 py-2 text-sm font-bold flex items-center justify-between ${
                          diff === 0 ? 'bg-green-200 text-green-800' :
                          diff > 0   ? 'bg-blue-200 text-blue-800' :
                                       'bg-red-200 text-red-900'
                        }`}>
                          <span>
                            {diff === 0 ? '✅ Cuadrado perfecto' :
                             diff > 0   ? `⬆️ Sobran` :
                                          `⬇️ Faltan`}
                          </span>
                          {diff !== 0 && (
                            <span className="text-base font-black">${Math.abs(diff).toLocaleString('es-CO')}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Resumen total descuadre */}
                {hayAlgunConteo && (
                  <div className={`rounded-2xl p-4 border-2 ${
                    descuadreTotal === 0 ? 'bg-green-100 border-green-500' :
                    descuadreTotal > 0   ? 'bg-blue-100 border-blue-400' :
                                           'bg-red-100 border-red-500'
                  }`}>
                    <p className="text-xs font-bold uppercase text-gray-500 mb-1">Descuadre total</p>
                    <p className={`text-2xl font-black ${
                      descuadreTotal === 0 ? 'text-green-700' :
                      descuadreTotal > 0   ? 'text-blue-700' : 'text-red-700'
                    }`}>
                      {descuadreTotal === 0 ? '✅ Todo cuadrado' :
                       descuadreTotal > 0   ? `+$${descuadreTotal.toLocaleString('es-CO')} sobrante` :
                                              `-$${Math.abs(descuadreTotal).toLocaleString('es-CO')} faltante`}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Sistema: ${totalEsperado.toLocaleString('es-CO')} · Contado: ${totalContado.toLocaleString('es-CO')}
                    </p>
                  </div>
                )}

                {/* ── Resumen de inventario del turno ── */}
                {resumenInventario.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                      <h3 className="font-bold text-gray-900 text-sm">📦 Inventario del turno</h3>
                      <span className="text-xs text-gray-400">{resumenInventario.length} platos</span>
                    </div>
                    <div className="divide-y">
                      {resumenInventario.map(item => {
                        const vendidos = item.cantidad_inicial - item.cantidad_restante
                        const valorVendido = vendidos * item.precio
                        return (
                          <div key={item.plato_id} className="px-4 py-3">
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">{item.nombre}</p>
                                <p className="text-xs text-gray-400">{item.categoria}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-black text-gray-900 text-sm">{vendidos} vendidos</p>
                                <p className="text-xs text-green-700 font-semibold">${valorVendido.toLocaleString('es-CO')}</p>
                              </div>
                            </div>
                            <div className="flex gap-4 mt-1 text-xs text-gray-400">
                              <span>Inicial: <span className="font-semibold text-gray-600">{item.cantidad_inicial}</span></span>
                              <span>Restante: <span className={`font-semibold ${item.cantidad_restante === 0 ? 'text-red-500' : 'text-gray-600'}`}>{item.cantidad_restante}</span></span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {/* Totales finales */}
                    {(() => {
                      const totalVendidos = resumenInventario.reduce((a, i) => a + (i.cantidad_inicial - i.cantidad_restante), 0)
                      const totalValor    = resumenInventario.reduce((a, i) => a + (i.cantidad_inicial - i.cantidad_restante) * i.precio, 0)
                      return (
                        <div className="px-4 py-3 bg-purple-50 flex justify-between items-center">
                          <span className="text-sm font-bold text-purple-700">{totalVendidos} unidades vendidas</span>
                          <span className="font-black text-purple-900">${totalValor.toLocaleString('es-CO')}</span>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t shrink-0">
                <button onClick={cerrarTurno}
                  className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-2xl text-base flex items-center justify-center gap-2">
                  <Square size={18}/> Cerrar turno
                </button>
                <p className="text-center text-xs text-gray-400 mt-2">Puedes cerrar sin llenar los campos si prefieres</p>
              </div>
            </div>
          </div>
        )
      })()}
      {/* ── Modal: QR de mesa ── */}
      {modalQR && (() => {
        const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/mesa/${modalQR.id}`
        const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(url)}&bgcolor=ffffff&color=1a1a1a&margin=2`
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-xs fade-in text-center space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-bold text-gray-900 text-lg">Mesa {modalQR.numero}</p>
                  {modalQR.zona && <p className="text-xs text-gray-400">{modalQR.zona}</p>}
                </div>
                <button onClick={() => setModalQR(null)}><X size={20} className="text-gray-400" /></button>
              </div>
              <img src={qrSrc} alt={`QR Mesa ${modalQR.numero}`} className="mx-auto rounded-xl border border-gray-100 p-2" width={200} height={200} />
              <p className="text-xs text-gray-400 break-all">{url}</p>
              <button
                onClick={() => {
                  const a = document.createElement('a')
                  a.href = qrSrc
                  a.download = `QR-Mesa-${modalQR.numero}.png`
                  a.click()
                }}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl text-sm"
              >
                Descargar QR
              </button>
            </div>
          </div>
        )
      })()}

      {/* ── Modal: Nueva zona ── */}
      {modalNuevaZona && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm fade-in space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">Nueva zona</h3>
              <button onClick={() => setModalNuevaZona(false)}><X size={20} /></button>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Nombre de la zona</label>
              <input type="text" placeholder="Ej: Terraza, Salón VIP, Zona A..."
                value={nuevaZonaNombre} onChange={e => setNuevaZonaNombre(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Número de la primera mesa</label>
              <input type="number" min="1" placeholder="Ej: 1"
                value={nuevaMesaNumero} onChange={e => setNuevaMesaNumero(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
            <button onClick={crearZonaConMesa} disabled={guardandoMesa}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl">
              {guardandoMesa ? 'Creando...' : 'Crear zona'}
            </button>
          </div>
        </div>
      )}

      {/* ── Modal: Renombrar zona ── */}
      {modalRenombrarZona && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm fade-in space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">Renombrar zona</h3>
              <button onClick={() => setModalRenombrarZona(null)}><X size={20} /></button>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Nuevo nombre</label>
              <input type="text" placeholder="Nombre de la zona"
                value={renombrarZonaValor} onChange={e => setRenombrarZonaValor(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
            <button onClick={() => renombrarZona(modalRenombrarZona, renombrarZonaValor)}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl">
              Guardar nombre
            </button>
          </div>
        </div>
      )}

      {/* ── Modal: Agregar mesa a zona ── */}
      {modalAgregarMesa && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm fade-in space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">Agregar mesa — {modalAgregarMesa}</h3>
              <button onClick={() => setModalAgregarMesa(null)}><X size={20} /></button>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Número de mesa</label>
              <input type="number" min="1" placeholder="Ej: 5"
                value={nuevaMesaNumero} onChange={e => setNuevaMesaNumero(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
            <button onClick={() => agregarMesaEnZona(modalAgregarMesa)} disabled={guardandoMesa}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl">
              {guardandoMesa ? 'Agregando...' : 'Agregar mesa'}
            </button>
          </div>
        </div>
      )}

      {modalUsuario && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm fade-in space-y-3">
            <div className="flex justify-between items-center"><h3 className="font-bold text-lg">Nuevo usuario</h3><button onClick={() => setModalUsuario(false)}><X size={20} /></button></div>
            <input type="text" placeholder="Nombre completo" value={nuevoUsuario.nombre} onChange={e => setNuevoUsuario(p => ({ ...p, nombre: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            <input type="email" placeholder="Correo electrónico" value={nuevoUsuario.email} onChange={e => setNuevoUsuario(p => ({ ...p, email: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            <input type="password" placeholder="Contraseña" value={nuevoUsuario.password} onChange={e => setNuevoUsuario(p => ({ ...p, password: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            <select value={nuevoUsuario.rol} onChange={e => setNuevoUsuario(p => ({ ...p, rol: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
              <option value="mesera">Mesera</option><option value="cocina">Cocina</option><option value="gerente">Gerente</option>
            </select>
            <button onClick={crearUsuario} disabled={creandoUsuario} className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl">
              {creandoUsuario ? 'Creando...' : 'Crear usuario'}
            </button>
          </div>
        </div>
      )}

      {/* ── Modal editar usuario ── */}
      {editandoUsuario && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm fade-in space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">Editar usuario</h3>
              <button onClick={() => setEditandoUsuario(null)}><X size={20} /></button>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Nombre</label>
              <input
                type="text"
                value={editandoUsuario.nombre}
                onChange={e => setEditandoUsuario(p => p ? { ...p, nombre: e.target.value } : p)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Rol / Panel que verá</label>
              <select
                value={editandoUsuario.rol}
                onChange={e => setEditandoUsuario(p => p ? { ...p, rol: e.target.value } : p)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                <option value="mesera">👩 Mesera — ve el panel de mesas y pedidos</option>
                <option value="cocina">👨‍🍳 Cocina — ve el panel de preparación</option>
                <option value="gerente">👔 Gerente — ve el panel completo</option>
              </select>
              <p className="text-xs text-gray-400 mt-1.5">
                ⚠️ El cambio aplica la próxima vez que el usuario inicie sesión.
              </p>
            </div>

            <button
              onClick={guardarCambiosUsuario}
              disabled={guardandoUsuario || !editandoUsuario.nombre.trim()}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition-colors">
              {guardandoUsuario ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
