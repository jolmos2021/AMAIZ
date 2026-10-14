import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Orden } from './orden.entity';
import { Producto } from '../../productos/entities/producto.entity';
import { NumericTransformer } from '../../common/numeric.transformer';

// Valores EXACTAMENTE iguales al ENUM estado_item del DDL
export enum EstadoItem {
  PENDIENTE = 'PENDIENTE',
  EN_PREPARACION = 'EN_PREPARACION',
  LISTO = 'LISTO',
  ENTREGADO = 'ENTREGADO',
  ANULADO = 'ANULADO',
}

@Entity('detalle_orden')
export class DetalleOrden {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'orden_id' })
  ordenId: number;

  @ManyToOne(() => Orden)
  @JoinColumn({ name: 'orden_id' })
  orden?: Orden;

  @Column({ name: 'producto_id' })
  productoId: number;

  // Relación SEGURA: cocina necesita el nombre del producto
  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'producto_id' })
  producto?: Producto;

  @Column({ type: 'int' })
  cantidad: number;

  // 📸 LA FOTO DEL PRECIO: vale lo que valía AL PEDIRLO.
  // Cambios futuros de precio no reescriben la historia.
  @Column({
    name: 'precio_unitario',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: new NumericTransformer(),
  })
  precioUnitario: number;

  // "Sin cebolla", " término medio"... viaja directo a la pantalla de cocina
  @Column({ type: 'text', nullable: true })
  notas?: string;

  @Column({ name: 'estado_item', type: 'enum', enum: EstadoItem })
  estadoItem: EstadoItem;
}
