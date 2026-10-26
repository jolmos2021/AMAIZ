import { IsEnum, IsNumber, IsString, MaxLength, Min } from 'class-validator';
import { TipoMovimientoCaja } from '../entities/movimiento-caja.entity';

export class CrearMovimientoCajaDto {
  @IsEnum(TipoMovimientoCaja) tipo: TipoMovimientoCaja;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01) monto: number;
  @IsString() @MaxLength(300) concepto: string;
}
