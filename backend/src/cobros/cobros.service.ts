import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { DividirCuentaDto, ModalidadDivision } from './dto/dividir-cuenta.dto';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { RegistrarPagoCombinadoDto } from './dto/registrar-pago-combinado.dto';
import { RegistrarCreditoDto } from './dto/registrar-credito.dto';
import { RegistrarAbonoDto } from './dto/registrar-abono.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class CobrosService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly realtime: RealtimeGateway,
  ) {}

  public async intentarLiquidarOrden(
    manager: EntityManager,
    ordenId: number,
  ): Promise<boolean> {
    // La transacción que llama a este método debe haber
    // bloqueado previamente la orden mediante FOR UPDATE.

    const ordenes = await manager.query(
      `SELECT id, estado, mesa_id
     FROM ordenes
     WHERE id = $1`,
      [ordenId],
    );

    if (!ordenes.length) {
      throw new NotFoundException(`No existe la orden ${ordenId}`);
    }

    const orden = ordenes[0];

    // Solo se pueden liquidar órdenes entregadas.
    if (orden.estado !== 'ENTREGADA') {
      return false;
    }

    const subcuentas = await manager.query(
      `SELECT
       s.id,
       s.total_asignado::numeric AS total,
       COALESCE((
         SELECT SUM(p.valor_pagado)
         FROM subcuenta_pagos sp
         JOIN pagos p ON p.id = sp.pago_id
         WHERE sp.subcuenta_id = s.id
       ), 0)::numeric AS pagado,
       COALESCE((
         SELECT SUM(c.valor_total)
         FROM creditos_clientes c
         WHERE c.subcuenta_id = s.id
       ), 0)::numeric AS credito
     FROM subcuentas s
     WHERE s.orden_id = $1`,
      [ordenId],
    );

    // No cerrar órdenes sin subcuentas.
    if (!subcuentas.length) {
      return false;
    }

    const todasCubiertas = subcuentas.every(
      (s: { total: string; pagado: string; credito: string }) => {
        const total = Math.round(Number(s.total) * 100);
        const pagado = Math.round(Number(s.pagado) * 100);
        const credito = Math.round(Number(s.credito) * 100);

        return total === pagado + credito;
      },
    );

    if (!todasCubiertas) {
      return false;
    }

    // Verificar que el total de las subcuentas coincida con el total
    // de los productos cobrables de la orden antes de cerrarla.
    const totalesOrden = await manager.query(
      `SELECT COALESCE(SUM(cantidad * precio_unitario), 0)::numeric AS total
       FROM detalle_orden
       WHERE orden_id = $1
         AND estado_item <> 'ANULADO'`,
      [ordenId],
    );

    const totalOrdenCentavos = Math.round(Number(totalesOrden[0].total) * 100);
    const totalSubcuentasCentavos = subcuentas.reduce(
      (acumulado: number, subcuenta: { total: string }) =>
        acumulado + Math.round(Number(subcuenta.total) * 100),
      0,
    );

    if (
      totalOrdenCentavos <= 0 ||
      totalSubcuentasCentavos !== totalOrdenCentavos
    ) {
      return false;
    }

    // Cerrar la orden.
    await manager.query(
      `UPDATE ordenes
     SET estado = 'CERRADA'
     WHERE id = $1
       AND estado = 'ENTREGADA'`,
      [ordenId],
    );

    // Liberar la mesa solamente si no tiene otras órdenes activas.
    if (orden.mesa_id) {
      await manager.query(
        `UPDATE mesas
       SET estado = 'LIBRE'
       WHERE id = $1
         AND estado = 'OCUPADA'
         AND NOT EXISTS (
           SELECT 1
           FROM ordenes
           WHERE mesa_id = $1
             AND estado NOT IN ('CERRADA', 'ANULADA')
         )`,
        [orden.mesa_id],
      );
    }

    return true;
  }

  async obtenerMetodos() {
    return this.dataSource.query(
      `SELECT id, nombre, activo, tipo_procesamiento
       FROM metodos_pago
       WHERE activo = TRUE
       ORDER BY id`,
    );
  }

  async obtenerResumenOrden(ordenId: number) {
    const ordenes = await this.dataSource.query(
      `SELECT
          o.id,
          o.codigo_orden,
          o.estado,
          o.mesa_id,
          o.cliente_id,
          o.tipo_consumo
       FROM ordenes o
       WHERE o.id = $1`,
      [ordenId],
    );

    if (ordenes.length === 0) {
      throw new NotFoundException(`No existe una orden con id ${ordenId}`);
    }

    const items = await this.dataSource.query(
      `SELECT
          d.id,
          d.producto_id,
          p.nombre AS producto,
          d.cantidad,
          d.precio_unitario::float8 AS precio_unitario,
          (d.cantidad * d.precio_unitario)::float8 AS subtotal,
          d.estado_item
       FROM detalle_orden d
       JOIN productos p ON p.id = d.producto_id
       WHERE d.orden_id = $1
       ORDER BY d.id`,
      [ordenId],
    );

    const totalCentavos = items
      .filter((item: { estado_item: string }) => item.estado_item !== 'ANULADO')
      .reduce(
        (total: number, item: { subtotal: number }) =>
          total + Math.round(Number(item.subtotal) * 100),
        0,
      );

    return {
      orden: ordenes[0],
      items,
      total: totalCentavos / 100,
    };
  }

  async obtenerSubcuentas(ordenId: number) {
    const existe = await this.dataSource.query(
      'SELECT id FROM ordenes WHERE id = $1',
      [ordenId],
    );

    if (existe.length === 0) {
      throw new NotFoundException(`No existe una orden con id ${ordenId}`);
    }

    return this.dataSource.query(
      `SELECT
          s.id,
          s.orden_id,
          s.nombre,
          s.numero_persona,
          s.modalidad,
          s.cliente_id,
          s.total_asignado::float8 AS total_asignado,
          COALESCE(
            (
              SELECT SUM(p.valor_pagado)
              FROM subcuenta_pagos sp
              JOIN pagos p ON p.id = sp.pago_id
              WHERE sp.subcuenta_id = s.id
            ), 0
          )::float8 AS total_pagado,
          COALESCE(
            (
              SELECT SUM(c.valor_total)
              FROM creditos_clientes c
              WHERE c.subcuenta_id = s.id
            ), 0
          )::float8 AS total_credito,

          COALESCE(
            (
              SELECT SUM(c.saldo_pendiente)
              FROM creditos_clientes c
              WHERE c.subcuenta_id = s.id
            ), 0
                    )::float8 AS saldo_credito,

          (
            s.total_asignado
            - COALESCE(
                (
                  SELECT SUM(p.valor_pagado)
                  FROM subcuenta_pagos sp
                  JOIN pagos p ON p.id = sp.pago_id
                  WHERE sp.subcuenta_id = s.id
                ), 0
              )
            - COALESCE(
                (
                  SELECT SUM(c.valor_total)
                  FROM creditos_clientes c
                  WHERE c.subcuenta_id = s.id
                ), 0
              )
          )::float8 AS saldo_por_cubrir

       FROM subcuentas s
       WHERE s.orden_id = $1
       ORDER BY s.numero_persona`,
      [ordenId],
    );
  }

  async obtenerCreditos() {
    return this.dataSource.query(`
      SELECT
        c.id::text AS id,
        c.cliente_id::text AS cliente_id,
        cl.nombre AS cliente_nombre,
        cl.telefono AS cliente_telefono,
        cl.tipo AS cliente_tipo,
        c.orden_id::text AS orden_id,
        o.codigo_orden,
        o.tipo_consumo,
        c.subcuenta_id::text AS subcuenta_id,
        c.valor_total::numeric AS valor_total,
        COALESCE(SUM(a.valor_abonado), 0)::numeric AS total_abonado,
        c.saldo_pendiente::numeric AS saldo_pendiente,
        c.estado,
        COUNT(a.id)::int AS cantidad_abonos,
        c.created_at
      FROM creditos_clientes c
      JOIN clientes cl ON cl.id = c.cliente_id
      JOIN ordenes o ON o.id = c.orden_id
      LEFT JOIN abonos_credito a ON a.credito_id = c.id
      GROUP BY
        c.id,
        cl.nombre,
        cl.telefono,
        cl.tipo,
        o.codigo_orden,
        o.tipo_consumo
      ORDER BY c.created_at DESC, c.id DESC
    `);
  }

  async dividirCuenta(ordenId: number, dto: DividirCuentaDto) {
    return this.dataSource.transaction(async (manager) => {
      // Bloqueo de la orden: evita divisiones y cobros simultáneos.
      const ordenes = await manager.query(
        `SELECT id, estado FROM ordenes WHERE id = $1 FOR UPDATE`,
        [ordenId],
      );

      if (!ordenes.length) {
        throw new NotFoundException(`No existe la orden ${ordenId}`);
      }

      if (['CERRADA', 'ANULADA'].includes(ordenes[0].estado)) {
        throw new BadRequestException('La orden no admite divisiones');
      }

      const existentes = await manager.query(
        `SELECT COUNT(*)::int AS total
       FROM subcuentas WHERE orden_id = $1`,
        [ordenId],
      );

      if (existentes[0].total > 0) {
        throw new ConflictException('Esta orden ya tiene una división');
      }

      const movimientos = await manager.query(
        `SELECT
        (SELECT COUNT(*)::int FROM pagos WHERE orden_id = $1) AS pagos,
        (SELECT COUNT(*)::int FROM creditos_clientes
         WHERE orden_id = $1) AS creditos`,
        [ordenId],
      );

      if (movimientos[0].pagos > 0 || movimientos[0].creditos > 0) {
        throw new ConflictException(
          'No se puede dividir una orden con pagos o créditos registrados',
        );
      }

      const detalles = await manager.query(
        `SELECT id, cantidad, precio_unitario::text AS precio,
              estado_item
       FROM detalle_orden
       WHERE orden_id = $1
       ORDER BY id`,
        [ordenId],
      );

      const activos = detalles.filter(
        (d: { estado_item: string }) => d.estado_item !== 'ANULADO',
      );

      if (!activos.length) {
        throw new BadRequestException('La orden no tiene productos cobrables');
      }

      const detalleMap = new Map<
        number,
        {
          cantidad: number;
          precioCentavos: number;
        }
      >();

      let totalCentavos = 0;

      for (const d of activos) {
        const precioCentavos = Math.round(Number(d.precio) * 100);
        const cantidad = Number(d.cantidad);

        detalleMap.set(Number(d.id), { cantidad, precioCentavos });
        totalCentavos += cantidad * precioCentavos;
      }

      if (totalCentavos <= 0) {
        throw new BadRequestException('El total debe ser mayor que cero');
      }

      const nombres = dto.personas.map((p) => p.nombre.trim());

      if (nombres.some((n) => !n)) {
        throw new BadRequestException('Cada persona debe tener un nombre');
      }

      const totales: number[] = [];
      const asignaciones: {
        detalleOrdenId: number;
        cantidad: number;
      }[][] = [];

      if (dto.modalidad === ModalidadDivision.IGUALES) {
        if (dto.personas.some((p) => p.items?.length)) {
          throw new BadRequestException(
            'La división igualitaria no admite asignaciones de productos',
          );
        }

        const base = Math.floor(totalCentavos / dto.personas.length);
        const resto = totalCentavos % dto.personas.length;

        if (base === 0) {
          throw new BadRequestException(
            'El total no permite crear tantas subcuentas positivas',
          );
        }

        dto.personas.forEach((_, i) => {
          totales.push(base + (i < resto ? 1 : 0));
          asignaciones.push([]);
        });
      } else {
        const cantidadesAsignadas = new Map<number, number>();

        for (const persona of dto.personas) {
          const items = persona.items ?? [];
          const idsPersona = new Set<number>();
          let subtotal = 0;

          if (!items.length) {
            throw new BadRequestException(
              `La persona ${persona.nombre} no tiene productos asignados`,
            );
          }

          for (const item of items) {
            if (idsPersona.has(item.detalleOrdenId)) {
              throw new BadRequestException(
                'Un producto no puede repetirse dentro de la misma persona',
              );
            }

            idsPersona.add(item.detalleOrdenId);

            const detalle = detalleMap.get(item.detalleOrdenId);

            if (!detalle) {
              throw new BadRequestException(
                `El detalle ${item.detalleOrdenId} no pertenece a los productos cobrables`,
              );
            }

            const acumulado =
              (cantidadesAsignadas.get(item.detalleOrdenId) ?? 0) +
              item.cantidad;

            if (acumulado > detalle.cantidad) {
              throw new BadRequestException(
                `Cantidad excedida para el detalle ${item.detalleOrdenId}`,
              );
            }

            cantidadesAsignadas.set(item.detalleOrdenId, acumulado);
            subtotal += item.cantidad * detalle.precioCentavos;
          }

          if (subtotal <= 0) {
            throw new BadRequestException(
              'Cada subcuenta debe tener un importe positivo',
            );
          }

          totales.push(subtotal);
          asignaciones.push(items);
        }

        for (const [id, detalle] of detalleMap) {
          if ((cantidadesAsignadas.get(id) ?? 0) !== detalle.cantidad) {
            throw new BadRequestException(
              `No se asignaron todas las unidades del detalle ${id}`,
            );
          }
        }
      }

      if (totales.reduce((a, b) => a + b, 0) !== totalCentavos) {
        throw new BadRequestException(
          'Las subcuentas no coinciden con el total de la orden',
        );
      }

      const clienteIds = [
        ...new Set(
          dto.personas
            .map((p) => p.clienteId)
            .filter((id): id is number => id !== undefined),
        ),
      ];

      if (clienteIds.length) {
        const clientes = await manager.query(
          `SELECT id FROM clientes WHERE id = ANY($1::bigint[])`,
          [clienteIds],
        );

        if (clientes.length !== clienteIds.length) {
          throw new BadRequestException('Uno o más clientes no existen');
        }
      }

      const creadas: {
        id: string;
        nombre: string;
        numeroPersona: number;
        totalAsignado: number;
      }[] = [];

      for (let i = 0; i < dto.personas.length; i++) {
        const persona = dto.personas[i];

        const filas = await manager.query(
          `INSERT INTO subcuentas
          (orden_id, nombre, numero_persona, modalidad,
           cliente_id, total_asignado)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
          [
            ordenId,
            nombres[i],
            i + 1,
            dto.modalidad,
            persona.clienteId ?? null,
            (totales[i] / 100).toFixed(2),
          ],
        );

        const subcuentaId = filas[0].id;

        for (const item of asignaciones[i]) {
          await manager.query(
            `INSERT INTO subcuenta_items
            (subcuenta_id, detalle_orden_id, cantidad)
           VALUES ($1, $2, $3)`,
            [subcuentaId, item.detalleOrdenId, item.cantidad],
          );
        }

        creadas.push({
          id: subcuentaId,
          nombre: nombres[i],
          numeroPersona: i + 1,
          totalAsignado: totales[i] / 100,
        });
      }

      return {
        ordenId,
        modalidad: dto.modalidad,
        total: totalCentavos / 100,
        subcuentas: creadas,
      };
    });
  }
  async registrarPago(ordenId: number, dto: RegistrarPagoDto) {
    const resultado = await this.dataSource.transaction(async (manager) => {
      // 1. Bloquear la orden.
      const ordenes = await manager.query(
        `SELECT o.id, o.codigo_orden, o.estado,
          o.mesa_id, m.numero AS mesa_numero
          FROM ordenes o
          LEFT JOIN mesas m ON m.id = o.mesa_id
          WHERE o.id = $1
          FOR UPDATE OF o`,
        [ordenId],
      );

      if (!ordenes.length) {
        throw new NotFoundException(`No existe la orden ${ordenId}`);
      }

      if (['CERRADA', 'ANULADA'].includes(ordenes[0].estado)) {
        throw new ConflictException(
          'No se pueden registrar pagos en una orden cerrada o anulada',
        );
      }

      // 2. Bloquear una caja abierta.
      const cajas = await manager.query(
        `SELECT id
       FROM cajas
       WHERE estado = 'ABIERTA'
       ORDER BY id
       LIMIT 1
       FOR UPDATE`,
      );

      if (!cajas.length) {
        throw new BadRequestException(
          'Debe existir una caja abierta para registrar pagos',
        );
      }

      const cajaId = cajas[0].id;

      // 3. Validar método de pago.
      const metodos = await manager.query(
        `SELECT id, nombre, tipo_procesamiento
       FROM metodos_pago
       WHERE id = $1
         AND activo = TRUE`,
        [dto.metodoPagoId],
      );

      if (!metodos.length) {
        throw new BadRequestException(
          'El método de pago no existe o está inactivo',
        );
      }

      if (metodos[0].tipo_procesamiento !== 'PAGO_INMEDIATO') {
        throw new BadRequestException(
          'Los créditos deben registrarse mediante el módulo de créditos',
        );
      }

      // 4. Validar subcuenta.
      const subcuentas = await manager.query(
        `SELECT id, orden_id, nombre,
              total_asignado::text AS total_asignado
       FROM subcuentas
       WHERE id = $1
         AND orden_id = $2
       FOR UPDATE`,
        [dto.subcuentaId, ordenId],
      );

      if (!subcuentas.length) {
        throw new NotFoundException(
          'La subcuenta no existe o no pertenece a esta orden',
        );
      }

      const subcuenta = subcuentas[0];

      // 5. Calcular saldo pendiente.
      const pagos = await manager.query(
        `SELECT COALESCE(SUM(p.valor_pagado), 0)::text AS pagado
       FROM subcuenta_pagos sp
       JOIN pagos p ON p.id = sp.pago_id
       WHERE sp.subcuenta_id = $1`,
        [dto.subcuentaId],
      );

      const creditos = await manager.query(
        `SELECT COALESCE(SUM(valor_total), 0)::text AS credito
          FROM creditos_clientes
          WHERE subcuenta_id = $1`,
        [dto.subcuentaId],
      );

      const totalCentavos = Math.round(Number(subcuenta.total_asignado) * 100);

      const pagadoCentavos = Math.round(Number(pagos[0].pagado) * 100);

      const creditoCentavos = Math.round(Number(creditos[0].credito) * 100);

      const valorCentavos = Math.round(dto.valor * 100);

      const saldoCentavos = totalCentavos - pagadoCentavos - creditoCentavos;

      if (saldoCentavos <= 0) {
        throw new ConflictException(
          'Esta subcuenta no tiene saldo disponible para nuevos pagos',
        );
      }

      if (valorCentavos > saldoCentavos) {
        throw new BadRequestException(
          `El pago excede el saldo pendiente de ${(saldoCentavos / 100).toFixed(
            2,
          )}`,
        );
      }

      // 6. Registrar pago.
      const pagoCreado = await manager.query(
        `INSERT INTO pagos (
         orden_id,
         metodo_pago_id,
         valor_pagado,
         caja_id
       )
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
        [ordenId, dto.metodoPagoId, (valorCentavos / 100).toFixed(2), cajaId],
      );

      const pagoId = pagoCreado[0].id;

      // 7. Asociar pago con subcuenta.
      await manager.query(
        `INSERT INTO subcuenta_pagos (
         subcuenta_id,
         pago_id
       )
       VALUES ($1, $2)`,
        [dto.subcuentaId, pagoId],
      );

      // 8. Intentar cerrar la orden dentro de la misma transacción.
      // registrarPago ya bloqueó la orden mediante FOR UPDATE.
      const ordenCerrada = await this.intentarLiquidarOrden(manager, ordenId);

      // 9. Devolver resultado.
      return {
        ordenId,
        codigoOrden: ordenes[0].codigo_orden,
        mesa: ordenes[0].mesa_id
          ? {
              id: Number(ordenes[0].mesa_id),
              numero: ordenes[0].mesa_numero,
            }
          : null,
        subcuentaId: dto.subcuentaId,
        pagoId,
        cajaId,
        metodoPago: metodos[0].nombre,
        valorPagado: valorCentavos / 100,
        totalSubcuenta: totalCentavos / 100,
        totalPagado: (pagadoCentavos + valorCentavos) / 100,
        saldoPendiente: (saldoCentavos - valorCentavos) / 100,
        ordenCerrada,
      };
    });

    // Emitir solamente después de confirmar la transacción.
    if (resultado.ordenCerrada) {
      this.realtime.emitirAHouse('orden:estado', {
        ordenId,
        codigoOrden: resultado.codigoOrden,
        estadoAnterior: 'ENTREGADA',
        estado: 'CERRADA',
        mesa: resultado.mesa,
      });
    }

    return resultado;
  }

  /** Cobra el saldo completo con métodos configurados; pagos y crédito son atómicos. */
  async registrarPagoCombinado(ordenId: number, dto: RegistrarPagoCombinadoDto) {
    const resultado = await this.dataSource.transaction(async (manager) => {
      const ordenes = await manager.query(
        `SELECT o.id, o.codigo_orden, o.estado, o.mesa_id,
                m.numero AS mesa_numero
           FROM ordenes o
           LEFT JOIN mesas m ON m.id = o.mesa_id
          WHERE o.id = $1 FOR UPDATE OF o`,
        [ordenId],
      );
      if (!ordenes.length) throw new NotFoundException(`No existe la orden ${ordenId}`);
      const orden = ordenes[0];
      if (orden.estado !== 'ENTREGADA') {
        throw new ConflictException('La orden debe estar ENTREGADA para el cobro combinado');
      }

      const cajas = await manager.query(
        `SELECT id FROM cajas WHERE estado = 'ABIERTA'
          ORDER BY id LIMIT 1 FOR UPDATE`,
      );
      if (!cajas.length) {
        throw new BadRequestException('Debe existir una caja abierta para registrar pagos');
      }

      const subcuentas = await manager.query(
        `SELECT id, nombre, total_asignado::text AS total_asignado
           FROM subcuentas WHERE orden_id = $1 FOR UPDATE`,
        [ordenId],
      );
      if (subcuentas.length !== 1 || subcuentas[0].nombre !== 'Cuenta completa') {
        throw new ConflictException('El cobro combinado requiere una única subcuenta Cuenta completa');
      }
      const subcuenta = subcuentas[0];
      const pagosPrevios = await manager.query(
        `SELECT COALESCE(SUM(p.valor_pagado), 0)::text AS pagado
           FROM subcuenta_pagos sp JOIN pagos p ON p.id = sp.pago_id
          WHERE sp.subcuenta_id = $1`, [subcuenta.id],
      );
      const creditosPrevios = await manager.query(
        `SELECT COUNT(*)::int AS cantidad,
                COALESCE(SUM(valor_total), 0)::text AS credito
           FROM creditos_clientes WHERE subcuenta_id = $1`, [subcuenta.id],
      );
      const saldo = Math.round(Number(subcuenta.total_asignado) * 100)
        - Math.round(Number(pagosPrevios[0].pagado) * 100)
        - Math.round(Number(creditosPrevios[0].credito) * 100);
      if (saldo <= 0) throw new ConflictException('La cuenta ya no tiene saldo pendiente');

      const valores = dto.pagos.map((p) => Math.round(p.valor * 100));
      if (valores.some((v, i) => !Number.isSafeInteger(v) || v <= 0 ||
          Math.abs(dto.pagos[i].valor * 100 - v) > 0.000001)) {
        throw new BadRequestException('Los importes deben ser positivos y tener máximo 2 decimales');
      }
      const total = valores.reduce((a, b) => a + b, 0);
      if (!Number.isSafeInteger(total) || total !== saldo) {
        throw new BadRequestException(
          `El total de métodos debe coincidir exactamente con el saldo pendiente de ${(saldo / 100).toFixed(2)}`,
        );
      }

      const ids = dto.pagos.map((p) => p.metodoPagoId);
      if (new Set(ids).size !== ids.length) {
        throw new BadRequestException('No repitas un método de pago; agrupa su importe');
      }
      const metodos = await manager.query(
        `SELECT id, nombre, tipo_procesamiento FROM metodos_pago
          WHERE id = ANY($1::bigint[]) AND activo = TRUE`,
        [ids],
      );
      const porId = new Map<number, { nombre: string; tipo_procesamiento: string }>(
        metodos.map((m: { id: number; nombre: string; tipo_procesamiento: string }) =>
          [Number(m.id), m]),
      );
      if (porId.size !== dto.pagos.length) {
        throw new BadRequestException('Hay métodos de pago inexistentes o inactivos');
      }
      const creditosSolicitados = dto.pagos.filter(
        (p) => porId.get(p.metodoPagoId)?.tipo_procesamiento === 'CREDITO_CLIENTE',
      );
      if (creditosSolicitados.length > 1) {
        throw new BadRequestException('Solo se admite un crédito por subcuenta');
      }
      if (creditosSolicitados.length && Number(creditosPrevios[0].cantidad) > 0) {
        throw new ConflictException('Esta subcuenta ya tiene un crédito registrado');
      }
      for (const pago of dto.pagos) {
        const tipo = porId.get(pago.metodoPagoId)?.tipo_procesamiento;
        if (tipo !== 'PAGO_INMEDIATO' && tipo !== 'CREDITO_CLIENTE') {
          throw new BadRequestException('Tipo de procesamiento no admitido');
        }
        if (tipo === 'CREDITO_CLIENTE' && !pago.clienteId) {
          throw new BadRequestException('El crédito requiere seleccionar un cliente');
        }
        if (tipo === 'PAGO_INMEDIATO' && pago.clienteId !== undefined) {
          throw new BadRequestException('Solo los créditos admiten clienteId');
        }
      }

      if (creditosSolicitados.length) {
        const clienteId = creditosSolicitados[0].clienteId;
        const clientes = await manager.query(
          'SELECT id FROM clientes WHERE id = $1', [clienteId],
        );
        if (!clientes.length) {
          throw new NotFoundException(`No existe el cliente ${clienteId}`);
        }
      }

      const pagosCreados: { pagoId: number; metodoPagoId: number; valor: number }[] = [];
      const creditosCreados: { creditoId: number; metodoPagoId: number; clienteId: number; valor: number }[] = [];
      for (let i = 0; i < dto.pagos.length; i++) {
        const pago = dto.pagos[i];
        const valor = (valores[i] / 100).toFixed(2);
        const tipo = porId.get(pago.metodoPagoId)!.tipo_procesamiento;
        if (tipo === 'PAGO_INMEDIATO') {
          const creado = await manager.query(
            `INSERT INTO pagos (orden_id, metodo_pago_id, valor_pagado, caja_id)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [ordenId, pago.metodoPagoId, valor, cajas[0].id],
          );
          await manager.query(
            `INSERT INTO subcuenta_pagos (subcuenta_id, pago_id) VALUES ($1, $2)`,
            [subcuenta.id, creado[0].id],
          );
          pagosCreados.push({
            pagoId: Number(creado[0].id), metodoPagoId: pago.metodoPagoId, valor: valores[i] / 100,
          });
        } else {
          const creado = await manager.query(
            `INSERT INTO creditos_clientes
              (cliente_id, orden_id, subcuenta_id, valor_total, saldo_pendiente, estado)
             VALUES ($1, $2, $3, $4, $4, 'PENDIENTE') RETURNING id`,
            [pago.clienteId, ordenId, subcuenta.id, valor],
          );
          await manager.query(
            `UPDATE subcuentas SET cliente_id = $1 WHERE id = $2`,
            [pago.clienteId, subcuenta.id],
          );
          creditosCreados.push({
            creditoId: Number(creado[0].id), metodoPagoId: pago.metodoPagoId,
            clienteId: pago.clienteId!, valor: valores[i] / 100,
          });
        }
      }

      const ordenCerrada = await this.intentarLiquidarOrden(manager, ordenId);
      if (!ordenCerrada) {
        throw new ConflictException('No fue posible liquidar la orden; operación revertida');
      }
      return {
        ordenId, codigoOrden: orden.codigo_orden,
        mesa: orden.mesa_id ? { id: Number(orden.mesa_id), numero: orden.mesa_numero } : null,
        cajaId: cajas[0].id, subcuentaId: subcuenta.id,
        pagos: pagosCreados, creditos: creditosCreados,
        totalCubierto: total / 100, saldoPendiente: 0, ordenCerrada,
      };
    });
    if (resultado.ordenCerrada) {
      this.realtime.emitirAHouse('orden:estado', {
        ordenId, codigoOrden: resultado.codigoOrden,
        estadoAnterior: 'ENTREGADA', estado: 'CERRADA', mesa: resultado.mesa,
      });
    }
    return resultado;
  }

  async registrarCredito(ordenId: number, dto: RegistrarCreditoDto) {
    const resultado = await this.dataSource.transaction(async (manager) => {
      // 1. Bloquear la orden.
      const ordenes = await manager.query(
        `SELECT o.id, o.codigo_orden, o.estado,
          o.mesa_id, m.numero AS mesa_numero
          FROM ordenes o
          LEFT JOIN mesas m ON m.id = o.mesa_id
          WHERE o.id = $1
          FOR UPDATE OF o`,
        [ordenId],
      );

      if (!ordenes.length) {
        throw new NotFoundException(`No existe la orden ${ordenId}`);
      }

      if (['CERRADA', 'ANULADA'].includes(ordenes[0].estado)) {
        throw new ConflictException(
          'No se pueden registrar créditos en una orden cerrada o anulada',
        );
      }

      // 2. Bloquear la subcuenta.
      const subcuentas = await manager.query(
        `SELECT id, orden_id, nombre,
              total_asignado::text AS total_asignado,
              cliente_id
       FROM subcuentas
       WHERE id = $1
         AND orden_id = $2
       FOR UPDATE`,
        [dto.subcuentaId, ordenId],
      );

      if (!subcuentas.length) {
        throw new NotFoundException(
          'La subcuenta no existe o no pertenece a esta orden',
        );
      }

      const subcuenta = subcuentas[0];

      // 3. Validar que el cliente exista.
      const clientes = await manager.query(
        `SELECT id
       FROM clientes
       WHERE id = $1`,
        [dto.clienteId],
      );

      if (!clientes.length) {
        throw new NotFoundException(`No existe el cliente ${dto.clienteId}`);
      }

      // 4. Comprobar que no exista un crédito previo.
      const existentes = await manager.query(
        `SELECT id
       FROM creditos_clientes
       WHERE subcuenta_id = $1`,
        [dto.subcuentaId],
      );

      if (existentes.length) {
        throw new ConflictException(
          'Esta subcuenta ya tiene un crédito registrado',
        );
      }

      // 5. Calcular los pagos recibidos.
      const pagos = await manager.query(
        `SELECT COALESCE(SUM(p.valor_pagado), 0)::text AS pagado
       FROM subcuenta_pagos sp
       JOIN pagos p ON p.id = sp.pago_id
       WHERE sp.subcuenta_id = $1`,
        [dto.subcuentaId],
      );

      const totalCentavos = Math.round(Number(subcuenta.total_asignado) * 100);

      const pagadoCentavos = Math.round(Number(pagos[0].pagado) * 100);

      const saldoCentavos = totalCentavos - pagadoCentavos;
      const valorCentavos = Math.round(dto.valor * 100);

      // Validar también en el servicio, antes de escribir en PostgreSQL.
      if (
        !Number.isFinite(dto.valor) ||
        !Number.isSafeInteger(valorCentavos) ||
        dto.valor <= 0 ||
        valorCentavos <= 0 ||
        Math.abs(dto.valor * 100 - valorCentavos) > 0.000001
      ) {
        throw new BadRequestException(
          'El importe del crédito debe ser positivo y tener máximo 2 decimales',
        );
      }

      if (saldoCentavos <= 0) {
        throw new ConflictException(
          'La subcuenta ya está completamente pagada',
        );
      }

      if (valorCentavos > saldoCentavos) {
        throw new BadRequestException(
          `El crédito excede el saldo disponible de ${(saldoCentavos / 100).toFixed(2)}`,
        );
      }

      // 6. Registrar únicamente el importe solicitado como crédito.
      const creditos = await manager.query(
        `INSERT INTO creditos_clientes (
         cliente_id,
         orden_id,
         subcuenta_id,
         valor_total,
         saldo_pendiente,
         estado
       )
       VALUES ($1, $2, $3, $4, $4, 'PENDIENTE')
       RETURNING id`,
        [
          dto.clienteId,
          ordenId,
          dto.subcuentaId,
          (valorCentavos / 100).toFixed(2),
        ],
      );

      // 7. Asociar el cliente con la subcuenta.
      await manager.query(
        `UPDATE subcuentas
       SET cliente_id = $1
       WHERE id = $2`,
        [dto.clienteId, dto.subcuentaId],
      );

      // 8. Intentar liquidar la orden dentro de la misma transacción.
      // registrarCredito ya bloqueó la orden mediante FOR UPDATE.
      const ordenCerrada = await this.intentarLiquidarOrden(manager, ordenId);

      return {
        ordenId,
        codigoOrden: ordenes[0].codigo_orden,
        mesa: ordenes[0].mesa_id
          ? {
              id: Number(ordenes[0].mesa_id),
              numero: ordenes[0].mesa_numero,
            }
          : null,
        subcuentaId: dto.subcuentaId,
        clienteId: dto.clienteId,
        creditoId: creditos[0].id,
        totalSubcuenta: totalCentavos / 100,
        totalPagado: pagadoCentavos / 100,
        valorCredito: valorCentavos / 100,
        saldoPendiente: (saldoCentavos - valorCentavos) / 100,
        estado: 'PENDIENTE',
        ordenCerrada,
      };
    });

    // Notificar el cierre solamente después de confirmar la transacción.
    if (resultado.ordenCerrada) {
      this.realtime.emitirAHouse('orden:estado', {
        ordenId,
        codigoOrden: resultado.codigoOrden,
        estadoAnterior: 'ENTREGADA',
        estado: 'CERRADA',
        mesa: resultado.mesa,
      });
    }

    return resultado;
  }
  async liquidarOrden(ordenId: number) {
    const resultado = await this.dataSource.transaction(async (manager) => {
      // Bloquear la orden para evitar liquidaciones simultáneas.
      const ordenes = await manager.query(
        `SELECT o.id, o.codigo_orden, o.estado,
          o.mesa_id, m.numero AS mesa_numero
          FROM ordenes o
          LEFT JOIN mesas m ON m.id = o.mesa_id
          WHERE o.id = $1
          FOR UPDATE OF o`,
        [ordenId],
      );

      if (!ordenes.length) {
        throw new NotFoundException(`No existe la orden ${ordenId}`);
      }

      const orden = ordenes[0];

      if (orden.estado === 'CERRADA') {
        throw new ConflictException('La orden ya está cerrada');
      }

      if (orden.estado !== 'ENTREGADA') {
        throw new BadRequestException(
          'La orden debe estar ENTREGADA antes de liquidarse',
        );
      }

      // Reutilizar la misma liquidación de los cierres automáticos.
      const ordenCerrada = await this.intentarLiquidarOrden(manager, ordenId);

      if (!ordenCerrada) {
        throw new ConflictException(
          'La orden no tiene subcuentas o existen saldos sin cubrir',
        );
      }

      const conteo = await manager.query(
        `SELECT COUNT(*)::integer AS total
       FROM subcuentas
       WHERE orden_id = $1`,
        [ordenId],
      );

      return {
        ordenId,
        codigoOrden: orden.codigo_orden,
        mesa: orden.mesa_id
          ? {
              id: Number(orden.mesa_id),
              numero: orden.mesa_numero,
            }
          : null,
        estado: 'CERRADA',
        subcuentasLiquidadas: conteo[0].total,
        mesaId: orden.mesa_id,
      };
    });

    // Emitir el evento después de confirmar la transacción.
    this.realtime.emitirAHouse('orden:estado', {
      ordenId,
      codigoOrden: resultado.codigoOrden,
      estadoAnterior: 'ENTREGADA',
      estado: 'CERRADA',
      mesa: resultado.mesa,
    });

    return resultado;
  }

  /** Registra un abono a un crédito existente, sin alterar la orden. */
  async registrarAbono(creditoId: number, dto: RegistrarAbonoDto) {
    return this.dataSource.transaction(async (manager) => {
      // Bloquear el crédito impide que dos abonos consuman el mismo saldo.
      const creditos = await manager.query(
        `SELECT id, cliente_id, orden_id, valor_total::text AS valor_total,
                saldo_pendiente::text AS saldo_pendiente, estado
         FROM creditos_clientes
         WHERE id = $1
         FOR UPDATE`,
        [creditoId],
      );

      if (!creditos.length) {
        throw new NotFoundException(`No existe el crédito ${creditoId}`);
      }

      const credito = creditos[0];
      const saldoAnteriorCentavos = Math.round(
        Number(credito.saldo_pendiente) * 100,
      );
      const valorCentavos = Math.round(dto.valor * 100);

      if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) {
        throw new BadRequestException('El valor del abono debe ser positivo');
      }

      if (credito.estado !== 'PENDIENTE' || saldoAnteriorCentavos <= 0) {
        throw new ConflictException('El crédito ya está pagado');
      }

      if (valorCentavos > saldoAnteriorCentavos) {
        throw new BadRequestException(
          `El abono excede el saldo pendiente de ${(saldoAnteriorCentavos / 100).toFixed(2)}`,
        );
      }

      // La caja se bloquea para coordinar el abono con su cierre.
      const cajas = await manager.query(
        `SELECT id FROM cajas
         WHERE estado = 'ABIERTA'
         ORDER BY id LIMIT 1 FOR UPDATE`,
      );
      if (!cajas.length) {
        throw new BadRequestException(
          'Debe existir una caja abierta para registrar abonos',
        );
      }

      const metodos = await manager.query(
        `SELECT id, nombre, tipo_procesamiento FROM metodos_pago
         WHERE id = $1 AND activo = TRUE`,
        [dto.metodoPagoId],
      );
      if (!metodos.length) {
        throw new BadRequestException(
          'El método de pago no existe o está inactivo',
        );
      }

      // Los abonos solo admiten métodos que representen dinero recibido.
      if (metodos[0].tipo_procesamiento !== 'PAGO_INMEDIATO') {
        throw new BadRequestException(
          'El abono requiere un método de pago inmediato',
        );
      }

      const saldoNuevoCentavos = saldoAnteriorCentavos - valorCentavos;
      const estadoNuevo = saldoNuevoCentavos === 0 ? 'PAGADO' : 'PENDIENTE';
      const abonos = await manager.query(
        `INSERT INTO abonos_credito
           (credito_id, valor_abonado, metodo_pago_id, caja_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, fecha_abono`,
        [
          creditoId,
          (valorCentavos / 100).toFixed(2),
          dto.metodoPagoId,
          cajas[0].id,
        ],
      );

      await manager.query(
        `UPDATE creditos_clientes
         SET saldo_pendiente = $2, estado = $3
         WHERE id = $1`,
        [creditoId, (saldoNuevoCentavos / 100).toFixed(2), estadoNuevo],
      );

      return {
        abonoId: abonos[0].id,
        creditoId,
        clienteId: credito.cliente_id,
        ordenId: credito.orden_id,
        cajaId: cajas[0].id,
        metodoPagoId: dto.metodoPagoId,
        valorAbonado: valorCentavos / 100,
        saldoAnterior: saldoAnteriorCentavos / 100,
        saldoPendiente: saldoNuevoCentavos / 100,
        estado: estadoNuevo,
        fechaAbono: abonos[0].fecha_abono,
      };
    });
  }
}
