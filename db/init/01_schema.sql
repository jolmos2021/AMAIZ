-- ============================================================
-- SISTEMA DE ADMINISTRACIÓN DE RESTAURANTES
-- DDL v1.0 — Fase 1 | PostgreSQL 17
-- Se ejecuta automáticamente al crear el contenedor por
-- primera vez (docker-entrypoint-initdb.d)
-- ============================================================

-- ============================================================
-- TIPOS ENUMERADOS (dominios de negocio)
-- ============================================================
CREATE TYPE rol_usuario     AS ENUM ('ADMINISTRADOR', 'MESERO', 'COCINERO', 'CAJERO');
CREATE TYPE estado_usuario  AS ENUM ('ACTIVO', 'INACTIVO');
CREATE TYPE estado_mesa     AS ENUM ('LIBRE', 'OCUPADA', 'RESERVADA');
CREATE TYPE tipo_consumo    AS ENUM ('MESA', 'LLEVAR', 'MOSTRADOR');
CREATE TYPE estado_orden    AS ENUM ('CREADA', 'PROCESANDO', 'LISTA', 'ENTREGADA', 'CERRADA', 'ANULADA');
CREATE TYPE estado_item     AS ENUM ('PENDIENTE', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'ANULADO');
CREATE TYPE estado_caja     AS ENUM ('ABIERTA', 'CERRADA');
CREATE TYPE estado_credito  AS ENUM ('PENDIENTE', 'PAGADO');
CREATE TYPE tipo_cliente    AS ENUM ('NORMAL', 'VIP');

-- ============================================================
-- 1. USUARIOS
-- ============================================================
CREATE TABLE usuarios (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL,
    rol         rol_usuario NOT NULL,
    estado      estado_usuario NOT NULL DEFAULT 'ACTIVO',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. MESAS
-- ============================================================
CREATE TABLE mesas (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero            INTEGER NOT NULL UNIQUE,
    capacidad_maxima  INTEGER NOT NULL CHECK (capacidad_maxima > 0),
    coordenada_x      NUMERIC(10,2) NOT NULL DEFAULT 0,
    coordenada_y      NUMERIC(10,2) NOT NULL DEFAULT 0,
    estado            estado_mesa NOT NULL DEFAULT 'LIBRE',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. CATEGORIAS
-- ============================================================
CREATE TABLE categorias (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. PRODUCTOS
-- ============================================================
CREATE TABLE productos (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre              VARCHAR(150) NOT NULL,
    precio              NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
    categoria_id        BIGINT NOT NULL REFERENCES categorias(id),
    maneja_inventario   BOOLEAN NOT NULL DEFAULT FALSE,
    stock_actual        INTEGER NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
    disponible_menu_dia BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_productos_categoria ON productos(categoria_id);

-- ============================================================
-- 5. CLIENTES
-- ============================================================
CREATE TABLE clientes (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre      VARCHAR(150) NOT NULL,
    telefono    VARCHAR(20),
    tipo        tipo_cliente NOT NULL DEFAULT 'NORMAL',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clientes_telefono ON clientes(telefono);

-- ============================================================
-- 6. CAJAS
-- ============================================================
CREATE TABLE cajas (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha_apertura  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_cierre    TIMESTAMPTZ,
    monto_inicial   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monto_inicial >= 0),
    monto_final     NUMERIC(12,2),
    estado          estado_caja NOT NULL DEFAULT 'ABIERTA',
    usuario_id      BIGINT NOT NULL REFERENCES usuarios(id),
    CONSTRAINT chk_caja_fechas CHECK (fecha_cierre IS NULL OR fecha_cierre >= fecha_apertura)
);

CREATE INDEX idx_cajas_estado ON cajas(estado);

-- ============================================================
-- 7. ORDENES
-- ============================================================
CREATE TABLE ordenes (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo_orden    VARCHAR(20) NOT NULL UNIQUE,
    mesa_id         BIGINT REFERENCES mesas(id),
    cliente_id      BIGINT REFERENCES clientes(id),
    tipo_consumo    tipo_consumo NOT NULL,
    estado          estado_orden NOT NULL DEFAULT 'CREADA',
    mesero_id       BIGINT NOT NULL REFERENCES usuarios(id),
    fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ordenes_estado ON ordenes(estado);
CREATE INDEX idx_ordenes_mesa   ON ordenes(mesa_id);
CREATE INDEX idx_ordenes_fecha  ON ordenes(fecha_creacion);

-- ============================================================
-- 8. DETALLE ORDEN
-- ============================================================
CREATE TABLE detalle_orden (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    orden_id        BIGINT NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
    producto_id     BIGINT NOT NULL REFERENCES productos(id),
    cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0),
    notas           TEXT,
    estado_item     estado_item NOT NULL DEFAULT 'PENDIENTE'
);

CREATE INDEX idx_detalle_orden_orden    ON detalle_orden(orden_id);
CREATE INDEX idx_detalle_orden_producto ON detalle_orden(producto_id);

-- ============================================================
-- 9. METODOS DE PAGO
-- ============================================================
CREATE TABLE metodos_pago (
    id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  VARCHAR(50) NOT NULL UNIQUE,
    activo  BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================
-- 10. PAGOS
-- ============================================================
CREATE TABLE pagos (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    orden_id        BIGINT NOT NULL REFERENCES ordenes(id),
    metodo_pago_id  BIGINT NOT NULL REFERENCES metodos_pago(id),
    valor_pagado    NUMERIC(12,2) NOT NULL CHECK (valor_pagado > 0),
    caja_id         BIGINT NOT NULL REFERENCES cajas(id),
    fecha_pago      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pagos_orden ON pagos(orden_id);
CREATE INDEX idx_pagos_caja  ON pagos(caja_id);
CREATE INDEX idx_pagos_fecha ON pagos(fecha_pago);

-- ============================================================
-- 11. CREDITOS DE CLIENTES
-- ============================================================
CREATE TABLE creditos_clientes (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cliente_id      BIGINT NOT NULL REFERENCES clientes(id),
    orden_id        BIGINT NOT NULL UNIQUE REFERENCES ordenes(id),
    valor_total     NUMERIC(12,2) NOT NULL CHECK (valor_total > 0),
    saldo_pendiente NUMERIC(12,2) NOT NULL CHECK (saldo_pendiente >= 0),
    estado          estado_credito NOT NULL DEFAULT 'PENDIENTE',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_creditos_cliente ON creditos_clientes(cliente_id);
CREATE INDEX idx_creditos_estado  ON creditos_clientes(estado);

-- ============================================================
-- 12. ABONOS DE CREDITO
-- ============================================================
CREATE TABLE abonos_credito (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    credito_id      BIGINT NOT NULL REFERENCES creditos_clientes(id),
    valor_abonado   NUMERIC(12,2) NOT NULL CHECK (valor_abonado > 0),
    metodo_pago_id  BIGINT NOT NULL REFERENCES metodos_pago(id),
    fecha_abono     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    caja_id         BIGINT NOT NULL REFERENCES cajas(id)
);

CREATE INDEX idx_abonos_credito ON abonos_credito(credito_id);

-- ============================================================
-- 13. REPORTES CONFIGURADOS
-- ============================================================
CREATE TABLE reportes_configurados (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_reporte  VARCHAR(100) NOT NULL UNIQUE,
    campos_json     JSONB NOT NULL,
    filtros_json    JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DATOS SEMILLA
-- ============================================================
INSERT INTO metodos_pago (nombre, activo) VALUES
    ('EFECTIVO', TRUE),
    ('TARJETA', TRUE),
    ('TRANSFERENCIA', TRUE),
    ('CRÉDITO', TRUE);
