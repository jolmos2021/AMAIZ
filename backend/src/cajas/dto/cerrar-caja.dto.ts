import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CerrarCajaDto {
  /** Efectivo contado físicamente; obligatorio para auditar el cierre. */
  @IsNumber({}, { message: 'El monto declarado debe ser un número' })
  @Min(0, { message: 'El monto declarado no puede ser negativo' })
  montoDeclarado: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
