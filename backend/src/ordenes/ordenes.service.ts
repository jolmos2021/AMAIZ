import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Orden, TipoConsumo, EstadoOrden } from './entities/orden.entity';
import { DetalleOrden, EstadoItem } from './entities/detalle-orden.entity';
import { CrearOrdenDto } from './dto/crear-orden.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { EstadoMesa } from '../mesas/entities/mesa.entity';
import { RolUsuario, EstadoUsuario } from '../usuarios/entities/usuario.entity';
import { Producto } from '../productos/entities/producto.entity';

/** Fila de producto tal como llega del SQL (columnas snake_case del driver) */
interface ProductoRow {
  id: number;
  nombre: string;
  precio: number;
  maneja_inventario: boolean;
  stock_actual: number;
  disponible_menu_dia: boolean;
}

/** Fila de item con datos de producto (columnas snake_case del driver) */
interface ItemRow {
  id: number;
  orden_id: number;
  producto_id: number;
  cantidad: number;
  precio_unitario: number;
  notas: string | null;
  estado_item: EstadoItem;
  producto_nombre: string;
  maneja_inventario: boolean;
}

/** Fila de orden básica (para validaciones y eventos) */
interface OrdenBasicaRow {
  id: number;
  codigo_orden: string;
  estado: EstadoOrden;
  mesa_id: number | null;
  mesa_numero: number | null;
}

