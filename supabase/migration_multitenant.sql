-- ============================================================
-- MIGRACIÓN MULTI-TENANT — RestaurantOS
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- ─── 1. TABLA NEGOCIOS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS negocios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre              TEXT NOT NULL DEFAULT 'Mi Restaurante',
  plan                TEXT NOT NULL DEFAULT 'basico'
                        CHECK (plan IN ('basico', 'pro')),
  suscripcion_activa  BOOLEAN DEFAULT TRUE,
  suscripcion_hasta   TIMESTAMPTZ,
  mp_subscription_id  TEXT,
  logo_url            TEXT,
  onboarding_completo BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. NEGOCIO DE MIRELLA (restaurant existente) ─────────────
INSERT INTO negocios (id, nombre, onboarding_completo, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'Las Delicias de Mirella', TRUE, 'pro')
ON CONFLICT (id) DO NOTHING;

-- ─── 3. AGREGAR negocio_id A TABLAS PRINCIPALES ──────────────
ALTER TABLE mesas        ADD COLUMN IF NOT EXISTS negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE;
ALTER TABLE categorias   ADD COLUMN IF NOT EXISTS negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE;
ALTER TABLE platos       ADD COLUMN IF NOT EXISTS negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE;
ALTER TABLE pedidos      ADD COLUMN IF NOT EXISTS negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE;
ALTER TABLE inventario   ADD COLUMN IF NOT EXISTS negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE;
ALTER TABLE usuarios     ADD COLUMN IF NOT EXISTS negocio_id UUID REFERENCES negocios(id) ON DELETE SET NULL;
ALTER TABLE clientes     ADD COLUMN IF NOT EXISTS negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE;
ALTER TABLE turnos       ADD COLUMN IF NOT EXISTS negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE;
ALTER TABLE menus_turno  ADD COLUMN IF NOT EXISTS negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE;

-- configuracion puede o no existir — agregar negocio_id si existe
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'configuracion') THEN
    EXECUTE 'ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE';
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'llamadas') THEN
    EXECUTE 'ALTER TABLE llamadas ADD COLUMN IF NOT EXISTS negocio_id UUID REFERENCES negocios(id) ON DELETE CASCADE';
  END IF;
END $$;

-- ─── 4. MIGRAR DATOS EXISTENTES AL NEGOCIO DE MIRELLA ─────────
UPDATE mesas       SET negocio_id = '00000000-0000-0000-0000-000000000001' WHERE negocio_id IS NULL;
UPDATE categorias  SET negocio_id = '00000000-0000-0000-0000-000000000001' WHERE negocio_id IS NULL;
UPDATE platos      SET negocio_id = '00000000-0000-0000-0000-000000000001' WHERE negocio_id IS NULL;
UPDATE pedidos     SET negocio_id = '00000000-0000-0000-0000-000000000001' WHERE negocio_id IS NULL;
UPDATE inventario  SET negocio_id = '00000000-0000-0000-0000-000000000001' WHERE negocio_id IS NULL;
UPDATE usuarios    SET negocio_id = '00000000-0000-0000-0000-000000000001' WHERE negocio_id IS NULL;
UPDATE clientes    SET negocio_id = '00000000-0000-0000-0000-000000000001' WHERE negocio_id IS NULL;
UPDATE turnos      SET negocio_id = '00000000-0000-0000-0000-000000000001' WHERE negocio_id IS NULL;
UPDATE menus_turno SET negocio_id = '00000000-0000-0000-0000-000000000001' WHERE negocio_id IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'configuracion') THEN
    EXECUTE 'UPDATE configuracion SET negocio_id = ''00000000-0000-0000-0000-000000000001'' WHERE negocio_id IS NULL';
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'llamadas') THEN
    EXECUTE 'UPDATE llamadas SET negocio_id = ''00000000-0000-0000-0000-000000000001'' WHERE negocio_id IS NULL';
  END IF;
END $$;

-- ─── 5. NOT NULL en tablas principales (después de migrar) ────
ALTER TABLE mesas      ALTER COLUMN negocio_id SET NOT NULL;
ALTER TABLE categorias ALTER COLUMN negocio_id SET NOT NULL;
ALTER TABLE platos     ALTER COLUMN negocio_id SET NOT NULL;
ALTER TABLE pedidos    ALTER COLUMN negocio_id SET NOT NULL;

-- ─── 6. FUNCIÓN HELPER: negocio del usuario actual ────────────
CREATE OR REPLACE FUNCTION my_negocio_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT negocio_id FROM usuarios WHERE id = auth.uid()
$$;

-- ─── 7. TRIGGER: auto-asignar negocio_id en inserts ──────────
CREATE OR REPLACE FUNCTION auto_negocio_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.negocio_id IS NULL THEN
    NEW.negocio_id := my_negocio_id();
  END IF;
  RETURN NEW;
