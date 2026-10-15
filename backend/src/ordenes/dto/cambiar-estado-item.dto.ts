import { IsEnum } from 'class-validator';
import { EstadoItem } from '../entities/detalle-orden.entity';

export class CambiarEstadoItemDto {
  @IsEnum(EstadoItem, {
    message: 'estadoItem debe ser EN_PREPARACION, LISTO o ENTREGADO',
  })
  estadoItem: EstadoItem;
}
