import { IsInt, IsPositive, Min, IsNumber, IsOptional } from 'class-validator';

export class CrearMesaDto {
  @IsInt({ message: 'El número de mesa debe ser un entero' })
  @IsPositive({ message: 'El número de mesa debe ser mayor a 0' })
  numero: number;

  @IsInt({ message: 'La capacidad debe ser un entero' })
  @Min(1, { message: 'La capacidad mínima es 1 persona' })
  capacidadMaxima: number;

  // Posición inicial en el mapa del salón (opcional — nace en 0,0)
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'La coordenada no puede ser negativa' })
  coordenadaX?: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'La coordenada no puede ser negativa' })
  coordenadaY?: number;
}
