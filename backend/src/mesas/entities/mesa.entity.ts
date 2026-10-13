import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NumericTransformer } from '../../common/numeric.transformer';

// Valores EXACTAMENTE iguales al ENUM estado_mesa del DDL (01_schema.sql)
export enum EstadoMesa {
  LIBRE = 'LIBRE',
  OCUPADA = 'OCUPADA',
  RESERVADA = 'RESERVADA',
}

@Entity('mesas')
export class Mesa {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'int' })
  numero: number;

  @Column({ name: 'capacidad_maxima', type: 'int' })
  capacidadMaxima: number;

  @Column({
    name: 'coordenada_x',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: new NumericTransformer(),
  })
  coordenadaX: number;

  @Column({
    name: 'coordenada_y',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: new NumericTransformer(),
  })
  coordenadaY: number;

  @Column({ type: 'enum', enum: EstadoMesa })
  estado: EstadoMesa;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
