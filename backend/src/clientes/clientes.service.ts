import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string | null;
  tipo: 'NORMAL' | 'VIP';
}

@Injectable()
export class ClientesService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async buscar(termino = ''): Promise<Cliente[]> {
    const busqueda = termino.trim();

    return this.dataSource.query(
      `SELECT
         id::text AS id,
         nombre,
         telefono,
         tipo
       FROM clientes
       WHERE (
         $1 = ''
         OR nombre ILIKE '%' || $1 || '%'
         OR telefono ILIKE '%' || $1 || '%'
       )
       ORDER BY nombre ASC, id ASC
       LIMIT 50`,
      [busqueda],
    );
  }

  async crear(
    nombre: string,
    telefono?: string,
    tipo: 'NORMAL' | 'VIP' = 'NORMAL',
  ): Promise<Cliente> {
    const nombreLimpio = nombre?.trim();
    const telefonoLimpio = telefono?.trim() || null;

    if (!nombreLimpio || nombreLimpio.length > 150) {
      throw new BadRequestException(
        'El nombre debe tener entre 1 y 150 caracteres.',
      );
    }

    if (telefonoLimpio && telefonoLimpio.length > 20) {
      throw new BadRequestException(
        'El teléfono no puede superar 20 caracteres.',
      );
    }

    if (!['NORMAL', 'VIP'].includes(tipo)) {
      throw new BadRequestException('El tipo de cliente no es válido.');
    }

    const filas = await this.dataSource.query(
      `INSERT INTO clientes (nombre, telefono, tipo)
       VALUES ($1, $2, $3::tipo_cliente)
       RETURNING
         id::text AS id,
         nombre,
         telefono,
         tipo`,
      [nombreLimpio, telefonoLimpio, tipo],
    );

    return filas[0];
  }
}
