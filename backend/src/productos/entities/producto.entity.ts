import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Categoria } from '../../categorias/entities/categoria.entity';
import { NumericTransformer } from '../../common/numeric.transformer';

@Entity('productos')
export class Producto {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 150 })
  nombre: string;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: new NumericTransformer(),
  })
  precio: number;

  @Column({ name: 'categoria_id' })
  categoriaId: number;

  // Relación de lectura: permite incluir los datos de la categoría en respuestas
  @ManyToOne(() => Categoria)
  @JoinColumn({ name: 'categoria_id' })
  categoria?: Categoria;

  @Column({ name: 'maneja_inventario', default: false })
  manejaInventario: boolean;

  @Column({ name: 'stock_actual', default: 0 })
  stockActual: number;

  // El flag del blueprint: controla si aparece en el menú del día (Fase 3)
  @Column({ name: 'disponible_menu_dia', default: true })
  disponibleMenuDia: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
