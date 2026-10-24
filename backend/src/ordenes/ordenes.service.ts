import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Orden, TipoConsumo, EstadoOrden } from './entities/orden.entity';
import { DetalleOrden, EstadoItem } from './entities/detalle-orden.entity';
import { CrearOrdenDto } from './dto/crear-orden.dto';
import { AgregarItemsOrdenDto } from './dto/agregar-items-orden.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CobrosService } from '../cobros/cobros.service';
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
    private readonly cobrosService: CobrosService,
  ) {}

  private async validarSinSubcuentas(
    ordenId: number,
    manager: EntityManager,
  ): Promise<void> {
    const filas: { existe: boolean }[] = await manager.query(
      `SELECT EXISTS (
       SELECT 1
       FROM subcuentas
       WHERE orden_id = $1
     ) AS existe`,
      [ordenId],
    );

    if (filas[0]?.existe) {
      throw new ConflictException(
        'La orden tiene una cuenta dividida. Debe deshacer la división antes de modificar sus productos o anular la orden.',
      );
    }
  }

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
        // Coordinar la creación de órdenes con el cierre de caja.
        // El bloqueo permanece activo hasta COMMIT o ROLLBACK.
        const cajasAbiertas = await manager.query(
          `SELECT id
           FROM cajas
           WHERE estado = 'ABIERTA'
           FOR UPDATE`,
        );

        if (cajasAbiertas.length === 0) {
          throw new ConflictException(
            'No se pueden crear órdenes sin una caja abierta',
          );
        }
        // 1. Código de orden secuencial por BD (atómico hasta con 50 meseros
        //    simultáneos — jamás dos órdenes con el mismo código)
        // Generar código único mediante secuencia PostgreSQL.
        // Evita códigos duplicados cuando se crean órdenes simultáneamente.
        const secuencia: { siguiente: string }[] = await manager.query(
          `SELECT nextval('public.seq_codigo_orden')::text AS siguiente`,
        );

        const codigoOrden = `ORD-${secuencia[0].siguiente.padStart(6, '0')}`;

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

  // ==================== AGREGAR PRODUCTOS A ORDEN EXISTENTE ====================

  async agregarItems(
    ordenId: number,
    meseroId: number,
    dto: AgregarItemsOrdenDto,
  ): Promise<any> {
    const usuarios = await this.dataSource.query(
      'SELECT id, nombre, rol, estado FROM usuarios WHERE id = $1',
      [meseroId],
    );

    if (!usuarios || usuarios.length === 0) {
      throw new NotFoundException('El usuario indicado no existe');
    }

    const usuario = usuarios[0];

    if (usuario.estado !== EstadoUsuario.ACTIVO) {
      throw new ForbiddenException('El usuario está INACTIVO');
    }

    if (
      usuario.rol !== RolUsuario.MESERO &&
      usuario.rol !== RolUsuario.ADMINISTRADOR
    ) {
      throw new ForbiddenException(
        'Solo MESEROS o ADMINISTRADORES pueden agregar productos',
      );
    }

    const orden = await this.obtenerOrdenBasica(ordenId);

    if (
      orden.estado === EstadoOrden.ENTREGADA ||
      orden.estado === EstadoOrden.CERRADA ||
      orden.estado === EstadoOrden.ANULADA
    ) {
      throw new BadRequestException(
        `La orden ${orden.codigo_orden} está ${orden.estado} y no admite nuevos productos`,
      );
    }
    const resultado = await this.dataSource.transaction(async (manager) => {
      const ordenesBloqueadas = await manager.query(
        `SELECT id, codigo_orden, estado
     FROM ordenes
    WHERE id = $1
    FOR UPDATE`,
        [ordenId],
      );

      if (ordenesBloqueadas.length === 0) {
        throw new NotFoundException(`No existe la orden ${ordenId}`);
      }

      const ordenActual = ordenesBloqueadas[0];

      if (
        ordenActual.estado === EstadoOrden.ENTREGADA ||
        ordenActual.estado === EstadoOrden.CERRADA ||
        ordenActual.estado === EstadoOrden.ANULADA
      ) {
        throw new BadRequestException(
          `La orden ${ordenActual.codigo_orden} está ${ordenActual.estado} y no admite nuevos productos`,
        );
      }

      await this.validarSinSubcuentas(ordenId, manager);
      const productosIds = dto.items.map((item) => item.productoId);

      const productos: ProductoRow[] = await manager.query(
        `SELECT id, nombre, precio, maneja_inventario,
          stock_actual, disponible_menu_dia
     FROM productos
    WHERE id = ANY($1::int[])`,
        [productosIds],
      );

      const mapaProductos = new Map<number, ProductoRow>();

      for (const producto of productos) {
        mapaProductos.set(Number(producto.id), producto);
      }

      for (const item of dto.items) {
        const producto = mapaProductos.get(item.productoId);

        if (!producto) {
          throw new BadRequestException(
            `El producto ${item.productoId} no existe`,
          );
        }

        if (!producto.disponible_menu_dia) {
          throw new BadRequestException(
            `El producto '${producto.nombre}' no está disponible en el menú del día`,
          );
        }
      }
      // Descontar inventario de forma atómica.
      // Si algún producto no tiene stock suficiente,
      // la transacción completa se revertirá.
      for (const item of dto.items) {
        const producto = mapaProductos.get(item.productoId);

        if (!producto || !producto.maneja_inventario) {
          continue;
        }

        const resultadoStock = await manager
          .createQueryBuilder()
          .update(Producto)
          .set({ stockActual: () => 'stock_actual - :cantidad' })
          .where(
            'id = :id AND maneja_inventario = TRUE AND stock_actual >= :cantidad',
            {
              id: item.productoId,
              cantidad: item.cantidad,
            },
          )
          .execute();

        if (!resultadoStock.affected) {
          throw new BadRequestException(
            `Stock insuficiente de '${producto.nombre}' para agregar ${item.cantidad} unidad(es)`,
          );
        }
      }

      // Insertar los nuevos productos en la orden existente.
      const detallesAgregados: any[] = [];

      for (const item of dto.items) {
        const producto = mapaProductos.get(item.productoId);

        if (!producto) {
          throw new BadRequestException(
            `El producto ${item.productoId} no existe`,
          );
        }

        const filas = await manager.query(
          `INSERT INTO detalle_orden
       (orden_id, producto_id, cantidad, precio_unitario, notas, estado_item)
     VALUES ($1, $2, $3, $4, $5, 'PENDIENTE')
     RETURNING id, orden_id, producto_id, cantidad,
               precio_unitario, notas, estado_item`,
          [
            ordenId,
            item.productoId,
            item.cantidad,
            producto.precio,
            item.notas ?? null,
          ],
        );

        detallesAgregados.push({
          ...filas[0],
          nombreProducto: producto.nombre,
        });
      }

      if (ordenActual.estado === EstadoOrden.LISTA) {
        await manager.query(
          `UPDATE ordenes
        SET estado = 'PROCESANDO'
      WHERE id = $1`,
          [ordenId],
        );
      }

      return {
        ordenId,
        cantidadItems: detallesAgregados.length,
        detallesAgregados,
      };
    });

    this.realtime.emitirAHouse('orden:items-agregados', {
      ordenId: Number(ordenId),
      codigoOrden: orden.codigo_orden,
      cantidadItems: resultado.cantidadItems,
      items: resultado.detallesAgregados,
    });

    if (orden.estado === EstadoOrden.LISTA) {
      this.realtime.emitirAHouse('orden:estado', {
        ordenId: Number(ordenId),
        codigoOrden: orden.codigo_orden,
        estadoAnterior: EstadoOrden.LISTA,
        estado: EstadoOrden.PROCESANDO,
        mesa: orden.mesa_id
          ? { id: Number(orden.mesa_id), numero: orden.mesa_numero }
          : null,
      });
    }

    return resultado;
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
  private async obtenerOrdenBasica(
    ordenId: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<OrdenBasicaRow> {
    const filas: OrdenBasicaRow[] = await manager.query(
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
  private async obtenerItem(
    itemId: number,
    ordenId: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ItemRow> {
    const filas: ItemRow[] = await manager.query(
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
    manager: EntityManager = this.dataSource.manager,
  ): Promise<{ nuevoEstado: EstadoOrden | null; esLista: boolean }> {
    const conteos: { estado_item: EstadoItem; n: number }[] =
      await manager.query(
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
        await manager.query(
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
      await manager.query(
        `UPDATE ordenes SET estado = 'ANULADA' WHERE id = $1`,
        [ordenId],
      );
      return { nuevoEstado: EstadoOrden.ANULADA, esLista: false };
    }

    if (
      estadoActual === EstadoOrden.CREADA ||
      estadoActual === EstadoOrden.PROCESANDO
    ) {
      await manager.query(`UPDATE ordenes SET estado = 'LISTA' WHERE id = $1`, [
        ordenId,
      ]);
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
    // Validar permisos según el estado solicitado
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

    // La transacción protege toda la operación, no solo la lectura.
    const resultado = await this.dataSource.transaction(async (manager) => {
      // 1. Bloquear la orden para evitar cambios simultáneos.
      await manager.query(`SELECT id FROM ordenes WHERE id = $1 FOR UPDATE`, [
        ordenId,
      ]);

      // 2. Consultar la orden dentro de la transacción.
      const orden = await this.obtenerOrdenBasica(ordenId, manager);

      if (
        orden.estado === EstadoOrden.CERRADA ||
        orden.estado === EstadoOrden.ANULADA ||
        orden.estado === EstadoOrden.ENTREGADA
      ) {
        throw new BadRequestException(
          `La orden ${orden.codigo_orden} está ${orden.estado} — no admite cambios`,
        );
      }

      // 3. Bloquear el item antes de validar su estado.
      await manager.query(
        `SELECT id
         FROM detalle_orden
        WHERE id = $1 AND orden_id = $2
        FOR UPDATE`,
        [itemId, ordenId],
      );

      const item = await this.obtenerItem(itemId, ordenId, manager);

      // 4. Validar las transiciones permitidas.
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

      // 5. Actualizar el item dentro de la transacción.
      await manager.query(
        `UPDATE detalle_orden
          SET estado_item = $1
        WHERE id = $2 AND orden_id = $3`,
        [nuevoEstado, itemId, ordenId],
      );

      // 6. Recalcular el estado de la orden en la misma transacción.
      const rec = await this.recalcularEstadoOrden(
        ordenId,
        orden.estado,
        manager,
      );

      return { orden, item, anterior, rec };
    });

    // 7. Solo emitir eventos después de confirmar la transacción.
    const { orden, item, anterior, rec } = resultado;

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
    const resultado = await this.dataSource.transaction(async (manager) => {
      // 1. Bloquear la orden para evitar modificaciones simultáneas.
      await manager.query(
        `SELECT id
         FROM ordenes
        WHERE id = $1
        FOR UPDATE`,
        [ordenId],
      );

      // 2. Consultar y validar el estado actual de la orden.
      const orden = await this.obtenerOrdenBasica(ordenId, manager);

      if (
        orden.estado === EstadoOrden.CERRADA ||
        orden.estado === EstadoOrden.ANULADA ||
        orden.estado === EstadoOrden.ENTREGADA
      ) {
        throw new BadRequestException(
          `La orden ${orden.codigo_orden} está ${orden.estado} — no admite cambios`,
        );
      }

      await this.validarSinSubcuentas(ordenId, manager);
      // 3. Bloquear el ítem antes de consultar su estado.
      await manager.query(
        `SELECT id
         FROM detalle_orden
        WHERE id = $1
          AND orden_id = $2
        FOR UPDATE`,
        [itemId, ordenId],
      );

      const item = await this.obtenerItem(itemId, ordenId, manager);

      // 4. Validar que el ítem todavía pueda anularse.
      if (
        item.estado_item !== EstadoItem.PENDIENTE &&
        item.estado_item !== EstadoItem.EN_PREPARACION
      ) {
        throw new BadRequestException(
          `Solo se anulan items PENDIENTES o EN_PREPARACION (actual: ${item.estado_item})`,
        );
      }

      // 5. Restaurar inventario dentro de la misma transacción.
      if (item.maneja_inventario) {
        await manager.query(
          `UPDATE productos
            SET stock_actual = stock_actual + $1
          WHERE id = $2`,
          [item.cantidad, item.producto_id],
        );
      }

      // 6. Marcar el ítem como anulado.
      await manager.query(
        `UPDATE detalle_orden
          SET estado_item = $1
        WHERE id = $2
          AND orden_id = $3`,
        [EstadoItem.ANULADO, itemId, ordenId],
      );

      // 7. Recalcular el estado de la orden en la misma transacción.
      const rec = await this.recalcularEstadoOrden(
        ordenId,
        orden.estado,
        manager,
      );

      return { orden, item, rec };
    });

    // 8. Emitir eventos únicamente después del COMMIT.
    const { orden, item, rec } = resultado;

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

    const ordenCerrada = await this.dataSource.transaction(
      async (manager): Promise<boolean> => {
        const filasOrden = await manager.query(
          `SELECT id, codigo_orden, estado
       FROM ordenes
      WHERE id = $1
      FOR UPDATE`,
          [ordenId],
        );

        if (filasOrden.length === 0) {
          throw new NotFoundException(`No existe la orden ${ordenId}`);
        }

        if (filasOrden[0].estado !== EstadoOrden.LISTA) {
          throw new BadRequestException(
            `Solo se entregan órdenes LISTA (estado actual: ${filasOrden[0].estado})`,
          );
        }

        await manager.query(
          `UPDATE detalle_orden SET estado_item = 'ENTREGADO'
      WHERE orden_id = $1 AND estado_item = 'LISTO'`,
          [ordenId],
        );

        await manager.query(
          `UPDATE ordenes SET estado = 'ENTREGADA' WHERE id = $1`,
          [ordenId],
        );

        // Intentar liquidar automáticamente la orden después de entregarla.
        // La orden ya está bloqueada mediante SELECT ... FOR UPDATE.
        return this.cobrosService.intentarLiquidarOrden(manager, ordenId);
      },
    );

    this.emitirEventosOrden(orden, orden.estado, {
      nuevoEstado: ordenCerrada ? EstadoOrden.CERRADA : EstadoOrden.ENTREGADA,
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
      const filasOrden = await manager.query(
        `SELECT id, codigo_orden, estado
     FROM ordenes
    WHERE id = $1
    FOR UPDATE`,
        [ordenId],
      );

      if (filasOrden.length === 0) {
        throw new NotFoundException(`No existe la orden ${ordenId}`);
      }

      const estadoActual = filasOrden[0].estado as EstadoOrden;

      if (
        estadoActual === EstadoOrden.CERRADA ||
        estadoActual === EstadoOrden.ANULADA ||
        estadoActual === EstadoOrden.ENTREGADA
      ) {
        throw new BadRequestException(
          `Una orden ${estadoActual} no se puede anular`,
        );
      }
      await this.validarSinSubcuentas(ordenId, manager);
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
          `UPDATE mesas
        SET estado = 'LIBRE'
      WHERE id = $1
        AND estado = 'OCUPADA'
        AND NOT EXISTS (
          SELECT 1
            FROM ordenes
           WHERE mesa_id = $1
             AND estado NOT IN ('ANULADA', 'CERRADA')
        )`,
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
