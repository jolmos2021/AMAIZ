import { IsInt } from 'class-validator';

/**
 * Ajuste por DELTA (incremental), no valor absoluto:
 *   delta: +20  → llegaron 20 unidades (recepción de mercadería)
 *   delta: -3   → salieron 3 unidades (merma/corrección)
 */
export class AjustarStockDto {
  @IsInt({ message: 'El delta debe ser un número entero' })
  delta: number;
}