END;
$$;

-- Triggers en todas las tablas que necesitan negocio_id
DO $$ DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mesas','categorias','platos','pedidos','inventario','clientes','turnos','menus_turno'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_auto_negocio ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_auto_negocio BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION auto_negocio_id()', t);
  END LOOP;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'configuracion') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_auto_negocio ON configuracion';
    EXECUTE 'CREATE TRIGGER trg_auto_negocio BEFORE INSERT ON configuracion FOR EACH ROW EXECUTE FUNCTION auto_negocio_id()';
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'llamadas') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_auto_negocio ON llamadas';
    EXECUTE 'CREATE TRIGGER trg_auto_negocio BEFORE INSERT ON llamadas FOR EACH ROW EXECUTE FUNCTION auto_negocio_id()';
  END IF;
END $$;

-- ─── 8. HABILITAR RLS ─────────────────────────────────────────
ALTER TABLE negocios    ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias  ENABLE ROW LEVEL SECURITY;
ALTER TABLE platos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario  ENABLE ROW LEVEL SECURITY;
ALTER TABLE items_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios    ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE menus_turno ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_caja ENABLE ROW LEVEL SECURITY;

-- ─── 9. POLÍTICAS RLS — USUARIOS AUTENTICADOS ─────────────────

-- negocios: solo ver/editar el propio
DROP POLICY IF EXISTS "negocios_own" ON negocios;
CREATE POLICY "negocios_own" ON negocios
  FOR ALL TO authenticated
  USING (id = my_negocio_id());

-- mesas
DROP POLICY IF EXISTS "mesas_auth" ON mesas;
CREATE POLICY "mesas_auth" ON mesas
  FOR ALL TO authenticated
  USING (negocio_id = my_negocio_id());

-- categorias
DROP POLICY IF EXISTS "categorias_auth" ON categorias;
CREATE POLICY "categorias_auth" ON categorias
  FOR ALL TO authenticated
  USING (negocio_id = my_negocio_id());

-- platos
DROP POLICY IF EXISTS "platos_auth" ON platos;
CREATE POLICY "platos_auth" ON platos
  FOR ALL TO authenticated
  USING (negocio_id = my_negocio_id());

-- pedidos
DROP POLICY IF EXISTS "pedidos_auth" ON pedidos;
CREATE POLICY "pedidos_auth" ON pedidos
  FOR ALL TO authenticated
  USING (negocio_id = my_negocio_id());

-- inventario
DROP POLICY IF EXISTS "inventario_auth" ON inventario;
CREATE POLICY "inventario_auth" ON inventario
  FOR ALL TO authenticated
  USING (negocio_id = my_negocio_id());

-- items_pedido (sin negocio_id propio — filtra vía pedido)
DROP POLICY IF EXISTS "items_auth" ON items_pedido;
CREATE POLICY "items_auth" ON items_pedido
  FOR ALL TO authenticated
  USING (
    pedido_id IN (SELECT id FROM pedidos WHERE negocio_id = my_negocio_id())
  );

-- usuarios: ver compañeros del mismo negocio + perfil propio
DROP POLICY IF EXISTS "usuarios_auth" ON usuarios;
CREATE POLICY "usuarios_auth" ON usuarios
  FOR ALL TO authenticated
  USING (negocio_id = my_negocio_id() OR id = auth.uid());

-- clientes
DROP POLICY IF EXISTS "clientes_auth" ON clientes;
CREATE POLICY "clientes_auth" ON clientes
  FOR ALL TO authenticated
  USING (negocio_id = my_negocio_id());

-- turnos
DROP POLICY IF EXISTS "turnos_auth" ON turnos;
CREATE POLICY "turnos_auth" ON turnos
  FOR ALL TO authenticated
  USING (negocio_id = my_negocio_id());

-- pagos (filtra vía pedido)
DROP POLICY IF EXISTS "pagos_auth" ON pagos;
CREATE POLICY "pagos_auth" ON pagos
  FOR ALL TO authenticated
  USING (
    pedido_id IN (SELECT id FROM pedidos WHERE negocio_id = my_negocio_id())
  );

-- movimientos_caja (filtra vía turno)
DROP POLICY IF EXISTS "movimientos_auth" ON movimientos_caja;
CREATE POLICY "movimientos_auth" ON movimientos_caja
  FOR ALL TO authenticated
  USING (
    turno_id IN (SELECT id FROM turnos WHERE negocio_id = my_negocio_id())
  );

-- menus_turno
DROP POLICY IF EXISTS "menus_turno_auth" ON menus_turno;
CREATE POLICY "menus_turno_auth" ON menus_turno
  FOR ALL TO authenticated
  USING (negocio_id = my_negocio_id());

