-- AMAIZ - Propuesta de migracion para reparto monetario de productos.
-- NO EJECUTAR hasta instalar y validar el backend compatible.
-- Se preservan las filas historicas con cantidad entera.
BEGIN;

ALTER TABLE public.subcuenta_items
    ADD COLUMN importe_asignado NUMERIC(12,2);

ALTER TABLE public.subcuenta_items
    ALTER COLUMN cantidad DROP NOT NULL;

-- Una fila representa O unidades completas O una participacion monetaria.
ALTER TABLE public.subcuenta_items
    ADD CONSTRAINT subcuenta_items_tipo_asignacion_check
    CHECK (
        (cantidad IS NOT NULL AND cantidad > 0 AND importe_asignado IS NULL)
        OR
        (cantidad IS NULL AND importe_asignado IS NOT NULL AND importe_asignado > 0)
    );

-- Se conserva la restriccion cantidad > 0, PK, FK y unicidad existentes.
COMMIT;
