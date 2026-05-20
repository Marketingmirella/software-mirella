// ─── USUARIOS Y ROLES ────────────────────────────────────────────────────────
export type Rol = 'gerente' | 'mesera' | 'cocina'

export interface Usuario {
  id: string
  nombre: string
  rol: Rol
  activo: boolean
  created_at: string
}

// ─── CLIENTES ────────────────────────────────────────────────────────────────
export interface Cliente {
  id: string
  cedula: string
  nombre: string
  telefono: string
  fecha_nacimiento: string | null
  created_at: string
}

// ─── MESAS ───────────────────────────────────────────────────────────────────
export type EstadoMesa = 'libre' | 'ocupada' | 'esperando_pago'

export interface Mesa {
  id: number
  numero: number
  capacidad: number
  estado: EstadoMesa
  zona: string | null
}

// ─── MENÚ ────────────────────────────────────────────────────────────────────
export interface Categoria {
  id: number
  nombre: string
  orden: number
}

export interface Plato {
  id: string
  nombre: string
  descripcion: string | null
  precio: number
  costo: number | null
  categoria_id: number
  imagen_url: string | null
  activo: boolean
  categoria?: Categoria
}

// ─── INVENTARIO ───────────────────────────────────────────────────────────────
export interface Inventario {
  id: string
  plato_id: string
  cantidad_disponible: number
  alerta_minima: number
  updated_at: string
  plato?: Plato
}

// ─── PEDIDOS ─────────────────────────────────────────────────────────────────
export type EstadoPedido = 'pendiente' | 'en_preparacion' | 'listo' | 'entregado' | 'pagado' | 'cancelado'
export type TipoPedido = 'mesera' | 'cliente_qr' | 'domi'
export type EstadoItem = 'pendiente' | 'en_preparacion' | 'listo' | 'entregado'

export interface ItemPedido {
  id: string
  pedido_id: string
  plato_id: string
  cantidad: number
  precio_unitario: number
  notas: string | null
  estado: EstadoItem
  created_at: string
  tiempo_inicio_prep: string | null
  tiempo_listo: string | null
  plato?: Plato
}

export interface Pedido {
  id: string
  mesa_id: number
  cliente_id: string | null
  mesera_id: string | null
  turno_id: string
  estado: EstadoPedido
  tipo: TipoPedido
  notas: string | null
  created_at: string
  updated_at: string
  mesa?: Mesa
  cliente?: Cliente
  mesera?: Usuario
  items?: ItemPedido[]
}

// ─── TURNOS ───────────────────────────────────────────────────────────────────
export interface Turno {
  id: string
  abierto_por: string
  monto_inicial: number
  abierto_en: string
  cerrado_en: string | null
  monto_final: number | null
  usuario?: Usuario
}

// ─── PAGOS ────────────────────────────────────────────────────────────────────
export type MetodoPago = 'efectivo' | 'nequi' | 'daviplata' | 'bancolombia'

export interface Pago {
  id: string
  pedido_id: string
  metodo: MetodoPago
  monto: number
  propina: number
  created_at: string
}
