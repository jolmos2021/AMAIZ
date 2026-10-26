import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Caja, EstadoCaja } from './entities/caja.entity';
import { AbrirCajaDto } from './dto/abrir-caja.dto';
import { CerrarCajaDto } from './dto/cerrar-caja.dto';
import { RolUsuario } from '../usuarios/entities/usuario.entity';
import { CrearMovimientoCajaDto } from './dto/crear-movimiento-caja.dto';

/** Caja + nombre del cajero (JOIN manual — nunca la entidad Usuario completa) */
export interface CajaConCajero extends Caja {
  cajeroNombre: string | null;
  responsableCierreNombre: string | null;
}

export interface DetalleCierreCaja {
  montoInicial: number;
  totalIngresosManuales: number;
  totalEgresosManuales: number;
  totalPagos: number;
  totalAbonos: number;
  montoFinalCalculado: number; // efectivo esperado
  totalEfectivo: number;
  totalTarjeta: number;
  totalTransferencia: number;
  montoDeclarado: number;
  diferencia: number; // positiva = sobrante / negativa = faltante
}

@Injectable()
export class CajasService {
  constructor(
    @InjectRepository(Caja)
    private readonly repo: Repository<Caja>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ---------- Helpers ----------

  /** Dinero con 2 decimales — evita residuos de coma flotante en sumas */
  private redondear(n: number): number {
    return Math.round(n * 100) / 100;
  }

  private async conCajero(caja: Caja): Promise<CajaConCajero> {
    const filas = await this.dataSource.query(
      `SELECT apertura.nombre AS "cajeroNombre",
              cierre.nombre AS "responsableCierreNombre"
         FROM cajas c
         LEFT JOIN usuarios apertura ON apertura.id = c.usuario_id
         LEFT JOIN usuarios cierre ON cierre.id = c.usuario_cierre_id
        WHERE c.id = $1`,
      [caja.id],
    );
    return { ...caja, cajeroNombre: filas[0]?.cajeroNombre ?? null,
      responsableCierreNombre: filas[0]?.responsableCierreNombre ?? null };
  }

  // ---------- Consultas ----------

  /** La caja abierta actual (o null) — la consultarán frontend y futuros módulos */
  async obtenerCajaAbierta(): Promise<CajaConCajero | null> {
    const abierta = await this.repo.findOne({
      where: { estado: EstadoCaja.ABIERTA },
    });
    return abierta ? this.conCajero(abierta) : null;
  }

  async obtenerPorId(id: number): Promise<CajaConCajero> {
    const caja = await this.repo.findOne({ where: { id } });
    if (!caja) {
      throw new NotFoundException(`No existe una caja con id ${id}`);
    }
    return this.conCajero(caja);
  }

  /** Historial de cajas (más reciente primero) con nombre del cajero */
  async listar(): Promise<CajaConCajero[]> {
    const cajas = await this.repo.find({ order: { fechaApertura: 'DESC' } });
    if (cajas.length === 0) return [];

    const ids = [...new Set(cajas.flatMap((c) =>
      [c.usuarioId, c.usuarioCierreId].filter((id): id is number => id != null)))];
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const filas = await this.dataSource.query(
      `SELECT id, nombre FROM usuarios WHERE id IN (${placeholders})`,
      ids,
    );
    const nombres = new Map<number, string>(
      filas.map((f: { id: string | number; nombre: string }) => [
        Number(f.id),
        f.nombre,
      ]),
    );
    return cajas.map((c) => ({
      ...c,
      cajeroNombre: nombres.get(Number(c.usuarioId)) ?? null,
      responsableCierreNombre: c.usuarioCierreId == null
        ? null : nombres.get(Number(c.usuarioCierreId)) ?? null,
    }));
  }

  // ---------- Apertura ----------

  async abrir(usuarioId: number, dto: AbrirCajaDto): Promise<CajaConCajero> {
    // REGLA 1: solo UNA caja abierta a la vez en todo el sistema
    const abierta = await this.repo.findOne({
      where: { estado: EstadoCaja.ABIERTA },
    });
    if (abierta) {
      throw new ConflictException(
        `Ya existe una caja abierta (id ${abierta.id}) desde ${abierta.fechaApertura}. Debe cerrarla antes de abrir una nueva`,
      );
    }

    const nueva = this.repo.create({
      fechaApertura: new Date(),
      montoInicial: dto?.montoInicial ?? 0,
      usuarioId,
      estado: EstadoCaja.ABIERTA,
    });
    try {
      const guardada = await this.repo.save(nueva);
      return await this.conCajero(guardada);
    } catch (error: unknown) {
      const dbError = error as {
        code?: string;
        constraint?: string;
        driverError?: {
          code?: string;
          constraint?: string;
        };
      };

      const codigo = dbError.driverError?.code ?? dbError.code;

      const restriccion = dbError.driverError?.constraint ?? dbError.constraint;

      if (codigo === '23505' && restriccion === 'uq_cajas_unica_abierta') {
        throw new ConflictException(
          'Ya existe una caja abierta. Actualiza la pantalla antes de intentar nuevamente.',
        );
      }

      throw error;
    }
  }

  // ---------- Movimientos manuales de EFECTIVO ----------

  async registrarMovimiento(cajaId: number, usuarioId: number, rol: string, dto: CrearMovimientoCajaDto) {
    if (rol !== RolUsuario.CAJERO && rol !== RolUsuario.ADMINISTRADOR) {
      throw new ForbiddenException('Solo cajeros y administradores pueden registrar movimientos');
    }
    const concepto = dto.concepto?.trim();
    if (!concepto) throw new BadRequestException('El concepto es obligatorio');
    if (!Number.isFinite(dto.monto) || dto.monto <= 0 || Math.abs(Math.round(dto.monto * 100) - dto.monto * 100) > 1e-7) {
      throw new BadRequestException('El monto debe ser positivo y tener máximo dos decimales');
    }
    return this.dataSource.transaction(async (manager) => {
      const cajas: { id: string; estado: string }[] = await manager.query(
        'SELECT id, estado FROM cajas WHERE id = $1 FOR UPDATE', [cajaId],
      );
      if (!cajas.length) throw new NotFoundException(`No existe una caja con id ${cajaId}`);
      if (cajas[0].estado !== EstadoCaja.ABIERTA) {
        throw new BadRequestException('Solo se permiten movimientos en cajas abiertas');
      }
      const registros = await manager.query(
        `INSERT INTO movimientos_caja (caja_id, tipo, monto, concepto, usuario_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, caja_id AS "cajaId", tipo, monto::float8 AS monto,
                   concepto, usuario_id AS "usuarioId", fecha`,
        [cajaId, dto.tipo, dto.monto.toFixed(2), concepto, usuarioId],
      );
      return registros[0];
    });
  }

  async listarMovimientos(cajaId: number) {
    await this.obtenerPorId(cajaId);
    return this.dataSource.query(
      `SELECT m.id, m.caja_id AS "cajaId", m.tipo, m.monto::float8 AS monto,
              m.concepto, m.usuario_id AS "usuarioId", u.nombre AS "usuarioNombre", m.fecha
         FROM movimientos_caja m
         JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.caja_id = $1 ORDER BY m.fecha DESC, m.id DESC`,
      [cajaId],
    );
  }

  private async totalizarMovimientosManuales(cajaId: number, consultar: (sql: string, params: unknown[]) => Promise<any[]>) {
    const filas: { tipo: string; total: string }[] = await consultar(
      `SELECT tipo, COALESCE(SUM(monto), 0)::text AS total
         FROM movimientos_caja WHERE caja_id = $1 GROUP BY tipo`, [cajaId],
    );
    const total = (tipo: string) => this.redondear(Number(filas.find(f => f.tipo === tipo)?.total ?? 0));
    return { totalIngresosManuales: total('INGRESO'), totalEgresosManuales: total('EGRESO') };
  }

  // ---------- Cierre ----------

  async cerrar(
    cajaId: number,
    usuarioId: number,
    rol: string,
    dto: CerrarCajaDto,
  ): Promise<{ caja: CajaConCajero; detalle: DetalleCierreCaja }> {
    const resultado = await this.dataSource.transaction(async (manager) => {
      // 1. Bloquear la caja durante todo el cierre.
      const filas = await manager.query(
        `SELECT id, usuario_id, estado,
                monto_inicial::text AS monto_inicial
         FROM cajas
         WHERE id = $1
         FOR UPDATE`,
        [cajaId],
      );

      if (!filas.length) {
        throw new NotFoundException(`No existe una caja con id ${cajaId}`);
      }

      const caja = filas[0];

      if (caja.estado !== EstadoCaja.ABIERTA) {
        throw new BadRequestException(`La caja ${cajaId} no está abierta`);
      }

      // 2. Validar quién puede cerrar la caja.
      if (
        String(caja.usuario_id) !== String(usuarioId) &&
        rol !== RolUsuario.ADMINISTRADOR
      ) {
        throw new ForbiddenException(
          'Solo puede cerrar la caja quien la abrió (o un administrador)',
        );
      }

      // 3. Verificar órdenes pendientes.
      const pendientes: { total: number }[] = await manager.query(
        `SELECT COUNT(*)::int AS total
           FROM ordenes
           WHERE estado NOT IN ('CERRADA', 'ANULADA')`,
      );

      const totalPendientes = Number(pendientes[0]?.total ?? 0);

      if (totalPendientes > 0) {
        throw new BadRequestException(
          `No se puede cerrar la caja: existen ${totalPendientes} órdenes pendientes`,
        );
      }

      // 4. Totalizar pagos y abonos por método, sin duplicar créditos otorgados.
      const movimientos: { metodo: string; total: string; origen: string }[] =
        await manager.query(
          `SELECT origen, metodo, SUM(total)::text AS total
             FROM (
               SELECT 'PAGO' AS origen, mp.nombre AS metodo,
                      p.valor_pagado AS total
                 FROM pagos p
                 JOIN metodos_pago mp ON mp.id = p.metodo_pago_id
                WHERE p.caja_id = $1
               UNION ALL
               SELECT 'ABONO' AS origen, mp.nombre AS metodo,
                      a.valor_abonado AS total
                 FROM abonos_credito a
                 JOIN metodos_pago mp ON mp.id = a.metodo_pago_id
                WHERE a.caja_id = $1
             ) movimientos
            GROUP BY origen, metodo`,
          [cajaId],
        );

      const sumar = (metodo: string) => this.redondear(
        movimientos.filter((m) => m.metodo === metodo)
          .reduce((suma, m) => suma + Number(m.total), 0),
      );
      const sumarOrigen = (origen: string) => this.redondear(
        movimientos.filter((m) => m.origen === origen)
          .reduce((suma, m) => suma + Number(m.total), 0),
      );

      const montoInicial = Number(caja.monto_inicial);
      const totalPagos = sumarOrigen('PAGO');
      const totalAbonos = sumarOrigen('ABONO');
      const totalEfectivo = sumar('EFECTIVO');
      const totalTarjeta = sumar('TARJETA');
      const totalTransferencia = sumar('TRANSFERENCIA');
      const { totalIngresosManuales, totalEgresosManuales } =
        await this.totalizarMovimientosManuales(cajaId, (sql, params) => manager.query(sql, params));
      const montoFinalCalculado = this.redondear(
        montoInicial + totalEfectivo + totalIngresosManuales - totalEgresosManuales,
      );
      const montoDeclarado = this.redondear(dto.montoDeclarado);
      const diferencia = this.redondear(montoDeclarado - montoFinalCalculado);

      // 5. Cierre atómico y persistencia del arqueo.
      const actualizadas = await manager.query(
        `UPDATE cajas
            SET estado = 'CERRADA',
                fecha_cierre = NOW(),
                monto_final = $2,
                monto_declarado = $3,
                diferencia = $4,
                observaciones = $5,
                usuario_cierre_id = $6
          WHERE id = $1 AND estado = 'ABIERTA'
          RETURNING id`,
        [cajaId, montoFinalCalculado.toFixed(2), montoDeclarado.toFixed(2),
         diferencia.toFixed(2), dto.observaciones?.trim() || null, usuarioId],
      );
      if (!actualizadas.length) {
        throw new ConflictException('La caja cambió de estado durante el cierre');
      }

      const detalle: DetalleCierreCaja = {
        montoInicial: this.redondear(montoInicial),
        totalIngresosManuales,
        totalEgresosManuales,
        totalPagos,
        totalAbonos,
        totalEfectivo,
        totalTarjeta,
        totalTransferencia,
        montoFinalCalculado,
        montoDeclarado,
        diferencia,
      };
      return detalle;
    });

    // 8. Consultar la caja una vez confirmado el COMMIT.
    const cajaCerrada = await this.obtenerPorId(cajaId);

    return {
      caja: cajaCerrada,
      detalle: resultado,
    };
  }

  // ---------- Resumen en vivo (pantalla de caja / reportes) ----------

  async resumen(cajaId: number) {
    const caja = await this.obtenerPorId(cajaId);

    const pagosPorMetodoRaw = await this.dataSource.query(
      `SELECT mp.nombre AS metodo, COALESCE(SUM(p.valor_pagado), 0)::float8 AS total
         FROM pagos p JOIN metodos_pago mp ON mp.id = p.metodo_pago_id
        WHERE p.caja_id = $1 GROUP BY mp.nombre ORDER BY mp.nombre`,
      [cajaId],
    );
    const abonosPorMetodoRaw = await this.dataSource.query(
      `SELECT mp.nombre AS metodo, COALESCE(SUM(a.valor_abonado), 0)::float8 AS total
         FROM abonos_credito a JOIN metodos_pago mp ON mp.id = a.metodo_pago_id
        WHERE a.caja_id = $1 GROUP BY mp.nombre ORDER BY mp.nombre`,
      [cajaId],
    );

    const pagosPorMetodo: { metodo: string; total: number }[] =
      pagosPorMetodoRaw.map((r: { metodo: string; total: number }) => ({
        metodo: r.metodo,
        total: this.redondear(Number(r.total)),
      }));

    const abonosPorMetodo: { metodo: string; total: number }[] =
      abonosPorMetodoRaw.map((r: { metodo: string; total: number }) => ({
        metodo: r.metodo,
        total: this.redondear(Number(r.total)),
      }));

    const totalPagos = pagosPorMetodo.reduce((acc, p) => acc + p.total, 0);
    const totalAbonos = abonosPorMetodo.reduce((acc, a) => acc + a.total, 0);

    const totalEfectivo = this.redondear(
      [...pagosPorMetodo, ...abonosPorMetodo]
        .filter((m) => m.metodo === 'EFECTIVO')
        .reduce((total, m) => total + m.total, 0),
    );
    const totalTarjeta = this.redondear(
      [...pagosPorMetodo, ...abonosPorMetodo]
        .filter((m) => m.metodo === 'TARJETA')
        .reduce((total, m) => total + m.total, 0),
    );
    const totalTransferencia = this.redondear(
      [...pagosPorMetodo, ...abonosPorMetodo]
        .filter((m) => m.metodo === 'TRANSFERENCIA')
        .reduce((total, m) => total + m.total, 0),
    );

    const { totalIngresosManuales, totalEgresosManuales } =
      await this.totalizarMovimientosManuales(cajaId, (sql, params) => this.dataSource.query(sql, params));

    return {
      caja,
      pagosPorMetodo,
      abonosPorMetodo,
      totalPagos: this.redondear(totalPagos),
      totalAbonos: this.redondear(totalAbonos),
      totalEfectivo,
      totalTarjeta,
      totalTransferencia,
      totalIngresosManuales,
      totalEgresosManuales,
      montoFinalEsperado: this.redondear(
        caja.montoInicial + totalEfectivo + totalIngresosManuales - totalEgresosManuales,
      ),
    };
  }
}
