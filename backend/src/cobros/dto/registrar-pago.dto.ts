import {
  IsInt,
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class RegistrarPagoDto {
  @IsInt()
  @Min(1)
  subcuentaId: number;

  @IsInt()
  @Min(1)
  metodoPagoId: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  valor: number;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  observacion?: string;
}
