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

/** Caja + nombre del cajero (JOIN manual — nunca la entidad Usuario completa) */
export interface CajaConCajero extends Caja {
  cajeroNombre: string | null;
}

export interface DetalleCierreCaja {
  montoInicial: number;
  totalPagos: number;
  totalAbonos: number;
  montoFinalCalculado: number;
  montoDeclarado?: number;
  diferencia?: number; // positiva = sobrante / negativa = faltante
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
      'SELECT nombre FROM usuarios WHERE id = $1',
      [caja.usuarioId],
    );
    return { ...caja, cajeroNombre: filas[0]?.nombre ?? null };
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

    const ids = [...new Set(cajas.map((c) => c.usuarioId))];
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
    const guardada = await this.repo.save(nueva);
    return this.conCajero(guardada);
  }

  // ---------- Cierre ----------

  async cerrar(
    cajaId: number,
    usuarioId: number,
    rol: string,
    dto: CerrarCajaDto,
  ): Promise<{ caja: CajaConCajero; detalle: DetalleCierreCaja }> {
    const caja = await this.repo.findOne({ where: { id: cajaId } });
    if (!caja) {
      throw new NotFoundException(`No existe una caja con id ${cajaId}`);
    }
    if (caja.estado === EstadoCaja.CERRADA) {
      throw new BadRequestException(`La caja ${cajaId} ya está cerrada`);
    }

    // REGLA 3: solo cierra quien abrió (o un ADMINISTRADOR)
    // String() a ambos lados: los bigint llegan como string desde el driver
    if (
      String(caja.usuarioId) !== String(usuarioId) &&
      rol !== RolUsuario.ADMINISTRADOR
    ) {
      throw new ForbiddenException(
        'Solo puede cerrar la caja quien la abrió (o un administrador)',
      );
    }

    // REGLA 2: no se cierra caja con órdenes pendientes en la casa
    const pendientes: { total: number }[] = await this.dataSource.query(
      "SELECT COUNT(*)::int AS total FROM ordenes WHERE estado NOT IN ('CERRADA','ANULADA')",
    );
    const totalPendientes = pendientes[0]?.total ?? 0;
    if (totalPendientes > 0) {
      throw new BadRequestException(
        `No se puede cerrar la caja: existen ${totalPendientes} órdenes pendientes`,
      );
    }

    // REGLA 4: monto_final lo calcula el sistema
    const pagosRow: { total: number }[] = await this.dataSource.query(
      'SELECT COALESCE(SUM(valor_pagado), 0)::float8 AS total FROM pagos WHERE caja_id = $1',
      [cajaId],
    );
    const abonosRow: { total: number }[] = await this.dataSource.query(
      'SELECT COALESCE(SUM(valor_abonado), 0)::float8 AS total FROM abonos_credito WHERE caja_id = $1',
      [cajaId],
    );
    const totalPagos = Number(pagosRow[0]?.total ?? 0);
    const totalAbonos = Number(abonosRow[0]?.total ?? 0);
    const montoFinalCalculado = this.redondear(
      caja.montoInicial + totalPagos + totalAbonos,
    );

    caja.fechaCierre = new Date();
    caja.montoFinal = montoFinalCalculado;
    caja.estado = EstadoCaja.CERRADA;
    const cerrada = await this.repo.save(caja);

    // REGLA 5: cuadre de caja (si el cajero declaró lo contado)
    const detalle: DetalleCierreCaja = {
      montoInicial: caja.montoInicial,
      totalPagos: this.redondear(totalPagos),
      totalAbonos: this.redondear(totalAbonos),
      montoFinalCalculado,
    };
    if (dto?.montoDeclarado !== undefined) {
      detalle.montoDeclarado = dto.montoDeclarado;
      detalle.diferencia = this.redondear(
        dto.montoDeclarado - montoFinalCalculado,
      );
    }

    return { caja: await this.conCajero(cerrada), detalle };
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

    return {
      caja,
      pagosPorMetodo,
      abonosPorMetodo,
      totalPagos: this.redondear(totalPagos),
      totalAbonos: this.redondear(totalAbonos),
      montoFinalEsperado: this.redondear(caja.montoInicial + totalPagos + totalAbonos),
    };
  }
}
