import { ValueTransformer } from 'typeorm';

/**
 * PostgreSQL devuelve NUMERIC como string (para preservar precisión).
 * Este transformer lo convierte a number para usarlo en TypeScript.
 * Seguro para los rangos de dinero de un restaurante.
 * Reutilizable: cajas, pagos, créditos, abonos (Fases 2.4+).
 */
export class NumericTransformer implements ValueTransformer {
  to(valor?: number | null): number | null {
    return valor ?? null;
  }
  from(valor?: string | null): number | null {
    if (valor === null || valor === undefined) return null;
    return parseFloat(valor);
  }
}
