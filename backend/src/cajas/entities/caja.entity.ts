import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { NumericTransformer } from '../../common/numeric.transformer';

// Valores EXACTAMENTE iguales al ENUM estado_caja del DDL (01_schema.sql)
export enum EstadoCaja {
  ABIERTA = 'ABIERTA',
  CERRADA = 'CERRADA',
}

@Entity('cajas')
export class Caja {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  // Mapeo EXPLÍCITO (no @CreateDateColumn): la fecha de apertura es
  // dato de NEGOCIO (el cierre y los reportes la consultan), no auditoría
  @Column({ name: 'fecha_apertura', type: 'timestamptz' })
  fechaApertura: Date;

  @Column({ name: 'fecha_cierre', type: 'timestamptz', nullable: true })
  fechaCierre?: Date;

  @Column({
    name: 'monto_inicial',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: new NumericTransformer(),
  })
  montoInicial: number;

  @Column({
    name: 'monto_final',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: new NumericTransformer(),
  })
  montoFinal?: number;

  @Column({ name: 'usuario_id' })
  usuarioId: number;

  // ⚠️ SIN @ManyToOne hacia Usuario — decisión de SEGURIDAD:
  // cargar la relación anidaría el objeto completo (con passwordHash)
  // en las respuestas. El nombre del cajero se trae por JOIN SQL
  // en el service, seleccionando únicamente u.nombre.
  @Column({ type: 'enum', enum: EstadoCaja })
  estado: EstadoCaja;
}