-- ─── 10. POLÍTICAS RLS — CLIENTES ANÓNIMOS (QR) ──────────────
-- Los clientes que escanean QR no están autenticados (anon)

-- Leer menú
DROP POLICY IF EXISTS "platos_anon" ON platos;
CREATE POLICY "platos_anon" ON platos
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "categorias_anon" ON categorias;
CREATE POLICY "categorias_anon" ON categorias
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "inventario_anon" ON inventario;
CREATE POLICY "inventario_anon" ON inventario
  FOR SELECT TO anon USING (true);

-- Leer y actualizar mesas (para marcar ocupada)
DROP POLICY IF EXISTS "mesas_anon" ON mesas;
CREATE POLICY "mesas_anon" ON mesas
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "mesas_anon_update" ON mesas;
CREATE POLICY "mesas_anon_update" ON mesas
  FOR UPDATE TO anon USING (true);

-- Crear e insertar pedidos por QR/domi
DROP POLICY IF EXISTS "pedidos_anon_insert" ON pedidos;
CREATE POLICY "pedidos_anon_insert" ON pedidos
  FOR INSERT TO anon WITH CHECK (tipo IN ('cliente_qr', 'domi'));

DROP POLICY IF EXISTS "pedidos_anon_select" ON pedidos;
CREATE POLICY "pedidos_anon_select" ON pedidos
  FOR SELECT TO anon USING (tipo IN ('cliente_qr', 'domi'));

-- items_pedido para QR
DROP POLICY IF EXISTS "items_anon_insert" ON items_pedido;
CREATE POLICY "items_anon_insert" ON items_pedido
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "items_anon_select" ON items_pedido;
CREATE POLICY "items_anon_select" ON items_pedido
  FOR SELECT TO anon USING (true);

-- clientes (para QR: buscar/crear cliente)
DROP POLICY IF EXISTS "clientes_anon" ON clientes;
CREATE POLICY "clientes_anon" ON clientes
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── 11. POLÍTICAS OPCIONALES (si las tablas existen) ─────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'configuracion') THEN
    EXECUTE 'ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "configuracion_auth" ON configuracion';
    EXECUTE 'CREATE POLICY "configuracion_auth" ON configuracion FOR ALL TO authenticated USING (negocio_id = my_negocio_id())';
    EXECUTE 'DROP POLICY IF EXISTS "configuracion_anon" ON configuracion';
    EXECUTE 'CREATE POLICY "configuracion_anon" ON configuracion FOR SELECT TO anon USING (true)';
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'llamadas') THEN
    EXECUTE 'ALTER TABLE llamadas ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "llamadas_auth" ON llamadas';
    EXECUTE 'CREATE POLICY "llamadas_auth" ON llamadas FOR ALL TO authenticated USING (negocio_id = my_negocio_id())';
    EXECUTE 'DROP POLICY IF EXISTS "llamadas_anon_insert" ON llamadas';
    EXECUTE 'CREATE POLICY "llamadas_anon_insert" ON llamadas FOR INSERT TO anon WITH CHECK (true)';
    EXECUTE 'DROP POLICY IF EXISTS "llamadas_anon_select" ON llamadas';
    EXECUTE 'CREATE POLICY "llamadas_anon_select" ON llamadas FOR SELECT TO anon USING (true)';
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'turnos_inventario') THEN
    EXECUTE 'ALTER TABLE turnos_inventario ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "turnos_inv_auth" ON turnos_inventario';
    EXECUTE 'CREATE POLICY "turnos_inv_auth" ON turnos_inventario FOR ALL TO authenticated USING (turno_id IN (SELECT id FROM turnos WHERE negocio_id = my_negocio_id()))';
  END IF;
END $$;

-- ─── 12. ÍNDICES DE RENDIMIENTO ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mesas_negocio       ON mesas(negocio_id);
CREATE INDEX IF NOT EXISTS idx_categorias_negocio  ON categorias(negocio_id);
CREATE INDEX IF NOT EXISTS idx_platos_negocio      ON platos(negocio_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_negocio     ON pedidos(negocio_id);
CREATE INDEX IF NOT EXISTS idx_inventario_negocio  ON inventario(negocio_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_negocio    ON usuarios(negocio_id);
CREATE INDEX IF NOT EXISTS idx_clientes_negocio    ON clientes(negocio_id);
CREATE INDEX IF NOT EXISTS idx_turnos_negocio      ON turnos(negocio_id);

-- ─── FIN DE MIGRACIÓN ─────────────────────────────────────────
-- Verifica ejecutando:
-- SELECT COUNT(*) FROM negocios;         → debe mostrar 1
-- SELECT COUNT(*) FROM mesas WHERE negocio_id IS NOT NULL;
-- SELECT COUNT(*) FROM usuarios WHERE negocio_id IS NOT NULL;
