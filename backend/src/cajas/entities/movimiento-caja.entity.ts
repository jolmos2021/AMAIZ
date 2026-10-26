import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { NumericTransformer } from '../../common/numeric.transformer';

export enum TipoMovimientoCaja { INGRESO = 'INGRESO', EGRESO = 'EGRESO' }

@Entity('movimientos_caja')
export class MovimientoCaja {
  @PrimaryGeneratedColumn({ type: 'bigint' }) id: number;
  @Column({ name: 'caja_id', type: 'bigint' }) cajaId: number;
  @Column({ type: 'varchar', length: 7 }) tipo: TipoMovimientoCaja;
  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: new NumericTransformer() }) monto: number;
  @Column({ type: 'varchar', length: 300 }) concepto: string;
  @Column({ name: 'usuario_id', type: 'bigint' }) usuarioId: number;
  @Column({ type: 'timestamptz' }) fecha: Date;
}
