BEGIN;

-- Evitar nuevas ordenes durante la sincronizacion.
LOCK TABLE public.ordenes IN SHARE ROW EXCLUSIVE MODE;

CREATE SEQUENCE IF NOT EXISTS public.seq_codigo_orden
    AS BIGINT
    INCREMENT BY 1
    MINVALUE 1
    NO MAXVALUE
    START WITH 1
    CACHE 1
    NO CYCLE;

-- Sincronizar con los codigos existentes.
DO $$
DECLARE
    v_maximo BIGINT;
    v_actual BIGINT;
    v_utilizada BOOLEAN;
    v_ultimo_utilizado BIGINT;
BEGIN
    SELECT COALESCE(
        MAX(SUBSTRING(codigo_orden FROM 5)::BIGINT),
        0
    )
    INTO v_maximo
    FROM public.ordenes
    WHERE codigo_orden ~ '^ORD-[0-9]{1,18}$';

    SELECT last_value, is_called
    INTO v_actual, v_utilizada
    FROM public.seq_codigo_orden;

    IF v_utilizada THEN
        v_ultimo_utilizado := v_actual;
    ELSE
        v_ultimo_utilizado := v_actual - 1;
    END IF;

    IF GREATEST(v_maximo, v_ultimo_utilizado) = 0 THEN
        PERFORM setval(
            'public.seq_codigo_orden',
            1,
            FALSE
        );
    ELSE
        PERFORM setval(
            'public.seq_codigo_orden',
            GREATEST(v_maximo, v_ultimo_utilizado),
            TRUE
        );
    END IF;
END $$;

COMMIT;