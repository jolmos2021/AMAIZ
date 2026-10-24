import { IsInt, Min } from 'class-validator';

export class RegistrarCreditoDto {
  @IsInt()
  @Min(1)
  subcuentaId: number;

  @IsInt()
  @Min(1)
  clienteId: number;
}
