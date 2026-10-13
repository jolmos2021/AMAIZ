import { IsInt, IsPositive, Min, IsNumber, IsOptional } from 'class-validator';

export class ActualizarMesaDto {
  @IsOptional()
  @IsInt({ message: 'El número de mesa debe ser un entero' })
  @IsPositive({ message: 'El número de mesa debe ser mayor a 0' })
  numero?: number;

  @IsOptional()
  @IsInt({ message: 'La capacidad debe ser un entero' })
  @Min(1, { message: 'La capacidad mínima es 1 persona' })
  capacidadMaxima?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  coordenadaX?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  coordenadaY?: number;
}
