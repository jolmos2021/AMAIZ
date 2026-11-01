import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string | null;
  tipo: 'NORMAL' | 'VIP';
  created_at: Date;
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
         tipo,
         created_at
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

    try {
      const filas: Cliente[] = await this.dataSource.query(
        `INSERT INTO clientes (nombre, telefono, tipo)
         VALUES ($1, $2, $3::tipo_cliente)
         RETURNING
           id::text AS id,
           nombre,
           telefono,
           tipo,
           created_at`,
        [nombreLimpio, telefonoLimpio, tipo],
      );

      return filas[0];
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'driverError' in error &&
        typeof error.driverError === 'object' &&
        error.driverError !== null &&
        'code' in error.driverError &&
        error.driverError.code === '23505'
      ) {
        throw new ConflictException(
          'Ya existe un cliente con el mismo nombre y teléfono.',
        );
      }

      throw error;
    }
  }

  async editar(
    id: string,
    datos: {
      nombre?: string;
      telefono?: string;
      tipo?: 'NORMAL' | 'VIP';
    },
  ): Promise<Cliente> {
    if (!/^\d+$/.test(id) || BigInt(id) <= 0n) {
      throw new BadRequestException('El ID del cliente no es válido.');
    }

    const campos: string[] = [];
    const valores: unknown[] = [];

    if (datos.nombre !== undefined) {
      const nombre = datos.nombre.trim();

      if (!nombre || nombre.length > 150) {
        throw new BadRequestException(
          'El nombre debe tener entre 1 y 150 caracteres.',
        );
      }

      valores.push(nombre);
      campos.push(`nombre = $${valores.length}`);
    }

    if (datos.telefono !== undefined) {
      const telefono = datos.telefono.trim();

      if (telefono.length > 20) {
        throw new BadRequestException(
          'El teléfono no puede superar 20 caracteres.',
        );
      }

      valores.push(telefono || null);
      campos.push(`telefono = $${valores.length}`);
    }

    if (datos.tipo !== undefined) {
      if (!['NORMAL', 'VIP'].includes(datos.tipo)) {
        throw new BadRequestException('El tipo de cliente no es válido.');
      }

      valores.push(datos.tipo);
      campos.push(`tipo = $${valores.length}::tipo_cliente`);
    }

    if (campos.length === 0) {
      throw new BadRequestException(
        'Debes proporcionar al menos un campo para actualizar.',
      );
    }

    valores.push(id);

    let filas: Cliente[];

    try {
      filas = await this.dataSource.query(
        `UPDATE clientes
         SET ${campos.join(', ')}
         WHERE id = $${valores.length}::bigint
         RETURNING
           id::text AS id,
           nombre,
           telefono,
           tipo,
           created_at`,
        valores,
      );
    } catch (error) {
      const errorBD =
        typeof error === 'object' && error !== null && 'driverError' in error
          ? error.driverError
          : error;

      if (
        typeof errorBD === 'object' &&
        errorBD !== null &&
        'code' in errorBD &&
        errorBD.code === '23505'
      ) {
        throw new ConflictException(
          'Ya existe otro cliente con el mismo nombre y teléfono.',
        );
      }

      throw error;
    }

    if (filas.length === 0) {
      throw new NotFoundException('El cliente no existe.');
    }

    return filas[0];
  }

  async eliminar(id: string): Promise<{ mensaje: string; id: string }> {
    if (!/^\d+$/.test(id) || BigInt(id) <= 0n) {
      throw new BadRequestException('El ID del cliente no es válido.');
    }

    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();

      // Bloquear el cliente durante la operación.
      const clientes = await queryRunner.query(
        `SELECT id::text AS id
         FROM clientes
         WHERE id = $1::bigint
         FOR UPDATE`,
        [id],
      );

      if (clientes.length === 0) {
        throw new NotFoundException('El cliente no existe.');
      }

      // Comprobar relaciones históricas y actuales.
      const relaciones = await queryRunner.query(
        `SELECT
           (SELECT COUNT(*) FROM ordenes
            WHERE cliente_id = $1::bigint) AS ordenes,
           (SELECT COUNT(*) FROM creditos_clientes
            WHERE cliente_id = $1::bigint) AS creditos,
           (SELECT COUNT(*) FROM subcuentas
            WHERE cliente_id = $1::bigint) AS subcuentas`,
        [id],
      );

      const { ordenes, creditos, subcuentas } = relaciones[0];

      if (
        Number(ordenes) > 0 ||
        Number(creditos) > 0 ||
        Number(subcuentas) > 0
      ) {
        throw new ConflictException(
          'No se puede eliminar el cliente porque tiene ' +
            'órdenes, créditos o subcuentas asociadas.',
        );
      }

      // Solo eliminar cuando no existan relaciones.
      const eliminados = await queryRunner.query(
        `DELETE FROM clientes
         WHERE id = $1::bigint
         RETURNING id::text AS id`,
        [id],
      );

      if (eliminados.length === 0) {
        throw new NotFoundException('El cliente no existe.');
      }

      await queryRunner.commitTransaction();

      return {
        mensaje: 'Cliente eliminado correctamente.',
        id,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // Una clave foránea puede detectar una relación concurrente
      // incluso después de la comprobación inicial.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23503'
      ) {
        throw new ConflictException(
          'No se puede eliminar el cliente porque tiene ' +
            'registros asociados.',
        );
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
