import { IsNumber, IsOptional, Min } from 'class-validator';

export class CerrarCajaDto {
  /**
   * CUADRE DE CAJA (opcional): el dinero contado físicamente en el cajón.
   * El systema calcula el monto_final esperado (inicial + pagos + abonos)
   * y la respuesta incluirá la DIFERENCIA:
   *   positiva  → sobrante (sobró dinero)
   *   negativa  → faltante (faltó dinero)
   */
  @IsOptional()
  @IsNumber({}, { message: 'El monto declarado debe ser un número' })
  @Min(0, { message: 'El monto declarado no puede ser negativo' })
  montoDeclarado?: number;
}
