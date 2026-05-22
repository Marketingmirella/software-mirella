-- ============================================================
-- SCHEMA MULTI-TENANT SAAS - RESTAURANTES
-- Ejecutar en el nuevo Supabase (restaurantes-saas)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── NEGOCIOS (cada restaurante es un tenant) ─────────────────
CREATE TABLE negocios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL DEFAULT 'Mi Restaurante',
  plan TEXT NOT NULL DEFAULT 'basico' CHECK (plan IN ('basico', 'pro')),
  suscripcion_activa BOOLEAN DEFAULT TRUE,
  suscripcion_hasta TIMESTAMPTZ,
  mp_subscription_id TEXT,
  logo_url TEXT,
  onboarding_completo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── USUARIOS ─────────────────────────────────────────────────
CREATE TABLE usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('gerente', 'mesera', 'cocina', 'domi')),
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── MESAS ────────────────────────────────────────────────────
CREATE TABLE mesas (
  id SERIAL PRIMARY KEY,
  negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE,
  numero INT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'libre' CHECK (estado IN ('libre', 'ocupada', 'esperando_pago')),
  zona TEXT,
  UNIQUE(negocio_id, numero)
);

-- ─── CATEGORÍAS ───────────────────────────────────────────────
CREATE TABLE categorias (
  id SERIAL PRIMARY KEY,
  negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  orden INT DEFAULT 0
);

-- ─── PLATOS ───────────────────────────────────────────────────
CREATE TABLE platos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio DECIMAL(10,2) NOT NULL,
  costo DECIMAL(10,2),
  categoria_id INT REFERENCES categorias(id),
  imagen_url TEXT,
  activo BOOLEAN DEFAULT TRUE
);

-- ─── INVENTARIO ───────────────────────────────────────────────
CREATE TABLE inventario (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plato_id UUID UNIQUE REFERENCES platos(id) ON DELETE CASCADE,
  cantidad_disponible INT NOT NULL DEFAULT 0,
  alerta_minima INT NOT NULL DEFAULT 3,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CLIENTES ─────────────────────────────────────────────────
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE,
  cedula TEXT,
  nombre TEXT NOT NULL,
  telefono TEXT,
  fecha_cumpleanos DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(negocio_id, cedula)
);

-- ─── TURNOS ───────────────────────────────────────────────────
CREATE TABLE turnos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE,
  abierto_por UUID REFERENCES usuarios(id),
  monto_inicial DECIMAL(10,2) NOT NULL DEFAULT 0,
  abierto_en TIMESTAMPTZ DEFAULT NOW(),
  cerrado_en TIMESTAMPTZ,
  monto_final DECIMAL(10,2)
);

-- ─── PEDIDOS ──────────────────────────────────────────────────
CREATE TABLE pedidos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE,
  mesa_id INT REFERENCES mesas(id),
  cliente_id UUID REFERENCES clientes(id),
  mesera_id UUID REFERENCES usuarios(id),
  turno_id UUID REFERENCES turnos(id),
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','en_preparacion','listo','entregado','esperando_pago','pagado','cancelado')),
  tipo TEXT NOT NULL DEFAULT 'mesera'
    CHECK (tipo IN ('mesera','cliente_qr','domi')),
  notas TEXT,
  cliente_nombre TEXT,
  cliente_telefono TEXT,
  cliente_cedula TEXT,
  cliente_direccion TEXT,
  comprobante_url TEXT,
  metodo_pago_cliente TEXT,
  pagado_en TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ITEMS PEDIDO ─────────────────────────────────────────────
CREATE TABLE items_pedido (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE,
  plato_id UUID REFERENCES platos(id),
  pedido_por UUID REFERENCES usuarios(id),
  cantidad INT NOT NULL DEFAULT 1,
  precio_unitario DECIMAL(10,2) NOT NULL,
  notas TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','en_preparacion','listo','entregado')),
  cocinero TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tiempo_inicio_prep TIMESTAMPTZ,
  tiempo_listo TIMESTAMPTZ
);

-- ─── PAGOS ────────────────────────────────────────────────────
CREATE TABLE pagos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id UUID REFERENCES pedidos(id),
  metodo TEXT NOT NULL CHECK (metodo IN ('efectivo','nequi','daviplata','bancolombia','tarjeta','transferencia')),
  monto DECIMAL(10,2) NOT NULL,
  propina DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── MOVIMIENTOS CAJA ─────────────────────────────────────────
