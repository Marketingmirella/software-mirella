'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import {
  BarChart3, TrendingUp, Users, DollarSign, Clock, ChefHat,
  Plus, Minus, X, Play, Square, MapPin, CheckCircle, Banknote,
  Pencil, Trash2, UtensilsCrossed, Timer, UserCircle, Search, Bike,
  Download, SlidersHorizontal, CalendarDays, Settings, Lock, ClipboardList,
  LogOut, AlertTriangle, RotateCcw, ShieldAlert
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid
} from 'recharts'

// ─── TIPOS ───────────────────────────────────────────────────
interface PlatoStat { nombre: string; cantidad: number; total: number }
interface MeseraStat { nombre: string; pedidos: number; total: number }
interface PedidoResumen { id: string; mesa: number; total: number; estado: string; created_at: string; pagado_en?: string | null; tipo: string; turno_id?: string | null }
interface ItemDetalle { id?: string; plato_id?: string | null; nombre: string; cantidad: number; precio_unitario: number; notas: string | null; estado: string; pedido_por_nombre?: string | null }
interface PedidoDetalle {
  id: string; estado: string; tipo: string; created_at: string; notas: string | null
  mesa: { numero: number }; mesera: { nombre: string } | null; items: ItemDetalle[]
  cliente_nombre?: string | null; cliente_telefono?: string | null
  cliente_cedula?: string | null; cliente_direccion?: string | null
  comprobante_url?: string | null; metodo_pago_cliente?: string | null
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
interface MenuTurno {
  id: string; nombre: string
  items: { plato_id: string; cantidad: number }[]
  created_at: string
}

type MetodoPago = 'efectivo' | 'nequi' | 'daviplata' | 'bancolombia'
type Seccion = 'mesas' | 'carta' | 'resumen' | 'tiempos' | 'caja' | 'usuarios' | 'clientes' | 'permisos'
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
  const [abriendo, setAbriendo] = useState(false)
  // Inventario por turno
  const [pasoCaja, setPasoCaja] = useState<'efectivo' | 'inventario'>('efectivo')
  const [inventarioTurno, setInventarioTurno] = useState<Record<string, number>>({})
  const [resumenInventario, setResumenInventario] = useState<{ plato_id: string; nombre: string; categoria: string; precio: number; cantidad_inicial: number; cantidad_restante: number }[]>([])

  // Usuarios
  const [modalUsuario, setModalUsuario] = useState(false)
  const [nuevoUsuario, setNuevoUsuario] = useState({ nombre: '', email: '', password: '', rol: 'mesera' })
  const [creandoUsuario, setCreandoUsuario] = useState(false)
  const [listaUsuarios, setListaUsuarios] = useState<{ id: string; nombre: string; rol: string; activo: boolean }[]>([])
  const [editandoUsuario, setEditandoUsuario] = useState<{ id: string; nombre: string; rol: string; activo: boolean; nuevaPassword: string } | null>(null)
  const [guardandoUsuario, setGuardandoUsuario] = useState(false)
  const [eliminandoUsuario, setEliminandoUsuario] = useState(false)

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

  // Menús de turno (múltiples menús con nombre)
  const [subSeccionCarta, setSubSeccionCarta] = useState<'carta' | 'menus'>('carta')
  const [menusTurno, setMenusTurno] = useState<MenuTurno[]>([])
  const [modalNuevoMenu, setModalNuevoMenu] = useState<'nuevo' | 'editar' | null>(null)
  const [menuForm, setMenuForm] = useState<{ nombre: string; items: Record<string, number> }>({ nombre: '', items: {} })
  const [editandoMenuId, setEditandoMenuId] = useState<string | null>(null)
  const [guardandoMenu, setGuardandoMenu] = useState(false)
  // Modo inventario al abrir turno
  const [modoInventario, setModoInventario] = useState<'manual' | 'menu'>('manual')
  const [menuSeleccionadoId, setMenuSeleccionadoId] = useState<string | null>(null)

  // Permisos / configuración cocina
  const [bloqueoActivo, setBloqueoActivo] = useState(false)
  const [bloqueoCantidad, setBloqueoCantidad] = useState(3)
  const [guardandoPermisos, setGuardandoPermisos] = useState(false)

  // Panel de configuración ⚙️
  const [modalSettings, setModalSettings] = useState(false)
  const [seccionSettings, setSeccionSettings] = useState<'cuenta' | 'usuarios' | 'permisos' | 'restablecer'>('cuenta')
  // Restablecer negocio
  const [restablecerScope, setRestablecerScope] = useState<'todo' | 'desde_fecha'>('todo')
  const [restablecerFecha, setRestablecerFecha] = useState('')
  const [restablecerItems, setRestablecerItems] = useState({ pedidos: false, turnos: false, clientes: false, inventario: false })
  const [restablecerConfirm, setRestablecerConfirm] = useState('')
  const [restableciendo, setRestableciendo] = useState(false)
  const [pasoRestablecer, setPasoRestablecer] = useState<'opciones' | 'confirmar'>('opciones')

  // Edición de ítems desde gerencia (cancelar / reemplazar)
  const [modoEdicionPedido, setModoEdicionPedido] = useState(false)
  const [itemReemplazando, setItemReemplazando] = useState<{ id: string; nombre: string } | null>(null)
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [categoriaReemplazo, setCategoriaReemplazo] = useState<number | 'todas'>('todas')

  // Tomar pedido desde gerencia
  const [modalNuevoPedido, setModalNuevoPedido] = useState(false)
  const [nuevoOrdenTipo, setNuevoOrdenTipo] = useState<'mesa' | 'domi'>('mesa')
  const [nuevoOrdenMesaId, setNuevoOrdenMesaId] = useState<number | null>(null)
  const [nuevoOrdenCarrito, setNuevoOrdenCarrito] = useState<Record<string, number>>({})
  const [nuevoOrdenNotas, setNuevoOrdenNotas] = useState('')
  const [nuevoOrdenDomi, setNuevoOrdenDomi] = useState({ nombre: '', telefono: '', direccion: '' })
  const [nuevoOrdenCategoria, setNuevoOrdenCategoria] = useState<number | 'todas'>('todas')
  const [tomandoPedido, setTomandoPedido] = useState(false)

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
  const [modalQRDomi, setModalQRDomi] = useState(false)

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

  // ── CARGAR / GUARDAR CONFIGURACIÓN ──────────────────────────
  const cargarConfiguracion = useCallback(async () => {
    const { data } = await supabase
      .from('configuracion')
      .select('clave, valor')
      .in('clave', ['bloqueo_cocina_activo', 'bloqueo_cocina_cantidad'])
    if (data) {
      const cfg: Record<string, string> = {}
      data.forEach((r: { clave: string; valor: string }) => { cfg[r.clave] = r.valor })
      if ('bloqueo_cocina_activo' in cfg) setBloqueoActivo(cfg['bloqueo_cocina_activo'] === 'true')
      if ('bloqueo_cocina_cantidad' in cfg) setBloqueoCantidad(parseInt(cfg['bloqueo_cocina_cantidad']) || 3)
    }
  }, [supabase])

  // ── MENÚS DE TURNO ───────────────────────────────────────────
  const cargarMenusTurno = useCallback(async () => {
    const { data } = await supabase.from('menus_turno').select('*').order('created_at', { ascending: false })
    if (data) setMenusTurno(data as MenuTurno[])
  }, [supabase])

  async function guardarMenuTurno() {
    if (!menuForm.nombre.trim()) { toast.error('Escribe un nombre para el menú'); return }
    setGuardandoMenu(true)
    const items = Object.entries(menuForm.items)
      .filter(([, qty]) => qty > 0)
      .map(([plato_id, cantidad]) => ({ plato_id, cantidad }))
    if (editandoMenuId) {
      await supabase.from('menus_turno').update({ nombre: menuForm.nombre.trim(), items }).eq('id', editandoMenuId)
      toast.success('✅ Menú actualizado')
    } else {
      await supabase.from('menus_turno').insert({ nombre: menuForm.nombre.trim(), items })
      toast.success('✅ Menú creado')
    }
    setGuardandoMenu(false)
    setModalNuevoMenu(null)
    setEditandoMenuId(null)
    setMenuForm({ nombre: '', items: {} })
    await cargarMenusTurno()
  }

  async function eliminarMenuTurno(id: string, nombre: string) {
    if (!confirm(`¿Eliminar el menú "${nombre}"? Esta acción no se puede deshacer.`)) return
    await supabase.from('menus_turno').delete().eq('id', id)
    toast.success('Menú eliminado')
    await cargarMenusTurno()
  }

