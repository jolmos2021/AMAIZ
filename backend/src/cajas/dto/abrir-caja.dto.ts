import { IsNumber, IsOptional, Min } from 'class-validator';

export class AbrirCajaDto {
  // Fondo inicial de la caja (billetes para dar cambio).
  // Opcional: si no se envía, se asume 0 — igual que el DEFAULT del DDL.
  @IsOptional()
  @IsNumber({}, { message: 'El monto inicial debe ser un número' })
  @Min(0, { message: 'El monto inicial no puede ser negativo' })
  montoInicial?: number;
}
