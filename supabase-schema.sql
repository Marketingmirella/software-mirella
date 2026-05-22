-- ============================================================
-- SCHEMA COMPLETO - SOFTWARE RESTAURANTE
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

-- ─── EXTENSIONES ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USUARIOS (meseras, cocina, gerente) ─────────────────────
CREATE TABLE usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('gerente', 'mesera', 'cocina')),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CLIENTES ────────────────────────────────────────────────
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cedula TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  fecha_nacimiento DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── MESAS ───────────────────────────────────────────────────
CREATE TABLE mesas (
  id SERIAL PRIMARY KEY,
  numero INT UNIQUE NOT NULL,
  capacidad INT NOT NULL DEFAULT 4,
  estado TEXT NOT NULL DEFAULT 'libre' CHECK (estado IN ('libre', 'ocupada', 'esperando_pago')),
  zona TEXT
);

-- ─── CATEGORÍAS DE PLATOS ────────────────────────────────────
CREATE TABLE categorias (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  orden INT DEFAULT 0
);

-- ─── PLATOS ──────────────────────────────────────────────────
CREATE TABLE platos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio DECIMAL(10,2) NOT NULL,
  costo DECIMAL(10,2),
  categoria_id INT REFERENCES categorias(id),
  imagen_url TEXT,
  activo BOOLEAN DEFAULT true
);

-- ─── INVENTARIO ──────────────────────────────────────────────
CREATE TABLE inventario (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plato_id UUID UNIQUE REFERENCES platos(id) ON DELETE CASCADE,
  cantidad_disponible INT NOT NULL DEFAULT 0,
  alerta_minima INT NOT NULL DEFAULT 3,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TURNOS (apertura y cierre de caja) ──────────────────────
CREATE TABLE turnos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  abierto_por UUID REFERENCES usuarios(id),
  monto_inicial DECIMAL(10,2) NOT NULL DEFAULT 0,
  abierto_en TIMESTAMPTZ DEFAULT NOW(),
  cerrado_en TIMESTAMPTZ,
  monto_final DECIMAL(10,2)
);

-- ─── PEDIDOS ─────────────────────────────────────────────────
CREATE TABLE pedidos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mesa_id INT REFERENCES mesas(id),
  cliente_id UUID REFERENCES clientes(id),
  mesera_id UUID REFERENCES usuarios(id),
  turno_id UUID REFERENCES turnos(id),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_preparacion', 'listo', 'entregado', 'pagado', 'cancelado')),
  tipo TEXT NOT NULL DEFAULT 'mesera' CHECK (tipo IN ('mesera', 'cliente_qr')),
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ITEMS DE PEDIDO ─────────────────────────────────────────
CREATE TABLE items_pedido (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE,
  plato_id UUID REFERENCES platos(id),
  cantidad INT NOT NULL DEFAULT 1,
  precio_unitario DECIMAL(10,2) NOT NULL,
  notas TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_preparacion', 'listo', 'entregado')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tiempo_inicio_prep TIMESTAMPTZ,
  tiempo_listo TIMESTAMPTZ
);

-- ─── PAGOS ───────────────────────────────────────────────────
CREATE TABLE pagos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id UUID REFERENCES pedidos(id),
  metodo TEXT NOT NULL CHECK (metodo IN ('efectivo', 'tarjeta', 'transferencia')),
  monto DECIMAL(10,2) NOT NULL,
  propina DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── FUNCIÓN: actualizar updated_at automáticamente ──────────
CREATE OR REPLACE FUNCTION actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_pedidos_updated_at
  BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

-- ─── FUNCIÓN: descontar inventario al crear pedido ───────────
CREATE OR REPLACE FUNCTION descontar_inventario()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE inventario
  SET cantidad_disponible = cantidad_disponible - NEW.cantidad,
      updated_at = NOW()
  WHERE plato_id = NEW.plato_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_descontar_inventario
  AFTER INSERT ON items_pedido
  FOR EACH ROW EXECUTE FUNCTION descontar_inventario();

-- ─── FUNCIÓN: restaurar inventario si se cancela pedido ──────
CREATE OR REPLACE FUNCTION restaurar_inventario_cancelado()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'cancelado' AND OLD.estado != 'cancelado' THEN
    UPDATE inventario i
    SET cantidad_disponible = cantidad_disponible + ip.cantidad,
        updated_at = NOW()
    FROM items_pedido ip
    WHERE ip.pedido_id = NEW.id AND ip.plato_id = i.plato_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_restaurar_inventario
  AFTER UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION restaurar_inventario_cancelado();

-- ─── TIEMPO REAL: habilitar tablas para escuchar cambios ─────
ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE items_pedido;
ALTER PUBLICATION supabase_realtime ADD TABLE inventario;
ALTER PUBLICATION supabase_realtime ADD TABLE mesas;

-- ─── DATOS INICIALES: mesas de ejemplo ───────────────────────
INSERT INTO mesas (numero, capacidad, zona) VALUES
  (1, 4, 'Salón principal'),
  (2, 4, 'Salón principal'),
  (3, 4, 'Salón principal'),
  (4, 2, 'Salón principal'),
  (5, 6, 'Terraza'),
  (6, 4, 'Terraza'),
  (7, 2, 'Barra'),
  (8, 2, 'Barra');

-- ─── DATOS INICIALES: categorías de ejemplo ──────────────────
INSERT INTO categorias (nombre, orden) VALUES
  ('Sopas y Caldos', 1),
  ('Platos Fuertes', 2),
  ('Entradas', 3),
  ('Bebidas', 4),
  ('Postres', 5);

-- ─── CONFIGURACIÓN DEL SISTEMA ───────────────────────────────
-- Ejecutar este bloque si ya tienes el schema anterior desplegado
CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO configuracion (clave, valor) VALUES
  ('bloqueo_cocina_activo',   'false'),
  ('bloqueo_cocina_cantidad', '3')
ON CONFLICT (clave) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE configuracion;

-- ─── MIGRACIÓN: ROL DOMI + COLUMNAS PEDIDOS ──────────────────
-- Ejecutar en Supabase > SQL Editor si ya tienes el schema anterior

-- 1. Agregar rol 'domi' a la tabla usuarios
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('gerente', 'mesera', 'cocina', 'domi'));

-- 2. Nuevas columnas en pedidos
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS comprobante_url      TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS metodo_pago_cliente  TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS domi_tomado_en       TIMESTAMPTZ;

-- 3. Crear bucket de Storage para comprobantes (ejecutar también en Storage > New bucket)
-- Nombre: comprobantes | Public: true
-- O ejecutar: INSERT INTO storage.buckets (id, name, public) VALUES ('comprobantes', 'comprobantes', true) ON CONFLICT DO NOTHING;