  function aplicarMenuTurno(menuId: string) {
    const menu = menusTurno.find(m => m.id === menuId)
    if (!menu) return
    const init: Record<string, number> = {}
    platos.forEach(p => { init[p.id] = 0 })
    menu.items.forEach(item => { init[item.plato_id] = item.cantidad })
    setInventarioTurno(init)
    setMenuSeleccionadoId(menuId)
  }

  async function cerrarSesion() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function ejecutarRestablecer() {
    if (restablecerConfirm !== 'BORRAR') { toast.error('Escribe BORRAR para confirmar'); return }
    const alguno = Object.values(restablecerItems).some(Boolean)
    if (!alguno) { toast.error('Selecciona al menos un tipo de datos'); return }
    setRestableciendo(true)
    try {
      const desde = restablecerScope === 'desde_fecha' && restablecerFecha
        ? `${restablecerFecha}T00:00:00.000Z`
        : '2000-01-01T00:00:00.000Z'  // efectivamente todo

      if (restablecerItems.pedidos) {
        // Borrar en orden correcto para no romper FK
        const { data: pedidosIds } = await supabase.from('pedidos').select('id').gte('created_at', desde)
        const ids = (pedidosIds || []).map((p: { id: string }) => p.id)
        if (ids.length > 0) {
          await Promise.all([
            supabase.from('pagos').delete().in('pedido_id', ids),
            supabase.from('items_pedido').delete().in('pedido_id', ids),
          ])
          await supabase.from('pedidos').delete().in('id', ids)
        }
      }

      if (restablecerItems.turnos) {
        const { data: turnosIds } = await supabase.from('turnos').select('id').gte('abierto_en', desde)
        const ids = (turnosIds || []).map((t: { id: string }) => t.id)
        if (ids.length > 0) {
          await Promise.all([
            supabase.from('movimientos_caja').delete().in('turno_id', ids),
            supabase.from('turnos_inventario').delete().in('turno_id', ids),
          ])
          await supabase.from('turnos').delete().in('id', ids)
        }
      }

      if (restablecerItems.clientes) {
        // Desligar pedidos antes de borrar clientes
        await supabase.from('pedidos').update({ cliente_id: null }).not('cliente_id', 'is', null)
        await supabase.from('clientes').delete().not('id', 'is', null)
      }

      if (restablecerItems.inventario) {
        await supabase.from('inventario').update({ cantidad_disponible: 0 }).not('plato_id', 'is', null)
      }

      toast.success('✅ Datos restablecidos correctamente')
      setRestablecerConfirm('')
      setRestablecerItems({ pedidos: false, turnos: false, clientes: false, inventario: false })
      setPasoRestablecer('opciones')
      setModalSettings(false)
      await cargarDatos(); await cargarMesas()
    } catch (e) {
      toast.error('Error al restablecer: ' + String(e))
    }
    setRestableciendo(false)
  }

