import { IsInt, IsNumber, Min } from 'class-validator';

export class RegistrarCreditoDto {
  @IsInt()
  @Min(1)
  subcuentaId: number;

  @IsInt()
  @Min(1)
  clienteId: number;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message: 'El valor del crédito debe ser un número con máximo 2 decimales',
    },
  )
  @Min(0.01, {
    message: 'El valor del crédito debe ser mayor que cero',
  })
  valor: number;
}
