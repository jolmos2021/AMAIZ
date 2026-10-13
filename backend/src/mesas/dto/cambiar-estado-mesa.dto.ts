import { IsEnum } from 'class-validator';
import { EstadoMesa } from '../entities/mesa.entity';

/**
 * Cambio manual de estado por el administrador.
 * El DTO acepta el enum completo (validación de FORMA),
 * pero el service rechazará OCUPADA (regla de NEGOCIO):
 * ese estado solo lo establece el sistema al abrir una orden (Fase 3).
 */
export class CambiarEstadoMesaDto {
  @IsEnum(EstadoMesa, {
    message: 'El estado debe ser LIBRE, OCUPADA o RESERVADA',
  })
  estado: EstadoMesa;
}