  async function guardarConfiguracion() {
    setGuardandoPermisos(true)
    await supabase.from('configuracion').upsert([
      { clave: 'bloqueo_cocina_activo',   valor: String(bloqueoActivo)   },
      { clave: 'bloqueo_cocina_cantidad', valor: String(bloqueoCantidad) },
    ], { onConflict: 'clave' })
    toast.success('✅ Permisos guardados')
    setGuardandoPermisos(false)
  }

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
    // Redondear al peso para evitar errores de punto flotante en el cuadre
    setPagosPorMetodo(Object.entries(porMetodo).map(([metodo, v]) => ({
      metodo,
      monto:   Math.round(v.monto),
      propina: Math.round(v.propina),
    })))
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
    cargarConfiguracion()
    cargarMenusTurno()
    const canal = supabase.channel('gerencia-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => { cargarDatos(); cargarMesas() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesas' }, cargarMesas)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'configuracion' }, cargarConfiguracion)
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [cargarDatos, cargarMesas, cargarCarta, cargarResumen, cargarConfiguracion, cargarMenusTurno, supabase, hoyStr])

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
      supabase.from('usuarios').select('id, nombre, rol, activo').order('nombre').then(({ data }) => {
        if (data) setListaUsuarios(data)
      })
    }
  }, [seccion, rangoResumen, cargarResumen, cargarClientes, hoyStr, supabase])

  // ── DETALLE MESA ─────────────────────────────────────────────
  async function abrirDetalleMesa(mesa: typeof mesas[0]) {
    if (mesa.estado === 'libre') { toast('Mesa libre'); return }
    setModoEdicionPedido(false); setItemReemplazando(null)
    const { data: pedido } = await supabase.from('pedidos').select(`
      id, estado, tipo, created_at, notas, cliente_nombre, cliente_cedula, cliente_telefono,
      mesa:mesas(numero), mesera:usuarios(nombre),
      items:items_pedido(id, plato_id, estado, cantidad, precio_unitario, notas, plato:platos(nombre), pedido_por_usuario:usuarios!pedido_por(nombre))
    `).eq('mesa_id', mesa.id).in('estado', ['pendiente','en_preparacion','listo','entregado','esperando_pago'])
      .order('created_at', { ascending: false }).limit(1).single()
    if (!pedido) { toast.error('No se encontró el pedido'); return }
    const { data: pagos } = await supabase.from('pagos').select('*').eq('pedido_id', pedido.id).order('created_at')
    const p = pedido as typeof pedido & { cliente_nombre: string | null; cliente_cedula: string | null; cliente_telefono: string | null }
    const fmt: PedidoDetalle = {
      ...pedido,
      mesa: (pedido.mesa as unknown as { numero: number }),
      mesera: pedido.mesera as unknown as { nombre: string } | null,
      items: (pedido.items as unknown as { id: string; plato_id: string | null; estado: string; cantidad: number; precio_unitario: number; notas: string | null; plato: { nombre: string }; pedido_por_usuario: { nombre: string } | null }[])
        .map(i => ({ id: i.id, plato_id: i.plato_id, nombre: i.plato?.nombre || '', cantidad: i.cantidad, precio_unitario: i.precio_unitario, notas: i.notas, estado: i.estado, pedido_por_nombre: i.pedido_por_usuario?.nombre || null })),
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
      comprobante_url, metodo_pago_cliente,
      mesera:usuarios(nombre),
      items:items_pedido(estado, cantidad, precio_unitario, notas, plato:platos(nombre))
    `).eq('id', pedidoId).single()
    if (!pedido) { toast.error('No se encontró el domi'); return }
    const { data: pagos } = await supabase.from('pagos').select('*').eq('pedido_id', pedido.id).order('created_at')
    const p = pedido as typeof pedido & {
      cliente_nombre: string | null; cliente_cedula: string | null
      cliente_telefono: string | null; cliente_direccion: string | null
      comprobante_url: string | null; metodo_pago_cliente: string | null
    }
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
      comprobante_url: p.comprobante_url,
      metodo_pago_cliente: p.metodo_pago_cliente,
    }
    setMesaDetalle({ mesa: null, pedido: fmt, pagos: (pagos || []) as PagoRegistrado[], isDomi: true })
    setMontoPago(''); setPropinaPago(''); setMetodoPago('efectivo'); setVistaModal('pago')
  }

  async function confirmarPagoTransferencia() {
    if (!mesaDetalle) return
    const metodo = mesaDetalle.pedido.metodo_pago_cliente as MetodoPago | null
    if (!metodo) { toast.error('Sin método de pago del cliente'); return }
    setAgregandoPago(true)
    const total = mesaDetalle.pedido.items.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0)
    await supabase.from('pagos').insert({ pedido_id: mesaDetalle.pedido.id, metodo, monto: total, propina: 0 })
    await supabase.from('pedidos').update({ estado: 'pagado', pagado_en: new Date().toISOString() }).eq('id', mesaDetalle.pedido.id)
    toast.success('✅ Pago confirmado y registrado en caja')
    setMesaDetalle(null); setVistaModal('pago')
    setAgregandoPago(false)
    cargarMesas(); cargarDatos()
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
  function irAInventario() {
    const init: Record<string, number> = {}
    platos.forEach(p => { init[p.id] = 0 })
    setInventarioTurno(init)
    setModoInventario('manual')
    setMenuSeleccionadoId(null)
    setPasoCaja('inventario')
  }

  async function abrirTurno() {
    if (abriendo) return  // Bloquea doble clic
    setAbriendo(true)

    const { data: { user } } = await supabase.auth.getUser()
    const { data: nuevoTurno } = await supabase
      .from('turnos').insert({ abierto_por: user?.id, monto_inicial: parseFloat(montoInicial) || 0 })
      .select().single()

    if (nuevoTurno?.id) {
      const entries = Object.entries(inventarioTurno).filter(([, qty]) => qty > 0)
      if (entries.length > 0) {
        // Todas las actualizaciones en paralelo — mucho más rápido que loop secuencial
        await Promise.all([
          // Un solo insert con todas las filas de inventario del turno
          supabase.from('turnos_inventario').insert(
            entries.map(([platoId, qty]) => ({ turno_id: nuevoTurno.id, plato_id: platoId, cantidad_inicial: qty }))
          ),
          // Actualizar inventario en paralelo (una petición por plato simultánea)
          ...entries.map(([platoId, qty]) =>
            supabase.from('inventario').update({ cantidad_disponible: qty }).eq('plato_id', platoId)
          ),
        ])
      }
      cargarCaja(nuevoTurno.id)
    }

    toast.success('✅ Turno abierto')
    setModalCaja(null); setMontoInicial(''); setPasoCaja('efectivo'); setInventarioTurno({})
    setAbriendo(false)
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
      const { data: ul } = await supabase.from('usuarios').select('id, nombre, rol, activo').order('nombre')
      if (ul) setListaUsuarios(ul)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('Error de conexión: ' + msg)
    }
    setCreandoUsuario(false)
  }

  // ── EDITAR USUARIO (rol / nombre) ────────────────────────────
  async function guardarCambiosUsuario() {
    if (!editandoUsuario) return
    setGuardandoUsuario(true)

    // 1. Actualizar nombre y rol en la tabla usuarios
    const { error } = await supabase
      .from('usuarios')
      .update({ nombre: editandoUsuario.nombre.trim(), rol: editandoUsuario.rol })
      .eq('id', editandoUsuario.id)
    if (error) { toast.error('No se pudo guardar: ' + error.message); setGuardandoUsuario(false); return }

    // 2. Si escribió nueva contraseña, cambiarla vía API
    if (editandoUsuario.nuevaPassword.trim()) {
      const res = await fetch('/api/gestionar-usuario', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editandoUsuario.id, nuevaPassword: editandoUsuario.nuevaPassword.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error('Error al cambiar contraseña: ' + data.error); setGuardandoUsuario(false); return }
    }

    toast.success('✅ Usuario actualizado')
    setEditandoUsuario(null)
    setGuardandoUsuario(false)
    const { data: ul } = await supabase.from('usuarios').select('id, nombre, rol, activo').order('nombre')
    if (ul) setListaUsuarios(ul)
  }

  async function toggleActivoUsuario(id: string, activoActual: boolean) {
    const res = await fetch('/api/gestionar-usuario', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, activo: !activoActual }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error('Error: ' + data.error); return }
    toast.success(activoActual ? '🔒 Usuario inhabilitado' : '✅ Usuario habilitado')
    setEditandoUsuario(null)
    const { data: ul } = await supabase.from('usuarios').select('id, nombre, rol, activo').order('nombre')
    if (ul) setListaUsuarios(ul)
  }

  async function eliminarUsuario(id: string, nombre: string) {
    if (!confirm(`¿Eliminar definitivamente a "${nombre}"? Esta acción no se puede deshacer.`)) return
    setEliminandoUsuario(true)
    const res = await fetch('/api/gestionar-usuario', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const data = await res.json()
    setEliminandoUsuario(false)
    if (!res.ok) { toast.error('Error al eliminar: ' + data.error); return }
    toast.success(`🗑️ Usuario "${nombre}" eliminado`)
    setEditandoUsuario(null)
    const { data: ul } = await supabase.from('usuarios').select('id, nombre, rol, activo').order('nombre')
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

  // ── CANCELAR / REEMPLAZAR ÍTEM ────────────────────────────────
  async function cancelarItem(itemId: string) {
    if (!confirm('¿Cancelar este plato del pedido? Se eliminará de cocina también.')) return
    setGuardandoEdicion(true)
    const { error } = await supabase.from('items_pedido').delete().eq('id', itemId)
    if (error) { toast.error('Error al cancelar plato'); setGuardandoEdicion(false); return }
    setMesaDetalle(prev => prev
      ? { ...prev, pedido: { ...prev.pedido, items: prev.pedido.items.filter(i => i.id !== itemId) } }
      : null)
    toast.success('Plato cancelado ✓')
    setGuardandoEdicion(false)
  }

  async function reemplazarItem(itemId: string, nuevoPlatoId: string) {
    const plato = platos.find(p => p.id === nuevoPlatoId)
    if (!plato) return
    setGuardandoEdicion(true)
    const { error } = await supabase.from('items_pedido')
      .update({ plato_id: nuevoPlatoId, precio_unitario: plato.precio, estado: 'pendiente' })
      .eq('id', itemId)
    if (error) { toast.error('Error al reemplazar plato'); setGuardandoEdicion(false); return }
    setMesaDetalle(prev => {
      if (!prev) return null
      return { ...prev, pedido: { ...prev.pedido, items: prev.pedido.items.map(i =>
        i.id === itemId ? { ...i, plato_id: nuevoPlatoId, nombre: plato.nombre, precio_unitario: plato.precio, estado: 'pendiente' } : i
      ) } }
    })
    setItemReemplazando(null)
    toast.success(`✅ Cambiado a "${plato.nombre}" — enviado a cocina`)
    setGuardandoEdicion(false)
  }

  // ── TOMAR PEDIDO DESDE GERENCIA ───────────────────────────────
  async function tomarPedidoGerencia() {
    const itemsCarrito = Object.entries(nuevoOrdenCarrito).filter(([, qty]) => qty > 0)
    if (itemsCarrito.length === 0) { toast.error('Agrega al menos un plato al pedido'); return }
    if (!turnoActivo) { toast.error('No hay turno activo — abre el turno primero'); return }
    if (nuevoOrdenTipo === 'mesa' && !nuevoOrdenMesaId) { toast.error('Selecciona una mesa'); return }
    setTomandoPedido(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let pedidoId: string

      // Helper para crear pedido y obtener su id con manejo de error
      const crearPedido = async (datos: Record<string, unknown>): Promise<string> => {
        const { data: nuevo, error: errNuevo } = await supabase
          .from('pedidos').insert(datos).select('id').single()
        if (errNuevo || !nuevo) throw new Error(errNuevo?.message || 'No se pudo crear el pedido')
        return nuevo.id
      }

      if (nuevoOrdenTipo === 'mesa') {
        const mesa = mesas.find(m => m.id === nuevoOrdenMesaId)
        if (mesa && mesa.estado !== 'libre') {
          // Mesa ocupada → agregar a pedido existente
          const { data: ped } = await supabase.from('pedidos')
            .select('id').eq('mesa_id', nuevoOrdenMesaId!)
            .in('estado', ['pendiente','en_preparacion','listo','entregado','esperando_pago'])
            .order('created_at', { ascending: false }).limit(1).maybeSingle()
          if (ped) {
            pedidoId = ped.id
          } else {
            pedidoId = await crearPedido({
              mesa_id: nuevoOrdenMesaId, mesera_id: user?.id || null, turno_id: turnoActivo.id,
              estado: 'pendiente', tipo: 'mesera', notas: nuevoOrdenNotas || null,
            })
            await supabase.from('mesas').update({ estado: 'ocupada' }).eq('id', nuevoOrdenMesaId!)
          }
        } else {
          // Mesa libre → crear nuevo pedido
          pedidoId = await crearPedido({
            mesa_id: nuevoOrdenMesaId, mesera_id: user?.id || null, turno_id: turnoActivo.id,
            estado: 'pendiente', tipo: 'mesa', notas: nuevoOrdenNotas || null,
          })
          await supabase.from('mesas').update({ estado: 'ocupada' }).eq('id', nuevoOrdenMesaId!)
        }
      } else {
        // Domicilio
        pedidoId = await crearPedido({
          mesera_id: user?.id || null, turno_id: turnoActivo.id,
          estado: 'pendiente', tipo: 'domi', notas: nuevoOrdenNotas || null,
          cliente_nombre:    nuevoOrdenDomi.nombre    || null,
          cliente_telefono:  nuevoOrdenDomi.telefono  || null,
          cliente_direccion: nuevoOrdenDomi.direccion || null,
        })
      }

      const { error: errItems } = await supabase.from('items_pedido').insert(
        itemsCarrito.map(([platoId, qty]) => {
          const p = platos.find(pl => pl.id === platoId)!
          return { pedido_id: pedidoId, plato_id: platoId, cantidad: qty, precio_unitario: p.precio, estado: 'pendiente', pedido_por: user?.id || null }
        })
      )
      if (errItems) throw new Error(errItems.message)

      toast.success('✅ Pedido enviado a cocina')
      setModalNuevoPedido(false)
      setNuevoOrdenCarrito({}); setNuevoOrdenMesaId(null); setNuevoOrdenNotas('')
      setNuevoOrdenDomi({ nombre: '', telefono: '', direccion: '' })
      cargarMesas(); cargarDatos()
    } catch (e) {
      toast.error('Error: ' + (e instanceof Error ? e.message : String(e)))
    }
    setTomandoPedido(false)
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
        <div className="flex items-center gap-2">
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${turnoActivo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {turnoActivo ? '● Turno abierto' : '○ Sin turno'}
          </div>
          <button onClick={() => {
              setModalSettings(true)
              setSeccionSettings('cuenta')
              // Cargar usuarios al abrir settings
              supabase.from('usuarios').select('id, nombre, rol, activo').order('nombre').then(({ data }) => {
                if (data) setListaUsuarios(data)
              })
            }}
            className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center transition-colors">
            <Settings size={18} className="text-gray-600" />
          </button>
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
            <div className="flex items-center justify-between mb-4 gap-2">
              {!modoGestionMesas ? (
                <div className="flex gap-3 text-xs flex-wrap">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-200 inline-block" /> Libre</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-400 inline-block" /> Ocupada</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" /> Cobrando</span>
                </div>
              ) : (
                <p className="text-sm font-bold text-purple-700">Modo gestión de mesas</p>
              )}
              <div className="flex gap-2 shrink-0">
                <button onClick={() => {
                  setModalNuevoPedido(true)
                  setNuevoOrdenTipo('mesa'); setNuevoOrdenCarrito({})
                  setNuevoOrdenMesaId(null); setNuevoOrdenNotas('')
                  setNuevoOrdenCategoria('todas')
                  setNuevoOrdenDomi({ nombre: '', telefono: '', direccion: '' })
                }}
                  className="text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 bg-purple-600 text-white hover:bg-purple-700 transition-colors">
                  <Plus size={13} /> Pedido
                </button>
                <button onClick={() => setModalQRDomi(true)}
                  className="text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                  📱 QR Domi
                </button>
                <button onClick={() => setModoGestionMesas(g => !g)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors ${modoGestionMesas ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  <Settings size={13} /> {modoGestionMesas ? 'Salir' : 'Gestionar'}
                </button>
              </div>
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
            {/* Tabs de subsección */}
            <div className="flex gap-2 mb-4">
              <button onClick={() => setSubSeccionCarta('carta')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${subSeccionCarta === 'carta' ? 'bg-purple-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                <UtensilsCrossed size={15} /> Carta general
              </button>
              <button onClick={() => setSubSeccionCarta('menus')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${subSeccionCarta === 'menus' ? 'bg-orange-500 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                <ClipboardList size={15} /> Menús de turno
              </button>
            </div>

            {/* ── SUBSECCIÓN: CARTA GENERAL ── */}
            {subSeccionCarta === 'carta' && (
              <div>
                <div className="flex items-center justify-between mb-4 gap-2">
                  <h2 className="font-bold text-gray-900">Gestión de carta</h2>
                  <button onClick={abrirNuevoPlato} className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5">
                    <Plus size={15} /> Nuevo plato
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

            {/* ── SUBSECCIÓN: MENÚS DE TURNO ── */}
            {subSeccionCarta === 'menus' && (
              <div>
                <div className="flex items-center justify-between mb-3 gap-2">
                  <h2 className="font-bold text-gray-900">Menús de turno</h2>
                  <button
                    onClick={() => { setModalNuevoMenu('nuevo'); setEditandoMenuId(null); setMenuForm({ nombre: '', items: {} }) }}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5">
                    <Plus size={15} /> Nuevo menú
                  </button>
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 text-xs text-orange-700 leading-relaxed mb-4">
                  💡 Crea menús con nombre para tener tus plantillas de cantidad por día o temporada. Al abrir el turno puedes escoger uno de la lista o ingresar cantidades manualmente.
                </div>

                <div className="space-y-3">
                  {menusTurno.length === 0 && (
                    <div className="text-center py-12 text-gray-400">
                      <ClipboardList size={36} className="mx-auto mb-3 opacity-25" />
                      <p className="text-sm font-medium">No hay menús creados todavía</p>
                      <p className="text-xs mt-1">Toca "Nuevo menú" para crear el primero</p>
                    </div>
                  )}
                  {menusTurno.map(menu => {
                    const itemsConCantidad = menu.items.filter(i => i.cantidad > 0)
                    const totalUnidades = menu.items.reduce((a, i) => a + i.cantidad, 0)
                    return (
                      <div key={menu.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-gray-900 text-base">{menu.nombre}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {itemsConCantidad.length} platos · {totalUnidades} unidades totales
                            </p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {itemsConCantidad.slice(0, 5).map(item => {
                                const plato = platos.find(p => p.id === item.plato_id)
                                if (!plato) return null
                                return (
                                  <span key={item.plato_id} className="text-xs bg-orange-50 text-orange-700 border border-orange-100 px-2 py-0.5 rounded-full">
                                    {plato.nombre} ×{item.cantidad}
                                  </span>
                                )
                              })}
                              {itemsConCantidad.length > 5 && (
                                <span className="text-xs text-gray-400 px-1">+{itemsConCantidad.length - 5} más</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => {
                              const items: Record<string, number> = {}
                              menu.items.forEach(i => { items[i.plato_id] = i.cantidad })
                              setMenuForm({ nombre: menu.nombre, items })
                              setEditandoMenuId(menu.id)
                              setModalNuevoMenu('editar')
                            }} className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center">
                              <Pencil size={14} className="text-gray-600" />
                            </button>
                            <button onClick={() => eliminarMenuTurno(menu.id, menu.nombre)}
                              className="w-8 h-8 bg-red-50 hover:bg-red-100 rounded-xl flex items-center justify-center">
                              <Trash2 size={14} className="text-red-500" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
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
                    domi:    'bg-blue-100 text-blue-700',
                  }
                  const ROL_LABEL: Record<string, string> = {
                    gerente: 'Gerente', mesera: 'Mesera', cocina: 'Cocina', domi: 'Domi',
                  }
                  return (
                    <div key={u.id} className={`flex items-center justify-between px-4 py-3.5 ${i !== 0 ? 'border-t border-gray-50' : ''} ${!u.activo ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${u.activo ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-400'}`}>
                          {u.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-medium text-gray-900 text-sm">{u.nombre}</span>
                          {!u.activo && <p className="text-xs text-red-500 font-medium">Inhabilitado</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${ROL_BADGE[u.rol] || 'bg-gray-100 text-gray-600'}`}>
                          {ROL_LABEL[u.rol] || u.rol}
                        </span>
                        <button
                          onClick={() => setEditandoUsuario({ id: u.id, nombre: u.nombre, rol: u.rol, activo: u.activo ?? true, nuevaPassword: '' })}
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
        {/* ══ PERMISOS ════════════════════════════════════════════ */}
        {seccion === 'permisos' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Lock size={20} className="text-purple-600" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Control de flujo — Cocina</h2>
                  <p className="text-xs text-gray-400">Regula cuántos pedidos ve la cocina a la vez</p>
                </div>
              </div>

              {/* Toggle bloqueo */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="font-semibold text-gray-800 text-sm">Bloqueo de comandas</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    La cocina solo verá un lote de pedidos a la vez, en estricto orden de llegada
                  </p>
                </div>
                <button
                  onClick={() => setBloqueoActivo(v => !v)}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${bloqueoActivo ? 'bg-purple-600' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${bloqueoActivo ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Cantidad de comandas por lote */}
              {bloqueoActivo && (
                <div>
                  <p className="font-semibold text-gray-800 text-sm mb-1">Comandas por lote</p>
                  <p className="text-xs text-gray-400 mb-3">
                    Cuántos pedidos puede ver cocina al mismo tiempo antes de que aparezca el siguiente
                  </p>
                  <div className="flex gap-2">
                    {[2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setBloqueoCantidad(n)}
                        className={`flex-1 py-3 rounded-xl font-black text-lg transition-all border-2 ${bloqueoCantidad === n ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-200 hover:border-purple-400'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 bg-purple-50 border border-purple-100 rounded-xl p-3">
                    <p className="text-xs text-purple-700 leading-relaxed">
                      🔒 Cocina verá solo los primeros <b>{bloqueoCantidad} pedido{bloqueoCantidad !== 1 ? 's' : ''}</b> (por orden de llegada). Los siguientes aparecen conforme esos queden listos.
                    </p>
                  </div>
                </div>
              )}

              {!bloqueoActivo && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <p className="text-xs text-gray-500">
                    🟢 Sin restricción — la cocina ve todos los pedidos activos al mismo tiempo.
                  </p>
                </div>
              )}

              <button
                onClick={guardarConfiguracion}
                disabled={guardandoPermisos}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition-colors">
                {guardandoPermisos ? 'Guardando...' : '💾 Guardar configuración'}
              </button>
            </div>
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
                    {mesaDetalle.pedido.metodo_pago_cliente && (
                      <p className="text-xs font-bold mt-1">
                        💳 Pago: <span className="capitalize text-blue-700">{mesaDetalle.pedido.metodo_pago_cliente}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <h2 className="text-xl font-black text-gray-900">Mesa {mesaDetalle.mesa?.numero}</h2>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {mesaDetalle.pedido.mesera ? (
                        <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 text-xs font-bold px-2.5 py-1 rounded-full">
                          👩‍🍳 {mesaDetalle.pedido.mesera.nombre}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">📱 Pedido QR</span>
                      )}
                      <span className="text-xs text-gray-400">{new Date(mesaDetalle.pedido.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-0.5 block md:hidden">
                  {new Date(mesaDetalle.pedido.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!mesaDetalle.isDomi && (
                  <button
                    onClick={() => { setModoEdicionPedido(v => !v); setItemReemplazando(null) }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${modoEdicionPedido ? 'bg-orange-500 text-white' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}>
                    {modoEdicionPedido ? '✓ Listo' : '✏️ Editar'}
                  </button>
                )}
                <button onClick={() => { setMesaDetalle(null); setVistaModal('pago'); setModoEdicionPedido(false); setItemReemplazando(null) }} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"><X size={18} /></button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

              {/* ── Comprobante de transferencia (solo domi) ── */}
              {mesaDetalle.isDomi && mesaDetalle.pedido.comprobante_url && mesaDetalle.pagos.length === 0 && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 space-y-3">
                  <p className="text-sm font-black text-blue-800">📎 Comprobante de pago del cliente</p>
                  <a href={mesaDetalle.pedido.comprobante_url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={mesaDetalle.pedido.comprobante_url}
                      alt="Comprobante"
                      className="w-full rounded-xl object-cover max-h-64 border border-blue-200 hover:opacity-90 transition-opacity"
                    />
                  </a>
                  <p className="text-xs text-blue-600">Toca la imagen para verla en tamaño completo</p>
                  <button
                    onClick={confirmarPagoTransferencia}
                    disabled={agregandoPago}
                    className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                    <CheckCircle size={18} />
                    {agregandoPago ? 'Confirmando...' : `✅ Confirmar pago (${mesaDetalle.pedido.metodo_pago_cliente || 'transferencia'})`}
                  </button>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-gray-700 text-sm">Pedido</h3>
                  {modoEdicionPedido && (
                    <span className="text-xs text-orange-600 font-semibold bg-orange-50 px-2 py-0.5 rounded-full">
                      ✏️ Modo edición
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {mesaDetalle.pedido.items.map((item, i) => (
                    <div key={item.id || i} className={`text-sm rounded-xl transition-all ${modoEdicionPedido ? 'bg-orange-50 border border-orange-200 p-2.5' : ''}`}>
                      {modoEdicionPedido && item.id && (
                        <div className="flex gap-1.5 mb-2">
                          <button
                            onClick={() => cancelarItem(item.id!)}
                            disabled={guardandoEdicion}
                            className="flex items-center gap-1 text-xs bg-red-100 hover:bg-red-200 text-red-600 font-bold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50">
                            <X size={11} /> Cancelar
                          </button>
                          <button
                            onClick={() => { setItemReemplazando({ id: item.id!, nombre: item.nombre }); setCategoriaReemplazo('todas') }}
                            disabled={guardandoEdicion}
                            className="flex items-center gap-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-600 font-bold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50">
                            🔄 Reemplazar
                          </button>
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${item.estado === 'listo' || item.estado === 'entregado' ? 'bg-green-500' : item.estado === 'en_preparacion' ? 'bg-orange-400' : 'bg-gray-300'}`} />
                            <span>{item.cantidad}× {item.nombre}</span>
                            {item.notas && <span className="text-yellow-600 text-xs">({item.notas})</span>}
                          </div>
                          {item.pedido_por_nombre && (
                            <span className="ml-4 inline-flex items-center gap-1 text-xs text-blue-600 font-semibold mt-0.5">
                              ↳ agregado por {item.pedido_por_nombre}
                            </span>
                          )}
                        </div>
                        <span className="font-semibold shrink-0">${(item.cantidad * item.precio_unitario).toLocaleString('es-CO')}</span>
                      </div>
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

      {/* ══ MODAL NUEVO / EDITAR MENÚ DE TURNO ══════════════════════ */}
      {modalNuevoMenu && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-0 md:p-4">
          <div className="bg-white w-full md:max-w-lg md:rounded-3xl rounded-t-3xl max-h-[92vh] flex flex-col overflow-hidden fade-in">
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <div>
                <h2 className="text-lg font-black text-gray-900">
                  {modalNuevoMenu === 'editar' ? '✏️ Editar menú' : '📋 Nuevo menú de turno'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Define cantidades estándar por plato</p>
              </div>
              <button onClick={() => { setModalNuevoMenu(null); setEditandoMenuId(null); setMenuForm({ nombre: '', items: {} }) }}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {/* Nombre del menú */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Nombre del menú</label>
                <input
                  type="text"
                  placeholder="Ej: Entre semana, Fin de semana, Festivo..."
                  value={menuForm.nombre}
                  onChange={e => setMenuForm(prev => ({ ...prev, nombre: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              {/* Cantidades por plato */}
              {categorias.map(cat => {
                const platosCategoria = platos.filter(p => p.activo && p.categoria_id === cat.id)
                if (platosCategoria.length === 0) return null
                return (
                  <div key={cat.id}>
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{cat.nombre}</p>
                    <div className="space-y-2">
                      {platosCategoria.map(p => (
                        <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5 gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{p.nombre}</p>
                            <p className="text-xs text-gray-400">${p.precio.toLocaleString('es-CO')}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => setMenuForm(prev => ({ ...prev, items: { ...prev.items, [p.id]: Math.max(0, (prev.items[p.id] ?? 0) - 1) } }))}
                              className="w-7 h-7 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100">
                              <Minus size={12} />
                            </button>
                            <input
                              type="number" min="0"
                              value={menuForm.items[p.id] ?? 0}
                              onChange={e => setMenuForm(prev => ({ ...prev, items: { ...prev.items, [p.id]: parseInt(e.target.value) || 0 } }))}
                              className="w-14 border border-gray-200 rounded-xl px-2 py-1.5 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                            />
                            <button
                              onClick={() => setMenuForm(prev => ({ ...prev, items: { ...prev.items, [p.id]: (prev.items[p.id] ?? 0) + 1 } }))}
                              className="w-7 h-7 bg-orange-500 text-white rounded-full flex items-center justify-center hover:bg-orange-600">
                              <Plus size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              {platos.filter(p => p.activo).length === 0 && (
                <p className="text-center text-gray-400 text-sm py-8">Sin platos activos en la carta</p>
              )}
            </div>
            <div className="px-5 py-4 border-t shrink-0">
              <button onClick={guardarMenuTurno} disabled={guardandoMenu}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-bold py-3 rounded-2xl">
                {guardandoMenu ? 'Guardando...' : modalNuevoMenu === 'editar' ? '💾 Actualizar menú' : '💾 Guardar menú'}
              </button>
            </div>
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

                  {/* Selector de modo */}
                  <div className="flex gap-2">
                    <button onClick={() => { setModoInventario('manual'); setMenuSeleccionadoId(null) }}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${modoInventario === 'manual' ? 'bg-green-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      ✏️ Manual
                    </button>
                    <button onClick={() => setModoInventario('menu')}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${modoInventario === 'menu' ? 'bg-orange-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      <ClipboardList size={14} /> Desde menú
                    </button>
                  </div>

                  {/* Picker de menú guardado */}
                  {modoInventario === 'menu' && (
                    <div className="space-y-2">
                      {menusTurno.length === 0 ? (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-700 leading-relaxed">
                          No hay menús de turno creados aún. Ve a <strong>Carta → Menús de turno</strong> para crear uno.
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-gray-500 font-medium">Selecciona el menú para precargar cantidades:</p>
                          {menusTurno.map(menu => (
                            <button key={menu.id} onClick={() => aplicarMenuTurno(menu.id)}
                              className={`w-full text-left p-3 rounded-xl border-2 transition-all ${menuSeleccionadoId === menu.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white hover:border-orange-300'}`}>
                              <p className="font-bold text-gray-900">{menu.nombre}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {menu.items.filter(i => i.cantidad > 0).length} platos · {menu.items.reduce((a, i) => a + i.cantidad, 0)} unidades
                              </p>
                            </button>
                          ))}
                          {menuSeleccionadoId && (
                            <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs text-green-700">
                              ✅ Cantidades cargadas. Puedes ajustarlas abajo antes de abrir.
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {modoInventario === 'manual' && (
                    <p className="text-sm text-gray-500 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2.5">
                      ✏️ Escribe cuántas unidades hay de cada plato <strong>al abrir el turno</strong>. El sistema las descontará automáticamente con cada pedido.
                    </p>
                  )}

                  {/* Lista de platos — siempre visible para ajustar */}
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
                                value={inventarioTurno[p.id] ?? 0}
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
                  <button onClick={abrirTurno} disabled={abriendo}
                    className="w-full bg-green-500 hover:bg-green-600 disabled:bg-green-300 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all">
                    {abriendo ? (
                      <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Abriendo turno...</>
                    ) : '✓ Abrir turno'}
                  </button>
                  <button onClick={() => setPasoCaja('efectivo')} disabled={abriendo}
                    className="w-full text-gray-400 text-sm py-1 hover:text-gray-600 disabled:opacity-40">
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

        // Calcular esperado por método — redondeado al peso para evitar float errors
        const esperadoPorMetodo = METODOS.map(m => {
          const pago = pagosPorMetodo.find(p => p.metodo === m.id)
          let esperado = pago ? pago.monto + pago.propina : 0
          if (m.id === 'efectivo') esperado += turnoActivo.monto_inicial + totalIngresos - totalEgresos
          return { ...m, esperado: Math.round(esperado) }
        })

        // Sólo mostrar métodos con movimiento (o efectivo siempre)
        const metodosActivos = esperadoPorMetodo.filter(m => m.id === 'efectivo' || m.esperado > 0)

        // Resumen de descuadre total — redondear contado también
        let totalEsperado = 0, totalContado = 0, hayAlgunConteo = false
        metodosActivos.forEach(m => {
          totalEsperado += m.esperado
          const v = parseFloat(conteoFinal[m.id] || '')
          if (!isNaN(v)) { totalContado += Math.round(v); hayAlgunConteo = true }
        })
        const descuadreTotal = Math.round(totalContado - totalEsperado)

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
                  const diff = tieneValor && !isNaN(contado) ? Math.round(contado) - m.esperado : null

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
              <option value="mesera">Mesera</option><option value="cocina">Cocina</option><option value="gerente">Gerente</option><option value="domi">Domi</option>
            </select>
            <button onClick={crearUsuario} disabled={creandoUsuario} className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl">
              {creandoUsuario ? 'Creando...' : 'Crear usuario'}
            </button>
          </div>
        </div>
      )}

      {/* ══ MODAL QR DOMI ════════════════════════════════════════════ */}
      {modalQRDomi && (() => {
        const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/domi-pedido`
        const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}&bgcolor=ffffff&color=1a1a1a&margin=2`
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-6 w-full max-w-xs fade-in text-center space-y-4 shadow-2xl">
              <div className="flex justify-between items-center">
                <div className="text-left">
                  <p className="font-black text-gray-900 text-lg">🛵 QR Domicilios</p>
                  <p className="text-xs text-gray-400">Para que los clientes pidan en línea</p>
                </div>
                <button onClick={() => setModalQRDomi(false)}><X size={20} className="text-gray-400" /></button>
              </div>

              <div className="bg-blue-50 rounded-2xl p-4">
                <img src={qrSrc} alt="QR Domi" className="mx-auto rounded-xl" width={210} height={210} />
              </div>

              <div className="bg-gray-50 rounded-xl px-3 py-2 text-left space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">URL del pedido</p>
                <p className="text-xs text-gray-700 break-all font-mono">{url}</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs text-blue-700 text-left leading-relaxed">
                💡 <strong>Sesiones independientes:</strong> cada cliente que escanee el mismo QR tendrá su propio pedido separado — no se mezclan.
              </div>

              <button
                onClick={() => {
                  const a = document.createElement('a')
                  a.href = qrSrc
                  a.download = 'QR-Domi-Pedido.png'
                  a.click()
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm transition-colors"
              >
                ⬇️ Descargar QR
              </button>
            </div>
          </div>
        )
      })()}

      {/* ══ MODAL CONFIGURACIÓN ⚙️ ══════════════════════════════════ */}
      {modalSettings && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-0">
          <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[92vh] flex flex-col overflow-hidden fade-in">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <div className="flex items-center gap-2">
                <Settings size={20} className="text-gray-700" />
                <h2 className="text-lg font-black text-gray-900">Configuración</h2>
              </div>
              <button onClick={() => setModalSettings(false)} className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center"><X size={18} /></button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-4 py-2 border-b shrink-0 overflow-x-auto">
              {([
                ['cuenta',      '👤 Cuenta'],
                ['usuarios',    '👥 Usuarios'],
                ['permisos',    '🔒 Permisos'],
                ['restablecer', '⚠️ Restablecer'],
              ] as ['cuenta'|'usuarios'|'permisos'|'restablecer', string][]).map(([id, label]) => (
                <button key={id} onClick={() => setSeccionSettings(id)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    seccionSettings === id
                      ? id === 'restablecer' ? 'bg-red-500 text-white' : 'bg-purple-600 text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4">

              {/* ── CUENTA ── */}
              {seccionSettings === 'cuenta' && (
                <div className="space-y-4">
                  <div className="bg-purple-50 rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-14 h-14 bg-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-black">G</div>
                    <div>
                      <p className="font-black text-gray-900">Gerencia</p>
                      <p className="text-xs text-gray-400">Administrador del sistema</p>
                    </div>
                  </div>
                  <button onClick={cerrarSesion}
                    className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 border-2 border-red-200 text-red-600 font-bold py-3.5 rounded-2xl transition-colors">
                    <LogOut size={18} /> Cerrar sesión
                  </button>
                </div>
              )}

              {/* ── USUARIOS ── */}
              {seccionSettings === 'usuarios' && (
                <div className="space-y-4">
                  <button onClick={() => setModalUsuario(true)}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-colors">
                    <Plus size={18} /> Crear nuevo usuario
                  </button>
                  {listaUsuarios.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
                      <p className="text-gray-400 text-sm">No hay usuarios registrados.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                      {listaUsuarios.map((u, i) => {
                        const ROL_BADGE: Record<string, string> = {
                          gerente: 'bg-purple-100 text-purple-700',
                          mesera:  'bg-orange-100 text-orange-700',
                          cocina:  'bg-green-100 text-green-700',
                          domi:    'bg-blue-100 text-blue-700',
                        }
                        const ROL_LABEL: Record<string, string> = {
                          gerente: 'Gerente', mesera: 'Mesera', cocina: 'Cocina', domi: 'Domi',
                        }
                        return (
                          <div key={u.id} className={`flex items-center justify-between px-4 py-3.5 ${i !== 0 ? 'border-t border-gray-50' : ''} ${!u.activo ? 'opacity-50' : ''}`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${u.activo ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-400'}`}>
                                {u.nombre.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 text-sm">{u.nombre}</p>
                                {!u.activo && <p className="text-xs text-red-500 font-medium">Inhabilitado</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ROL_BADGE[u.rol] || 'bg-gray-100 text-gray-600'}`}>
                                {ROL_LABEL[u.rol] || u.rol}
                              </span>
                              <button onClick={() => setEditandoUsuario({ id: u.id, nombre: u.nombre, rol: u.rol, activo: u.activo ?? true, nuevaPassword: '' })}
                                className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center">
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

              {/* ── PERMISOS ── */}
              {seccionSettings === 'permisos' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                        <Lock size={20} className="text-purple-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900">Control de flujo — Cocina</h3>
                        <p className="text-xs text-gray-400">Regula cuántos pedidos ve la cocina a la vez</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800 text-sm">Bloqueo de comandas</p>
                        <p className="text-xs text-gray-400 mt-0.5">La cocina solo verá un lote de pedidos a la vez</p>
                      </div>
                      <button onClick={() => setBloqueoActivo(v => !v)}
                        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${bloqueoActivo ? 'bg-purple-600' : 'bg-gray-300'}`}>
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${bloqueoActivo ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    {bloqueoActivo && (
                      <div>
                        <p className="font-semibold text-gray-800 text-sm mb-3">Comandas por lote</p>
                        <div className="flex gap-2">
                          {[2, 3, 4, 5].map(n => (
                            <button key={n} onClick={() => setBloqueoCantidad(n)}
                              className={`flex-1 py-3 rounded-xl font-black text-lg transition-all border-2 ${bloqueoCantidad === n ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-200 hover:border-purple-400'}`}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <button onClick={guardarConfiguracion} disabled={guardandoPermisos}
                      className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition-colors">
                      {guardandoPermisos ? 'Guardando...' : '💾 Guardar configuración'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── RESTABLECER NEGOCIO ── */}
              {seccionSettings === 'restablecer' && (
                <div className="space-y-4">
                  {pasoRestablecer === 'opciones' ? (
                    <>
                      <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-start gap-3">
                        <ShieldAlert size={20} className="text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700 leading-relaxed">
                          <strong>Acción irreversible.</strong> Los datos eliminados no se pueden recuperar. Úsalo con precaución.
                        </p>
                      </div>

                      {/* Alcance */}
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">¿Qué período eliminar?</p>
                        <div className="flex gap-2">
                          <button onClick={() => setRestablecerScope('todo')}
                            className={`flex-1 py-3 rounded-xl text-sm font-bold border-2 transition-all ${restablecerScope === 'todo' ? 'bg-red-500 text-white border-red-500' : 'border-gray-200 text-gray-600 hover:border-red-300'}`}>
                            Todo el historial
                          </button>
                          <button onClick={() => setRestablecerScope('desde_fecha')}
                            className={`flex-1 py-3 rounded-xl text-sm font-bold border-2 transition-all ${restablecerScope === 'desde_fecha' ? 'bg-red-500 text-white border-red-500' : 'border-gray-200 text-gray-600 hover:border-red-300'}`}>
                            Desde una fecha
                          </button>
                        </div>
                        {restablecerScope === 'desde_fecha' && (
                          <input type="date" value={restablecerFecha} onChange={e => setRestablecerFecha(e.target.value)}
                            className="w-full mt-2 border-2 border-red-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
                        )}
                      </div>

                      {/* Checklist */}
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">¿Qué datos eliminar?</p>
                        <div className="space-y-2">
                          {([
                            ['pedidos',   '📋 Pedidos y pagos', 'Historial de pedidos, ítems y cobros del período'],
                            ['turnos',    '🔄 Turnos y caja',   'Historial de turnos, movimientos e inventario de turno'],
                            ['clientes',  '👥 Clientes',        'Base de datos de clientes registrados (sin filtro de fecha)'],
                            ['inventario','📦 Inventario',      'Reinicia todas las cantidades disponibles a 0'],
                          ] as [keyof typeof restablecerItems, string, string][]).map(([key, label, desc]) => (
                            <label key={key} className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${restablecerItems[key] ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200 hover:border-red-200'}`}>
                              <input type="checkbox" checked={restablecerItems[key]}
                                onChange={e => setRestablecerItems(prev => ({ ...prev, [key]: e.target.checked }))}
                                className="mt-0.5 w-4 h-4 accent-red-500" />
                              <div>
                                <p className="font-bold text-sm text-gray-900">{label}</p>
                                <p className="text-xs text-gray-400">{desc}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const alguno = Object.values(restablecerItems).some(Boolean)
                          if (!alguno) { toast.error('Selecciona al menos un tipo de datos'); return }
                          if (restablecerScope === 'desde_fecha' && !restablecerFecha) { toast.error('Selecciona una fecha'); return }
                          setPasoRestablecer('confirmar')
                        }}
                        className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-colors">
                        <AlertTriangle size={18} /> Continuar
                      </button>
                    </>
                  ) : (
                    /* Paso de confirmación */
                    <div className="space-y-4">
                      <div className="bg-red-100 border-2 border-red-400 rounded-2xl p-4 text-center space-y-2">
                        <AlertTriangle size={32} className="text-red-500 mx-auto" />
                        <p className="font-black text-red-700 text-lg">¿Estás completamente seguro?</p>
                        <p className="text-sm text-red-600">
                          Se eliminarán permanentemente:
                        </p>
                        <div className="flex flex-wrap gap-1 justify-center mt-1">
                          {restablecerItems.pedidos   && <span className="text-xs bg-red-200 text-red-700 px-2 py-0.5 rounded-full font-bold">Pedidos y pagos</span>}
                          {restablecerItems.turnos    && <span className="text-xs bg-red-200 text-red-700 px-2 py-0.5 rounded-full font-bold">Turnos y caja</span>}
                          {restablecerItems.clientes  && <span className="text-xs bg-red-200 text-red-700 px-2 py-0.5 rounded-full font-bold">Clientes</span>}
                          {restablecerItems.inventario && <span className="text-xs bg-red-200 text-red-700 px-2 py-0.5 rounded-full font-bold">Inventario (reset a 0)</span>}
                        </div>
                        {restablecerScope === 'desde_fecha' && restablecerFecha && (
                          <p className="text-xs text-red-500 mt-1">Desde: <strong>{new Date(restablecerFecha + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></p>
                        )}
                        {restablecerScope === 'todo' && (
                          <p className="text-xs text-red-500 mt-1"><strong>Todo el historial</strong></p>
                        )}
                      </div>

                      <div>
                        <label className="text-xs font-bold text-gray-600 block mb-1.5">Escribe <strong className="text-red-600">BORRAR</strong> para confirmar:</label>
                        <input type="text" value={restablecerConfirm} onChange={e => setRestablecerConfirm(e.target.value)}
                          placeholder="BORRAR"
                          className="w-full border-2 border-red-300 rounded-xl px-4 py-3 font-bold text-center text-lg focus:outline-none focus:border-red-500 tracking-widest" />
                      </div>

                      <button onClick={ejecutarRestablecer} disabled={restableciendo || restablecerConfirm !== 'BORRAR'}
                        className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors">
                        {restableciendo
                          ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Restableciendo...</>
                          : <><RotateCcw size={18} /> Sí, restablecer definitivamente</>}
                      </button>

                      <button onClick={() => { setPasoRestablecer('opciones'); setRestablecerConfirm('') }}
                        disabled={restableciendo}
                        className="w-full text-gray-500 text-sm py-2 hover:text-gray-700">
                        ← Volver
                      </button>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: REEMPLAZAR PLATO ═══════════════════════════════════ */}
      {itemReemplazando && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-end justify-center">
          <div className="bg-white w-full max-h-[85vh] rounded-t-3xl flex flex-col overflow-hidden fade-in">
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <div>
                <h3 className="font-bold text-gray-900">Reemplazar plato</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  <span className="text-orange-600 font-semibold">"{itemReemplazando.nombre}"</span> → ¿por cuál lo cambiamos?
                </p>
              </div>
              <button onClick={() => setItemReemplazando(null)} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            {/* Filtro por categoría */}
            <div className="flex gap-2 px-4 py-2 overflow-x-auto border-b shrink-0">
              <button onClick={() => setCategoriaReemplazo('todas')}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${categoriaReemplazo === 'todas' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                Todas
              </button>
              {categorias.map(c => (
                <button key={c.id} onClick={() => setCategoriaReemplazo(c.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${categoriaReemplazo === c.id ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {c.nombre}
                </button>
              ))}
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {platos
                .filter(p => p.activo && (categoriaReemplazo === 'todas' || p.categoria_id === categoriaReemplazo))
                .map(p => (
                  <button key={p.id}
                    onClick={() => reemplazarItem(itemReemplazando.id, p.id)}
                    disabled={guardandoEdicion}
                    className="w-full text-left bg-white border border-gray-200 hover:border-purple-400 hover:bg-purple-50 rounded-2xl px-4 py-3 transition-all disabled:opacity-50">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{p.nombre}</p>
                        {p.descripcion && <p className="text-xs text-gray-400 truncate mt-0.5">{p.descripcion}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">{categorias.find(c => c.id === p.categoria_id)?.nombre}</p>
                      </div>
                      <span className="font-black text-purple-700 shrink-0">${p.precio.toLocaleString('es-CO')}</span>
                    </div>
                  </button>
                ))}
              {platos.filter(p => p.activo).length === 0 && (
                <p className="text-center text-gray-400 text-sm py-8">Sin platos activos en la carta</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: TOMAR PEDIDO DESDE GERENCIA ═══════════════════════ */}
      {modalNuevoPedido && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-h-[95vh] rounded-t-3xl flex flex-col overflow-hidden fade-in">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <div>
                <h2 className="text-lg font-black text-gray-900">Tomar pedido</h2>
                <p className="text-xs text-gray-400">Gerencia</p>
              </div>
              <button onClick={() => { setModalNuevoPedido(false); setNuevoOrdenCarrito({}); setNuevoOrdenMesaId(null) }}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"><X size={18} /></button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {/* Tipo */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Tipo de pedido</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setNuevoOrdenTipo('mesa')}
                    className={`py-3 rounded-2xl font-bold text-sm border-2 transition-all flex items-center justify-center gap-2 ${nuevoOrdenTipo === 'mesa' ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600 hover:border-purple-300'}`}>
                    🍽️ Mesa
                  </button>
                  <button onClick={() => setNuevoOrdenTipo('domi')}
                    className={`py-3 rounded-2xl font-bold text-sm border-2 transition-all flex items-center justify-center gap-2 ${nuevoOrdenTipo === 'domi' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                    🛵 Domicilio
                  </button>
                </div>
              </div>

              {/* Selector de mesa */}
              {nuevoOrdenTipo === 'mesa' && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Selecciona la mesa</p>
                  {zonasLista.map(zona => (
                    <div key={zona} className="mb-3">
                      <p className="text-xs text-gray-400 font-semibold mb-1.5">{zona}</p>
                      <div className="grid grid-cols-4 gap-2">
                        {mesas.filter(m => (m.zona || 'Sin zona') === zona).sort((a,b) => a.numero - b.numero).map(m => (
                          <button key={m.id} onClick={() => setNuevoOrdenMesaId(m.id)}
                            className={`py-3 rounded-xl font-black text-sm border-2 transition-all ${
                              nuevoOrdenMesaId === m.id
                                ? 'bg-purple-600 text-white border-purple-600'
                                : m.estado === 'libre'
                                  ? 'bg-white border-gray-200 text-gray-600 hover:border-purple-300'
                                  : 'bg-orange-50 border-orange-400 text-orange-700'
                            }`}>
                            {m.numero}
                            {m.estado !== 'libre' && <span className="block text-[9px] font-normal">ocupada</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {mesas.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No hay mesas configuradas</p>
                  )}
                </div>
              )}

              {/* Datos del domicilio */}
              {nuevoOrdenTipo === 'domi' && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Datos del domicilio</p>
                  <input type="text" placeholder="Nombre del cliente" value={nuevoOrdenDomi.nombre}
                    onChange={e => setNuevoOrdenDomi(p => ({ ...p, nombre: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <input type="tel" placeholder="Teléfono" value={nuevoOrdenDomi.telefono}
                    onChange={e => setNuevoOrdenDomi(p => ({ ...p, telefono: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <input type="text" placeholder="Dirección" value={nuevoOrdenDomi.direccion}
                    onChange={e => setNuevoOrdenDomi(p => ({ ...p, direccion: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              )}

              {/* Menú */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Platos</p>
                <div className="flex gap-2 overflow-x-auto mb-3 pb-1">
                  <button onClick={() => setNuevoOrdenCategoria('todas')}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${nuevoOrdenCategoria === 'todas' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    Todas
                  </button>
                  {categorias.map(c => (
                    <button key={c.id} onClick={() => setNuevoOrdenCategoria(c.id)}
                      className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${nuevoOrdenCategoria === c.id ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {c.nombre}
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  {platos.filter(p => p.activo && (nuevoOrdenCategoria === 'todas' || p.categoria_id === nuevoOrdenCategoria)).map(p => (
                    <div key={p.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-2xl px-4 py-2.5 gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{p.nombre}</p>
                        <p className="text-xs font-bold text-purple-700">${p.precio.toLocaleString('es-CO')}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setNuevoOrdenCarrito(prev => ({ ...prev, [p.id]: Math.max(0, (prev[p.id] ?? 0) - 1) }))}
                          className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center">
                          <Minus size={12} />
                        </button>
                        <span className="w-6 text-center font-black text-gray-900 text-sm">{nuevoOrdenCarrito[p.id] ?? 0}</span>
                        <button
                          onClick={() => setNuevoOrdenCarrito(prev => ({ ...prev, [p.id]: (prev[p.id] ?? 0) + 1 }))}
                          className="w-7 h-7 bg-purple-600 hover:bg-purple-700 text-white rounded-full flex items-center justify-center">
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {platos.filter(p => p.activo).length === 0 && (
                    <p className="text-center text-gray-400 text-sm py-6">Sin platos activos en la carta</p>
                  )}
                </div>
              </div>

              {/* Notas */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Notas (opcional)</p>
                <textarea value={nuevoOrdenNotas} onChange={e => setNuevoOrdenNotas(e.target.value)}
                  placeholder="Sin sal, alérgico a..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none" />
              </div>
            </div>

            {/* Footer: resumen + botón enviar */}
            <div className="border-t px-5 py-4 shrink-0 bg-white space-y-3">
              {Object.values(nuevoOrdenCarrito).some(v => v > 0) && (
                <div className="flex justify-between items-center text-sm bg-gray-50 rounded-xl px-4 py-2.5">
                  <span className="text-gray-500 font-medium">
                    {Object.values(nuevoOrdenCarrito).reduce((a, v) => a + v, 0)} platos
                    {nuevoOrdenTipo === 'mesa' && nuevoOrdenMesaId && (
                      <span className="ml-1">· Mesa {mesas.find(m => m.id === nuevoOrdenMesaId)?.numero}</span>
                    )}
                  </span>
                  <span className="font-black text-gray-900">
                    ${Object.entries(nuevoOrdenCarrito).reduce((a, [id, qty]) => {
                      const p = platos.find(pl => pl.id === id)
                      return a + (p?.precio ?? 0) * qty
                    }, 0).toLocaleString('es-CO')}
                  </span>
                </div>
              )}
              <button
                onClick={tomarPedidoGerencia}
                disabled={tomandoPedido || !Object.values(nuevoOrdenCarrito).some(v => v > 0)}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all">
                {tomandoPedido
                  ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando a cocina...</>
                  : <><ChefHat size={18} /> Enviar a cocina</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal editar usuario ── */}
      {editandoUsuario && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm fade-in space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">Editar usuario</h3>
              <button onClick={() => setEditandoUsuario(null)}><X size={20} /></button>
            </div>

            {/* Nombre */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Nombre</label>
              <input
                type="text"
                value={editandoUsuario.nombre}
                onChange={e => setEditandoUsuario(p => p ? { ...p, nombre: e.target.value } : p)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>

            {/* Rol */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Rol / Panel que verá</label>
              <select
                value={editandoUsuario.rol}
                onChange={e => setEditandoUsuario(p => p ? { ...p, rol: e.target.value } : p)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                <option value="mesera">👩 Mesera — ve el panel de mesas y pedidos</option>
                <option value="cocina">👨‍🍳 Cocina — ve el panel de preparación</option>
                <option value="gerente">👔 Gerente — ve el panel completo</option>
                <option value="domi">🛵 Domi — ve el panel de domicilios</option>
              </select>
              <p className="text-xs text-gray-400 mt-1.5">⚠️ El cambio aplica la próxima vez que el usuario inicie sesión.</p>
            </div>

            {/* Nueva contraseña */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Nueva contraseña <span className="text-gray-400 font-normal">(dejar vacío para no cambiar)</span></label>
              <input
                type="password"
                value={editandoUsuario.nuevaPassword}
                onChange={e => setEditandoUsuario(p => p ? { ...p, nuevaPassword: e.target.value } : p)}
                placeholder="••••••••"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>

            {/* Guardar nombre/rol/contraseña */}
            <button
              onClick={guardarCambiosUsuario}
              disabled={guardandoUsuario || !editandoUsuario.nombre.trim()}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition-colors">
              {guardandoUsuario ? 'Guardando...' : '💾 Guardar cambios'}
            </button>

            <div className="border-t pt-4 space-y-3">
              {/* Inhabilitar / Habilitar */}
              <button
                onClick={() => toggleActivoUsuario(editandoUsuario.id, editandoUsuario.activo)}
                className={`w-full font-bold py-3 rounded-xl transition-colors border-2 ${
                  editandoUsuario.activo
                    ? 'border-orange-400 text-orange-600 hover:bg-orange-50'
                    : 'border-green-500 text-green-600 hover:bg-green-50'
                }`}>
                {editandoUsuario.activo ? '🔒 Inhabilitar acceso' : '✅ Habilitar acceso'}
              </button>

              {/* Eliminar */}
              <button
                onClick={() => eliminarUsuario(editandoUsuario.id, editandoUsuario.nombre)}
                disabled={eliminandoUsuario}
                className="w-full bg-red-50 hover:bg-red-100 disabled:bg-gray-100 border-2 border-red-300 text-red-600 font-bold py-3 rounded-xl transition-colors">
                {eliminandoUsuario ? 'Eliminando...' : '🗑️ Eliminar usuario definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
