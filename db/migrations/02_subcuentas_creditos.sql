
BEGIN;

-- 1. Subcuentas de una orden
CREATE TABLE IF NOT EXISTS subcuentas (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    orden_id BIGINT NOT NULL REFERENCES ordenes(id),
    nombre VARCHAR(100) NOT NULL,
    numero_persona INTEGER NOT NULL CHECK (numero_persona > 0),
    modalidad VARCHAR(20) NOT NULL
        CHECK (modalidad IN ('IGUALES', 'PRODUCTOS')),
    cliente_id BIGINT REFERENCES clientes(id),
    total_asignado NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (total_asignado >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_subcuenta_persona
        UNIQUE (orden_id, numero_persona)
);

CREATE INDEX IF NOT EXISTS idx_subcuentas_orden
    ON subcuentas(orden_id);

-- 2. Productos asignados a cada subcuenta
CREATE TABLE IF NOT EXISTS subcuenta_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subcuenta_id BIGINT NOT NULL REFERENCES subcuentas(id),
    detalle_orden_id BIGINT NOT NULL REFERENCES detalle_orden(id),
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    CONSTRAINT uq_subcuenta_item
        UNIQUE (subcuenta_id, detalle_orden_id)
);

CREATE INDEX IF NOT EXISTS idx_subcuenta_items_detalle
    ON subcuenta_items(detalle_orden_id);

-- 3. Asociar pagos existentes a subcuentas
-- Se conserva la tabla pagos y su historial.
CREATE TABLE IF NOT EXISTS subcuenta_pagos (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subcuenta_id BIGINT NOT NULL REFERENCES subcuentas(id),
    pago_id BIGINT NOT NULL UNIQUE REFERENCES pagos(id)
);

CREATE INDEX IF NOT EXISTS idx_subcuenta_pagos_subcuenta
    ON subcuenta_pagos(subcuenta_id);

-- 4. Permitir varios créditos para una misma orden.
ALTER TABLE creditos_clientes
    DROP CONSTRAINT IF EXISTS creditos_clientes_orden_id_key;

ALTER TABLE creditos_clientes
    ADD COLUMN IF NOT EXISTS subcuenta_id BIGINT
        REFERENCES subcuentas(id);

-- Una subcuenta solo puede generar un crédito.
CREATE UNIQUE INDEX IF NOT EXISTS uq_creditos_subcuenta
    ON creditos_clientes(subcuenta_id)
    WHERE subcuenta_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_creditos_orden
    ON creditos_clientes(orden_id);

COMMIT;
