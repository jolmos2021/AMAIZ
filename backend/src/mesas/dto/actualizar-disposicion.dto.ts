import {
  IsArray,
  IsInt,
  IsPositive,
  IsNumber,
  Min,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Posición de una mesa dentro del guardado masivo */
export class MesaPosicionDto {
  @IsInt()
  @IsPositive()
  id: number;

  @IsNumber()
  @Min(0)
  coordenadaX: number;

  @IsNumber()
  @Min(0)
  coordenadaY: number;
}

/**
 * Guardado de TODA la disposición del salón en una sola llamada.
 * El service lo ejecutará dentro de una transacción: o se guardan
 * todas las posiciones, o no se guarda ninguna.
 */
export class ActualizarDisposicionDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Envíe al menos una posición de mesa' })
  @ArrayMaxSize(200, { message: 'Demasiadas mesas en una sola solicitud' })
  @ValidateNested({ each: true })
  @Type(() => MesaPosicionDto)
  mesas: MesaPosicionDto[];
}
