import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Mesa } from '../../mesas/entities/mesa.entity';

// Valores EXACTAMENTE iguales a los ENUM del DDL (01_schema.sql)
export enum TipoConsumo {
  MESA = 'MESA',
  LLEVAR = 'LLEVAR',
  MOSTRADOR = 'MOSTRADOR',
}

export enum EstadoOrden {
  CREADA = 'CREADA',
  PROCESANDO = 'PROCESANDO',
  LISTA = 'LISTA',
  ENTREGADA = 'ENTREGADA',
  CERRADA = 'CERRADA',
  ANULADA = 'ANULADA',
}

@Entity('ordenes')
export class Orden {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'codigo_orden', length: 20 })
  codigoOrden: string;

  @Column({ name: 'mesa_id', nullable: true })
  mesaId?: number;

  // Relación SEGURA: Mesa no tiene secretos (cocina verá el número de mesa)
  @ManyToOne(() => Mesa)
  @JoinColumn({ name: 'mesa_id' })
  mesa?: Mesa;

  @Column({ name: 'cliente_id', nullable: true })
  clienteId?: number;

  @Column({ name: 'tipo_consumo', type: 'enum', enum: TipoConsumo })
  tipoConsumo: TipoConsumo;

  @Column({ type: 'enum', enum: EstadoOrden })
  estado: EstadoOrden;

  // ⚠️ SIN relación hacia Usuario (passwordHash) — patrón de cajas:
  // meseroId suelto + JOIN manual en el service
  @Column({ name: 'mesero_id' })
  meseroId: number;

  // Mapeo EXPLÍCITO (no @CreateDateColumn): es fecha de NEGOCIO —
  // reportes y caja la consultan (mismo criterio que fechaApertura)
  @Column({ name: 'fecha_creacion', type: 'timestamptz' })
  fechaCreacion: Date;
}