@Injectable()
export class OrdenesService {
  constructor(
    @InjectRepository(Orden)
    private readonly repo: Repository<Orden>,
    @InjectRepository(DetalleOrden)
    private readonly detalleRepo: Repository<DetalleOrden>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ==================== CREACIÓN DE LA COMANDA ====================

  async crear(meseroId: number, dto: CrearOrdenDto): Promise<Orden> {
    // --- Validación 1: quien toma la orden es un MESERO o ADMIN activo ---
    const mesero = await this.dataSource.query(
      'SELECT id, nombre, rol, estado FROM usuarios WHERE id = $1',
      [meseroId],
    );
    if (!mesero || mesero.length === 0) {
      throw new NotFoundException('El mesero indicado no existe');
    }
    if (mesero[0].estado !== EstadoUsuario.ACTIVO) {
      throw new ForbiddenException('El mesero está INACTIVO');
    }
    if (
      mesero[0].rol !== RolUsuario.MESERO &&
      mesero[0].rol !== RolUsuario.ADMINISTRADOR
    ) {
      throw new ForbiddenException(
        'Solo MESEROS (o administradores) pueden tomar órdenes',
      );
    }

    // --- Validación 2: coherencia del tipo de consumo con la mesa ---
    let mesa: { id: number; numero: number; estado: string } | null = null;
    if (dto.tipoConsumo === TipoConsumo.MESA) {
      if (!dto.mesaId) {
        throw new BadRequestException('Una orden de tipo MESA requiere mesaId');
      }
      const mesaRow = await this.dataSource.query(
        'SELECT id, numero, estado FROM mesas WHERE id = $1',
        [dto.mesaId],
      );
      if (!mesaRow || mesaRow.length === 0) {
        throw new NotFoundException(`No existe la mesa ${dto.mesaId}`);
      }
      const estadoMesa = mesaRow[0].estado as EstadoMesa;
      if (estadoMesa === EstadoMesa.OCUPADA) {
        throw new BadRequestException(
          `La mesa ${mesaRow[0].numero} está OCUPADA`,
        );
      }
      mesa = mesaRow[0];
    } else if (dto.mesaId) {
      // LLEVAR / MOSTRADOR no llevan mesa — no mezclamos conceptos
      throw new BadRequestException(
        'Una orden LLEVAR o MOSTRADOR no lleva mesaId',
      );
    }

    // --- La transacción maestra ---
    const { ordenGuardada, detalles, nombreMesero } =
      await this.dataSource.transaction(async (manager) => {
        // 1. Código de orden secuencial por BD (atómico hasta con 50 meseros
        //    simultáneos — jamás dos órdenes con el mismo código)
        const secuencia: { siguiente: number }[] = await manager.query(
          `SELECT COALESCE(MAX(id), 0) + 1 AS siguiente FROM ordenes`,
        );
        const codigoOrden = `ORD-${String(secuencia[0].siguiente).padStart(6, '0')}`;

        // 2. Leer productos y FOTOGRAFIAR precios vigentes
        const productosIds = dto.items.map((i) => i.productoId);
        const placeholders = productosIds.map((_, i) => `$${i + 1}`).join(', ');
        const productos: ProductoRow[] = await manager.query(
          `SELECT id, nombre, precio, maneja_inventario, stock_actual,
                  disponible_menu_dia
             FROM productos WHERE id IN (${placeholders})`,
          productosIds,
        );
        const mapaProductos = new Map<number, ProductoRow>();
        for (const p of productos) {
          mapaProductos.set(Number(p.id), p);
        }

        // Validar que TODOS los productos existen y están en menú
        for (const item of dto.items) {
          const p = mapaProductos.get(item.productoId);
          if (!p) {
            throw new BadRequestException(
              `El producto ${item.productoId} no existe`,
            );
          }
          if (!p.disponible_menu_dia) {
            throw new BadRequestException(
              `'${p.nombre}' NO está disponible en el menú del día`,
            );
          }
        }

        // 3. Validar y descontar stock ATÓMICAMENTE (por producto)
        //    El mismo UPDATE condicional del ajuste de stock (2.3b):
        //    dos meseros pidiendo la última Coca-Cola simultáneamente
        //    → solo uno gana, el otro recibe error claro.
        for (const item of dto.items) {
          const p = mapaProductos.get(item.productoId);
          if (!p) continue; // ya validado arriba — TS no lo infiere
          if (!p.maneja_inventario) continue; // sin inventario, sin descuento

          // UPDATE atómico — patrón probado en ajustarStock (2.3b).
          // Dentro de la transacción usamos el manager del EntityManager.
          const resultado = await manager
            .createQueryBuilder()
            .update(Producto)
            .set({ stockActual: () => 'stock_actual - :cantidad' })
            .where(
              'id = :id AND maneja_inventario = TRUE AND stock_actual >= :cantidad',
              { id: item.productoId, cantidad: item.cantidad },
            )
            .execute();
          if (!resultado.affected) {
            throw new BadRequestException(
              `Stock insuficiente de '${p.nombre}' (disponible: ${p.stock_actual}, solicitado: ${item.cantidad})`,
            );
          }
        }

        // 4. INSERT de la orden
        const ordenInsert = await manager.query(
          `INSERT INTO ordenes
             (codigo_orden, mesa_id, cliente_id, tipo_consumo, estado,
              mesero_id, fecha_creacion)
           VALUES ($1, $2, $3, $4, 'CREADA', $5, NOW())
           RETURNING id, codigo_orden, mesa_id, cliente_id, tipo_consumo,
                     estado, mesero_id, fecha_creacion`,
          [
            codigoOrden,
            dto.mesaId ?? null,
            dto.clienteId ?? null,
            dto.tipoConsumo,
            meseroId,
          ],
        );
        const ordenGuardada = ordenInsert[0];

        // 5. INSERT de los detalles (con la FOTO del precio)
        const detalles: any[] = [];
        for (const item of dto.items) {
          const p = mapaProductos.get(item.productoId);
          if (!p) {
            // Imposible en la práctica (validado arriba) — TS exige el guard
            throw new BadRequestException(
              `El producto ${item.productoId} no existe`,
            );
          }
          const detInsert = await manager.query(
            `INSERT INTO detalle_orden
               (orden_id, producto_id, cantidad, precio_unitario, notas,
                estado_item)
             VALUES ($1, $2, $3, $4, $5, 'PENDIENTE')
             RETURNING id, orden_id, producto_id, cantidad, precio_unitario,
                       notas, estado_item`,
            [
              ordenGuardada.id,
              item.productoId,
              item.cantidad,
              p.precio,
              item.notas ?? null,
            ],
          );
          detalles.push({
            ...detInsert[0],
            nombreProducto: p.nombre,
          });
        }

        // 6. Mesa → OCUPADA (la única puerta de entrada a ese estado)
        if (mesa) {
          await manager.query(
            `UPDATE mesas SET estado = 'OCUPADA' WHERE id = $1`,
            [mesa.id],
          );
        }

        return { ordenGuardada, detalles, nombreMesero: mesero[0].nombre };
      });

    // --- Fuera de la transacción: EMITIR a cocina por WebSocket ---
    // (deliberadamente fuera: si la emisión fallara, la orden YA está
    // persistida — jamás perdemos dinero por un problema de red interna)
    const payload = {
      orden: {
        id: Number(ordenGuardada.id),
        codigoOrden: ordenGuardada.codigo_orden,
        tipoConsumo: ordenGuardada.tipo_consumo,
        estado: ordenGuardada.estado,
        mesa: mesa ? { id: Number(mesa.id), numero: mesa.numero } : null,
        mesero: { id: meseroId, nombre: nombreMesero },
        fechaCreacion: ordenGuardada.fecha_creacion,
      },
      items: detalles.map((d) => ({
        id: Number(d.id),
        productoId: Number(d.producto_id),
        nombre: d.nombreProducto,
        cantidad: d.cantidad,
        precioUnitario: Number(d.precio_unitario),
        notas: d.notas,
        estadoItem: d.estado_item,
      })),
    };

    this.realtime.emitirAHouse('orden:nueva', payload);

    return this.obtenerPorId(Number(ordenGuardada.id));
  }

  // ==================== CONSULTAS ====================

  async obtenerPorId(id: number): Promise<any> {
    const orden = await this.dataSource.query(
      `SELECT o.id, o.codigo_orden, o.mesa_id, o.cliente_id, o.tipo_consumo,
              o.estado, o.mesero_id, o.fecha_creacion,
              m.numero AS mesa_numero, u.nombre AS mesero_nombre
         FROM ordenes o
         LEFT JOIN mesas m ON m.id = o.mesa_id
         LEFT JOIN usuarios u ON u.id = o.mesero_id
        WHERE o.id = $1`,
      [id],
    );
    if (!orden || orden.length === 0) {
      throw new NotFoundException(`No existe la orden ${id}`);
    }

    const items = await this.dataSource.query(
      `SELECT d.id, d.producto_id, d.cantidad, d.precio_unitario, d.notas,
              d.estado_item, p.nombre AS producto_nombre
         FROM detalle_orden d
         JOIN productos p ON p.id = d.producto_id
        WHERE d.orden_id = $1
        ORDER BY d.id`,
      [id],
    );

    const o = orden[0];
    return {
      id: Number(o.id),
      codigoOrden: o.codigo_orden,
      tipoConsumo: o.tipo_consumo,
      estado: o.estado,
      mesa: o.mesa_id ? { id: Number(o.mesa_id), numero: o.mesa_numero } : null,
      clienteId: o.cliente_id ? Number(o.cliente_id) : null,
      mesero: { id: Number(o.mesero_id), nombre: o.mesero_nombre },
      fechaCreacion: o.fecha_creacion,
      items: items.map((d: any) => ({
        id: Number(d.id),
        productoId: Number(d.producto_id),
        nombre: d.producto_nombre,
        cantidad: d.cantidad,
        precioUnitario: Number(d.precio_unitario),
        notas: d.notas,
        estadoItem: d.estado_item,
      })),
      total: items.reduce(
        (acc: number, d: any) => acc + Number(d.precio_unitario) * d.cantidad,
        0,
      ),
    };
  }

  // ==================== LISTADOS ====================

  /** Órdenes vivas (pendientes de cocina/mesero) — pantalla de cocina */
  async listarActivas(): Promise<any[]> {
    const ids = await this.dataSource.query(
      `SELECT id FROM ordenes
        WHERE estado IN ('CREADA','PROCESANDO','LISTA','ENTREGADA')
        ORDER BY fecha_creacion ASC`,
    );
    const resultado = [];
    for (const fila of ids) {
      resultado.push(await this.obtenerPorId(Number(fila.id)));
    }
    return resultado;
  }

  /** Historial con filtros de fecha (para reportería — Fase 5) */
  async listar(desde?: Date, hasta?: Date): Promise<any[]> {
    let sql = `SELECT id FROM ordenes`;
    const params: any[] = [];
    const condiciones: string[] = [];

    if (desde) {
      params.push(desde);
      condiciones.push(`fecha_creacion >= $${params.length}`);
    }
    if (hasta) {
      params.push(hasta);
      condiciones.push(`fecha_creacion <= $${params.length}`);
    }
    if (condiciones.length > 0) {
      sql += ` WHERE ${condiciones.join(' AND ')}`;
    }
    sql += ` ORDER BY fecha_creacion DESC`;

    const ids = await this.dataSource.query(sql, params);
    const resultado = [];
    for (const fila of ids) {
      resultado.push(await this.obtenerPorId(Number(fila.id)));
    }
    return resultado;
  }

  // ==================== FLUJO DE COCINA (Paso 3.3) ====================

  /** Orden básica con mesa — para validaciones y emisión de eventos */
  private async obtenerOrdenBasica(ordenId: number): Promise<OrdenBasicaRow> {
    const filas: OrdenBasicaRow[] = await this.dataSource.query(
      `SELECT o.id, o.codigo_orden, o.estado, o.mesa_id, m.numero AS mesa_numero
         FROM ordenes o LEFT JOIN mesas m ON m.id = o.mesa_id
        WHERE o.id = $1`,
      [ordenId],
    );
    if (!filas || filas.length === 0) {
      throw new NotFoundException(`No existe la orden ${ordenId}`);
    }
    return filas[0];
  }

  /** Item con info de producto — base de las operaciones de cocina */
  private async obtenerItem(itemId: number, ordenId: number): Promise<ItemRow> {
    const filas: ItemRow[] = await this.dataSource.query(
      `SELECT d.id, d.orden_id, d.producto_id, d.cantidad, d.precio_unitario,
              d.notas, d.estado_item, p.nombre AS producto_nombre,
              p.maneja_inventario
         FROM detalle_orden d JOIN productos p ON p.id = d.producto_id
        WHERE d.id = $1 AND d.orden_id = $2`,
      [itemId, ordenId],
    );
    if (!filas || filas.length === 0) {
      throw new NotFoundException(
        `No existe el item ${itemId} en la orden ${ordenId}`,
      );
    }
    return filas[0];
  }

  /**
   * Recalcula el estado de la orden tras cambios en sus items:
   *  - hay items activos y orden CREADA → PROCESANDO
   *  - todos los items terminales → LISTA (dispara orden:lista)
   *  - TODOS los items anulados → la orden se anula sola
   */
  private async recalcularEstadoOrden(
    ordenId: number,
    estadoActual: EstadoOrden,
  ): Promise<{ nuevoEstado: EstadoOrden | null; esLista: boolean }> {
    const conteos: { estado_item: EstadoItem; n: number }[] =
      await this.dataSource.query(
        `SELECT estado_item, COUNT(*)::int AS n
           FROM detalle_orden WHERE orden_id = $1 GROUP BY estado_item`,
        [ordenId],
      );

    const activos = conteos
      .filter(
        (c) =>
          c.estado_item === EstadoItem.PENDIENTE ||
          c.estado_item === EstadoItem.EN_PREPARACION,
      )
      .reduce((acc, c) => acc + c.n, 0);

    if (activos > 0) {
      if (estadoActual === EstadoOrden.CREADA) {
        await this.dataSource.query(
          `UPDATE ordenes SET estado = 'PROCESANDO' WHERE id = $1`,
          [ordenId],
        );
        return { nuevoEstado: EstadoOrden.PROCESANDO, esLista: false };
      }
      return { nuevoEstado: null, esLista: false };
    }

    // Todos los items en estado terminal
    const total = conteos.reduce((acc, c) => acc + c.n, 0);
    const anulados =
      conteos.find((c) => c.estado_item === EstadoItem.ANULADO)?.n ?? 0;

    if (anulados === total) {
      // La orden quedó vacía: se anula sola
      await this.dataSource.query(
        `UPDATE ordenes SET estado = 'ANULADA' WHERE id = $1`,
        [ordenId],
      );
      return { nuevoEstado: EstadoOrden.ANULADA, esLista: false };
    }

    if (
      estadoActual === EstadoOrden.CREADA ||
      estadoActual === EstadoOrden.PROCESANDO
    ) {
      await this.dataSource.query(
        `UPDATE ordenes SET estado = 'LISTA' WHERE id = $1`,
        [ordenId],
      );
      return { nuevoEstado: EstadoOrden.LISTA, esLista: true };
    }
    return { nuevoEstado: null, esLista: false };
  }

  /** Emite orden:estado (y orden:lista si corresponde) tras un cambio */
  private emitirEventosOrden(
    orden: OrdenBasicaRow,
    estadoAnterior: EstadoOrden,
    rec: { nuevoEstado: EstadoOrden | null; esLista: boolean },
  ): void {
    if (!rec.nuevoEstado) return;
    const mesa = orden.mesa_id
      ? { id: Number(orden.mesa_id), numero: orden.mesa_numero }
      : null;
    this.realtime.emitirAHouse('orden:estado', {
      ordenId: Number(orden.id),
      codigoOrden: orden.codigo_orden,
      estadoAnterior,
      estado: rec.nuevoEstado,
      mesa,
    });
    if (rec.esLista) {
      this.realtime.emitirAHouse('orden:lista', {
        ordenId: Number(orden.id),
        codigoOrden: orden.codigo_orden,
        mesa,
      });
    }
  }

  /** Avanza el estado de un item (cocina o mesero según transición) */
  async cambiarEstadoItem(
    ordenId: number,
    itemId: number,
    nuevoEstado: EstadoItem,
    rol: string,
  ): Promise<any> {
    // --- Capa 2 de defensa: el rol autorizado depende de la transición ---
    if (
      (nuevoEstado === EstadoItem.EN_PREPARACION ||
        nuevoEstado === EstadoItem.LISTO) &&
      rol !== RolUsuario.COCINERO &&
      rol !== RolUsuario.ADMINISTRADOR
    ) {
      throw new ForbiddenException(
        'Solo COCINA puede avanzar la preparación de items',
      );
    }
    if (
      nuevoEstado === EstadoItem.ENTREGADO &&
      rol !== RolUsuario.MESERO &&
      rol !== RolUsuario.ADMINISTRADOR
    ) {
      throw new ForbiddenException(
        'Solo el MESERO marca la entrega de un item',
      );
    }
    if (
      nuevoEstado === EstadoItem.ANULADO ||
      nuevoEstado === EstadoItem.PENDIENTE
    ) {
      throw new BadRequestException(
        'ANULADO se usa por el endpoint de anulación; PENDIENTE no se restaura',
      );
    }

    const item = await this.obtenerItem(itemId, ordenId);
    const orden = await this.obtenerOrdenBasica(ordenId);
    if (
      orden.estado === EstadoOrden.CERRADA ||
      orden.estado === EstadoOrden.ANULADA
    ) {
      throw new BadRequestException(
        `La orden ${orden.codigo_orden} está ${orden.estado} — no admite cambios`,
      );
    }

    // --- Máquina de estados del item ---
    const anterior = item.estado_item;
    const transiciones: Record<string, EstadoItem[]> = {
      [EstadoItem.PENDIENTE]: [EstadoItem.EN_PREPARACION, EstadoItem.LISTO],
      [EstadoItem.EN_PREPARACION]: [EstadoItem.LISTO],
      [EstadoItem.LISTO]: [EstadoItem.ENTREGADO],
      [EstadoItem.ENTREGADO]: [],
      [EstadoItem.ANULADO]: [],
    };
    if (!transiciones[anterior]?.includes(nuevoEstado)) {
      throw new BadRequestException(
        `Transición inválida: ${anterior} → ${nuevoEstado}`,
      );
    }

    await this.dataSource.query(
      `UPDATE detalle_orden SET estado_item = $1 WHERE id = $2`,
      [nuevoEstado, itemId],
    );

    const rec = await this.recalcularEstadoOrden(ordenId, orden.estado);

    this.realtime.emitirAHouse('item:estado', {
      ordenId: Number(ordenId),
      codigoOrden: orden.codigo_orden,
      itemId: Number(itemId),
      productoId: Number(item.producto_id),
      nombre: item.producto_nombre,
      estadoAnterior: anterior,
      estadoItem: nuevoEstado,
    });
    this.emitirEventosOrden(orden, orden.estado, rec);

    return this.obtenerPorId(ordenId);
  }

  /** Anula un item (cocina) — devuelve el stock a inventario */
  async anularItem(ordenId: number, itemId: number): Promise<any> {
    const item = await this.obtenerItem(itemId, ordenId);
    const orden = await this.obtenerOrdenBasica(ordenId);
    if (
      orden.estado === EstadoOrden.CERRADA ||
      orden.estado === EstadoOrden.ANULADA ||
      orden.estado === EstadoOrden.ENTREGADA
    ) {
      throw new BadRequestException(
        `La orden ${orden.codigo_orden} está ${orden.estado} — no admite cambios`,
      );
    }

    if (
      item.estado_item !== EstadoItem.PENDIENTE &&
      item.estado_item !== EstadoItem.EN_PREPARACION
    ) {
      throw new BadRequestException(
        `Solo se anulan items PENDIENTES o EN_PREPARACION (actual: ${item.estado_item})`,
      );
    }

    // Restaurar stock (suma atómica — sin riesgo de carreras)
    if (item.maneja_inventario) {
      await this.dataSource.query(
        `UPDATE productos SET stock_actual = stock_actual + $1 WHERE id = $2`,
        [item.cantidad, item.producto_id],
      );
    }

    await this.dataSource.query(
      `UPDATE detalle_orden SET estado_item = 'ANULADO' WHERE id = $1`,
      [itemId],
    );

    const rec = await this.recalcularEstadoOrden(ordenId, orden.estado);

    this.realtime.emitirAHouse('item:estado', {
      ordenId: Number(ordenId),
      codigoOrden: orden.codigo_orden,
      itemId: Number(itemId),
      productoId: Number(item.producto_id),
      nombre: item.producto_nombre,
      estadoAnterior: item.estado_item,
      estadoItem: EstadoItem.ANULADO,
    });
    this.emitirEventosOrden(orden, orden.estado, rec);

    return this.obtenerPorId(ordenId);
  }

  /** El mesero entrega la orden completa (debe estar LISTA) */
  async entregar(ordenId: number): Promise<any> {
    const orden = await this.obtenerOrdenBasica(ordenId);
    if (orden.estado !== EstadoOrden.LISTA) {
      throw new BadRequestException(
        `Solo se entregan órdenes LISTA (estado actual: ${orden.estado})`,
      );
    }

    await this.dataSource.query(
      `UPDATE detalle_orden SET estado_item = 'ENTREGADO'
        WHERE orden_id = $1 AND estado_item = 'LISTO'`,
      [ordenId],
    );
    await this.dataSource.query(
      `UPDATE ordenes SET estado = 'ENTREGADA' WHERE id = $1`,
      [ordenId],
    );

    this.emitirEventosOrden(orden, orden.estado, {
      nuevoEstado: EstadoOrden.ENTREGADA,
      esLista: false,
    });

    return this.obtenerPorId(ordenId);
  }

  /** Anula la orden completa (admin) — restaura stock y libera la mesa */
  async anular(ordenId: number): Promise<any> {
    const orden = await this.obtenerOrdenBasica(ordenId);
    if (
      orden.estado === EstadoOrden.CERRADA ||
      orden.estado === EstadoOrden.ANULADA ||
      orden.estado === EstadoOrden.ENTREGADA
    ) {
      throw new BadRequestException(
        `Una orden ${orden.estado} no se puede anular` +
          (orden.estado === EstadoOrden.ENTREGADA
            ? ' (fue entregada — se resuelve al cobrar)'
            : ''),
      );
    }

    await this.dataSource.transaction(async (manager) => {
      // Restaurar stock de items aún no anulados que manejan inventario
      const items: ItemRow[] = await manager.query(
        `SELECT d.id, d.orden_id, d.producto_id, d.cantidad, d.precio_unitario,
                d.notas, d.estado_item, p.nombre AS producto_nombre,
                p.maneja_inventario
           FROM detalle_orden d JOIN productos p ON p.id = d.producto_id
          WHERE d.orden_id = $1`,
        [ordenId],
      );
      for (const it of items) {
        if (it.estado_item !== EstadoItem.ANULADO && it.maneja_inventario) {
          await manager.query(
            `UPDATE productos SET stock_actual = stock_actual + $1 WHERE id = $2`,
            [it.cantidad, it.producto_id],
          );
        }
      }
      await manager.query(
        `UPDATE detalle_orden SET estado_item = 'ANULADO'
          WHERE orden_id = $1 AND estado_item <> 'ANULADO'`,
        [ordenId],
      );
      await manager.query(
        `UPDATE ordenes SET estado = 'ANULADA' WHERE id = $1`,
        [ordenId],
      );
      if (orden.mesa_id) {
        await manager.query(
          `UPDATE mesas SET estado = 'LIBRE' WHERE id = $1 AND estado = 'OCUPADA'`,
          [orden.mesa_id],
        );
      }
    });

    this.emitirEventosOrden(orden, orden.estado, {
      nuevoEstado: EstadoOrden.ANULADA,
      esLista: false,
    });

    return this.obtenerPorId(ordenId);
  }
}
