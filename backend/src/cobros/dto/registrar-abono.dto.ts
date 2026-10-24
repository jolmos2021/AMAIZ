import { IsInt, IsNumber, Min } from 'class-validator';

export class RegistrarAbonoDto {
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01)
  valor: number;

  @IsInt()
  @Min(1)
  metodoPagoId: number;
}
