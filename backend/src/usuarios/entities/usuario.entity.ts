import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// Valores EXACTAMENTE iguales a los ENUM de PostgreSQL (01_schema.sql)
export enum RolUsuario {
  ADMINISTRADOR = 'ADMINISTRADOR',
  MESERO = 'MESERO',
  COCINERO = 'COCINERO',
  CAJERO = 'CAJERO',
}

export enum EstadoUsuario {
  ACTIVO = 'ACTIVO',
  INACTIVO = 'INACTIVO',
}

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 50 })
  username: string;

  @Column({ length: 100 })
  nombre: string;

  @Column({ name: 'password_hash', length: 255, nullable: true, select: true })
  passwordHash?: string;

  @Column({ type: 'enum', enum: RolUsuario })
  rol: RolUsuario;

  @Column({ type: 'enum', enum: EstadoUsuario })
  estado: EstadoUsuario;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