CREATE TABLE movimientos_caja (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  turno_id UUID REFERENCES turnos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso','egreso')),
  monto DECIMAL(10,2) NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TURNOS INVENTARIO ────────────────────────────────────────
CREATE TABLE turnos_inventario (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  turno_id UUID REFERENCES turnos(id) ON DELETE CASCADE,
  plato_id UUID REFERENCES platos(id),
  cantidad_inicial INT NOT NULL DEFAULT 0
);

-- ─── CONFIGURACIÓN ────────────────────────────────────────────
CREATE TABLE configuracion (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE,
  clave TEXT NOT NULL,
  valor TEXT NOT NULL,
  UNIQUE(negocio_id, clave)
);

-- ─── MENÚS DE TURNO ───────────────────────────────────────────
CREATE TABLE menus_turno (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TRIGGER updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_pedidos_updated_at
  BEFORE UPDATE ON pedidos FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

-- ─── TRIGGER descontar inventario ────────────────────────────
CREATE OR REPLACE FUNCTION descontar_inventario()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE inventario SET cantidad_disponible = cantidad_disponible - NEW.cantidad, updated_at = NOW()
  WHERE plato_id = NEW.plato_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_descontar_inventario
  AFTER INSERT ON items_pedido FOR EACH ROW EXECUTE FUNCTION descontar_inventario();

CREATE OR REPLACE FUNCTION restaurar_inventario_cancelado()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'cancelado' AND OLD.estado != 'cancelado' THEN
    UPDATE inventario i
    SET cantidad_disponible = cantidad_disponible + ip.cantidad, updated_at = NOW()
    FROM items_pedido ip WHERE ip.pedido_id = NEW.id AND i.plato_id = ip.plato_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_restaurar_inventario
  AFTER UPDATE ON pedidos FOR EACH ROW EXECUTE FUNCTION restaurar_inventario_cancelado();

-- ─── RLS ──────────────────────────────────────────────────────
ALTER TABLE negocios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias      ENABLE ROW LEVEL SECURITY;
ALTER TABLE platos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario      ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE items_pedido    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion   ENABLE ROW LEVEL SECURITY;
ALTER TABLE menus_turno     ENABLE ROW LEVEL SECURITY;

-- Función helper: negocio del usuario actual
CREATE OR REPLACE FUNCTION mi_negocio_id()
RETURNS UUID LANGUAGE SQL STABLE AS $$
  SELECT negocio_id FROM usuarios WHERE id = auth.uid()
$$;

-- negocios: solo ve el suyo
CREATE POLICY "negocio_own" ON negocios FOR ALL TO authenticated
  USING (id = mi_negocio_id()) WITH CHECK (id = mi_negocio_id());

-- usuarios: ve solo su negocio
CREATE POLICY "negocio" ON usuarios FOR ALL TO authenticated
  USING (negocio_id = mi_negocio_id()) WITH CHECK (negocio_id = mi_negocio_id());

-- mesas
CREATE POLICY "negocio" ON mesas FOR ALL TO authenticated
  USING (negocio_id = mi_negocio_id()) WITH CHECK (negocio_id = mi_negocio_id());

-- categorias
CREATE POLICY "negocio" ON categorias FOR ALL TO authenticated
  USING (negocio_id = mi_negocio_id()) WITH CHECK (negocio_id = mi_negocio_id());

-- platos
CREATE POLICY "negocio" ON platos FOR ALL TO authenticated
  USING (negocio_id = mi_negocio_id()) WITH CHECK (negocio_id = mi_negocio_id());

-- inventario (via plato)
CREATE POLICY "negocio" ON inventario FOR ALL TO authenticated
  USING (plato_id IN (SELECT id FROM platos WHERE negocio_id = mi_negocio_id()));

-- clientes
CREATE POLICY "negocio" ON clientes FOR ALL TO authenticated
  USING (negocio_id = mi_negocio_id()) WITH CHECK (negocio_id = mi_negocio_id());

-- turnos
CREATE POLICY "negocio" ON turnos FOR ALL TO authenticated
  USING (negocio_id = mi_negocio_id()) WITH CHECK (negocio_id = mi_negocio_id());

-- pedidos: auth puede todo en su negocio, anon puede insertar (QR/domi)
CREATE POLICY "negocio_auth" ON pedidos FOR ALL TO authenticated
  USING (negocio_id = mi_negocio_id()) WITH CHECK (negocio_id = mi_negocio_id());
CREATE POLICY "negocio_anon" ON pedidos FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "negocio_anon_select" ON pedidos FOR SELECT TO anon USING (true);

-- items_pedido: anon puede insertar/select (para QR/domi)
CREATE POLICY "negocio_auth" ON items_pedido FOR ALL TO authenticated
  USING (pedido_id IN (SELECT id FROM pedidos WHERE negocio_id = mi_negocio_id()));
CREATE POLICY "anon_insert" ON items_pedido FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select" ON items_pedido FOR SELECT TO anon USING (true);

-- pagos
CREATE POLICY "negocio_auth" ON pagos FOR ALL TO authenticated
  USING (pedido_id IN (SELECT id FROM pedidos WHERE negocio_id = mi_negocio_id()));
CREATE POLICY "anon_insert" ON pagos FOR INSERT TO anon WITH CHECK (true);

-- movimientos_caja
CREATE POLICY "negocio" ON movimientos_caja FOR ALL TO authenticated
  USING (turno_id IN (SELECT id FROM turnos WHERE negocio_id = mi_negocio_id()));

-- turnos_inventario
CREATE POLICY "negocio" ON turnos_inventario FOR ALL TO authenticated
  USING (turno_id IN (SELECT id FROM turnos WHERE negocio_id = mi_negocio_id()));

-- configuracion
CREATE POLICY "negocio" ON configuracion FOR ALL TO authenticated
  USING (negocio_id = mi_negocio_id()) WITH CHECK (negocio_id = mi_negocio_id());

-- menus_turno
CREATE POLICY "negocio" ON menus_turno FOR ALL TO authenticated
  USING (negocio_id = mi_negocio_id()) WITH CHECK (negocio_id = mi_negocio_id());
