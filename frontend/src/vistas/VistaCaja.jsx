import { useEffect, useState } from "react";
import DetalleSubcuentas from "./DetalleSubcuentas";
import DividirCuentaIguales from "./DividirCuentaIguales";
import RegistrarPagoSubcuenta from "./RegistrarPagoSubcuenta";
import CobroCombinado from "./CobroCombinado";
import {
  obtenerCajaActual,
  listarCajas,
  abrirCaja,
  obtenerOrdenesActivas,
  obtenerSaldoOrden,
  obtenerResumenCaja,
  obtenerMovimientosCaja,
  registrarMovimientoCaja,
  cerrarCajaConArqueo,
  dividirCuentaIguales,
  obtenerSubcuentasOrden,
} from "../api";

export default function VistaCaja({ sesion }) {
  const [caja, setCaja] = useState(null);
  const [montoInicialApertura, setMontoInicialApertura] = useState("0");
  const [abriendoCaja, setAbriendoCaja] = useState(false);
  const [mensajeApertura, setMensajeApertura] = useState("");
  const [ordenes, setOrdenes] = useState([]);
  const [ordenSeleccionadaId, setOrdenSeleccionadaId] = useState(null);
  const [versionActualizacion, setVersionActualizacion] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [resumen, setResumen] = useState(null);
  const [errorResumen, setErrorResumen] = useState("");
  const [montoDeclarado, setMontoDeclarado] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [preparandoCobroCompleto, setPreparandoCobroCompleto] = useState(false);
  const [errorCobroCompleto, setErrorCobroCompleto] = useState("");
  const [mensajeArqueo, setMensajeArqueo] = useState("");
  const [cuentaCompleta, setCuentaCompleta] = useState(false);
  const [movimientos, setMovimientos] = useState([]);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(false);
  const [errorMovimientos, setErrorMovimientos] = useState("");
  const [tipoMovimiento, setTipoMovimiento] = useState("INGRESO");
  const [montoMovimiento, setMontoMovimiento] = useState("");
  const [conceptoMovimiento, setConceptoMovimiento] = useState("");
  const [registrandoMovimiento, setRegistrandoMovimiento] = useState(false);
  const [mensajeMovimiento, setMensajeMovimiento] = useState("");
  const [historialCajas, setHistorialCajas] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [errorHistorial, setErrorHistorial] = useState("");
  const [detalleHistorico, setDetalleHistorico] = useState(null);
  const [cargandoDetalleHistorico, setCargandoDetalleHistorico] = useState(false);
  const [errorDetalleHistorico, setErrorDetalleHistorico] = useState("");

  useEffect(() => {
    let activo = true;

    async function cargarDatos() {
      setCargando(true);
      setError("");

      try {
        const token = sesion.accessToken;

        const [cajaActual, ordenesActivas] = await Promise.all([
          obtenerCajaActual(token),
          obtenerOrdenesActivas(token),
        ]);

        if (!Array.isArray(ordenesActivas)) {
          throw new Error("La respuesta de órdenes no es válida.");
        }

        const resultados = await Promise.all(
          ordenesActivas.map(async (orden) => {
            try {
              const detalle = await obtenerSaldoOrden(token, orden.id);

              return {
                ...orden,
                totalCobrable: detalle.totalCobrable,
                saldoPorCubrir: detalle.saldoPorCubrir,
                cantidadSubcuentas: detalle.cantidadSubcuentas,
                errorCobro: null,
              };
            } catch (err) {
              return {
                ...orden,
                totalCobrable: null,
                saldoPorCubrir: null,
                cantidadSubcuentas: null,
                errorCobro: err.message,
              };
            }
          }),
        );

        if (activo) {
          setCaja(cajaActual);
          setOrdenes(resultados);
          setResumen(null);
          setErrorResumen("");
          setMovimientos([]);
          setErrorMovimientos("");
          if (cajaActual?.id) {
            setCargandoMovimientos(true);
            obtenerMovimientosCaja(token, cajaActual.id)
              .then((lista) => {
                if (!activo) return;
                if (!Array.isArray(lista)) throw new Error("Respuesta de movimientos no válida.");
                setMovimientos(lista);
              })
              .catch((e) => { if (activo) setErrorMovimientos(e.message); })
              .finally(() => { if (activo) setCargandoMovimientos(false); });
            obtenerResumenCaja(token, cajaActual.id)
              .then((r) => { if (activo) setResumen(r); })
              .catch((e) => { if (activo) setErrorResumen(e.message); });
          }
        }
      } catch (err) {
        if (activo) setError(err.message);
      } finally {
        if (activo) setCargando(false);
      }
    }

    cargarDatos();

    return () => {
      activo = false;
    };
  }, [sesion.accessToken]);

  useEffect(() => {
    let vigente = true;
    setCuentaCompleta(false);
    if (ordenSeleccionadaId == null) return () => { vigente = false; };
    obtenerSubcuentasOrden(sesion.accessToken, ordenSeleccionadaId)
      .then((subcuentas) => {
        if (vigente) setCuentaCompleta(
          Array.isArray(subcuentas) && subcuentas.length === 1 &&
          subcuentas[0].nombre === "Cuenta completa"
        );
      })
      .catch(() => { if (vigente) setCuentaCompleta(false); });
    return () => { vigente = false; };
  }, [sesion.accessToken, ordenSeleccionadaId, versionActualizacion]);

  const refrescarTrasCobro = async (ordenId, ordenCerrada) => {
    setVersionActualizacion((actual) => actual + 1);
    await actualizarResumen();
    if (ordenCerrada) {
      setOrdenes((actuales) => actuales.filter((o) => o.id !== ordenId));
      setOrdenSeleccionadaId(null);
    } else {
      await actualizarSaldoOrden(ordenId);
    }
  };

  const actualizarSaldoOrden = async (ordenId) => {
    try {
      const detalle = await obtenerSaldoOrden(sesion.accessToken, ordenId);

      setOrdenes((actuales) =>
        actuales.map((orden) =>
          orden.id === ordenId
            ? {
                ...orden,
                totalCobrable: detalle.totalCobrable,
                saldoPorCubrir: detalle.saldoPorCubrir,
                cantidadSubcuentas: detalle.cantidadSubcuentas,
                errorCobro: null,
              }
            : orden,
        ),
      );
    } catch (err) {
      setOrdenes((actuales) =>
        actuales.map((orden) =>
          orden.id === ordenId
            ? {
                ...orden,
                totalCobrable: null,
                saldoPorCubrir: null,
                cantidadSubcuentas: null,
                errorCobro: err.message,
              }
            : orden,
        ),
      );
    }
  };

  const prepararCobroCompleto = async (ordenId) => {
    setErrorCobroCompleto("");
    setPreparandoCobroCompleto(true);
    try {
      const saldo = await obtenerSaldoOrden(sesion.accessToken, ordenId);
      if (saldo.cantidadSubcuentas !== 0) {
        throw new Error("Esta orden ya tiene subcuentas. Utiliza el registro de pagos existente para evitar duplicados.");
      }
      await dividirCuentaIguales(sesion.accessToken, ordenId, ["Cuenta completa"]);
      setVersionActualizacion((actual) => actual + 1);
      await actualizarSaldoOrden(ordenId);
    } catch (err) {
      setErrorCobroCompleto(err.message || "No se pudo preparar el cobro completo.");
      await actualizarSaldoOrden(ordenId);
    } finally {
      setPreparandoCobroCompleto(false);
    }
  };

  const actualizarResumen = async () => {
    if (!caja?.id) return;
    try {
      const r = await obtenerResumenCaja(sesion.accessToken, caja.id);
      setResumen(r);
      setErrorResumen("");
    } catch (e) {
      setErrorResumen(e.message);
    }
  };

  const actualizarMovimientos = async (idCaja = caja?.id) => {
    if (!idCaja) return;
    setCargandoMovimientos(true);
    try {
      const lista = await obtenerMovimientosCaja(sesion.accessToken, idCaja);
      if (!Array.isArray(lista)) throw new Error("Respuesta de movimientos no válida.");
      setMovimientos(lista);
      setErrorMovimientos("");
    } catch (e) {
      setErrorMovimientos(e.message);
    } finally {
      setCargandoMovimientos(false);
    }
  };

  const confirmarMovimiento = async (evento) => {
    evento.preventDefault();
    if (!caja?.id || registrandoMovimiento) return;
    setMensajeMovimiento("");
    const textoMonto = montoMovimiento.trim();
    const monto = Number(textoMonto);
    const concepto = conceptoMovimiento.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(textoMonto) || !Number.isFinite(monto) || monto <= 0) {
      setMensajeMovimiento("Ingresa un monto positivo con máximo dos decimales (usa punto decimal).");
      return;
    }
    if (!concepto || concepto.length > 300) {
      setMensajeMovimiento("El concepto es obligatorio y no puede superar 300 caracteres.");
      return;
    }
    if (!window.confirm(`¿Registrar ${tipoMovimiento.toLowerCase()} de $${formatoMonto(monto)} en caja ${caja.id}?\nConcepto: ${concepto}\nSe guardará como movimiento contable real.`)) return;
    setRegistrandoMovimiento(true);
    try {
      const nuevo = await registrarMovimientoCaja(sesion.accessToken, caja.id, {
        tipo: tipoMovimiento,
        monto,
        concepto,
      });
      setMovimientos((actuales) => [nuevo, ...actuales.filter((m) => String(m.id) !== String(nuevo.id))]);
      setMontoMovimiento("");
      setConceptoMovimiento("");
      setMensajeMovimiento(`Movimiento ${nuevo.id} registrado correctamente.`);
      await Promise.all([actualizarResumen(), actualizarMovimientos(caja.id)]);
    } catch (e) {
      setMensajeMovimiento(`No se pudo confirmar el movimiento: ${e.message}. Si hubo un problema de conexión, consulta el historial antes de reintentarlo.`);
      await actualizarMovimientos(caja.id);
    } finally {
      setRegistrandoMovimiento(false);
    }
  };

  const actualizarHistorial = async () => {
    setCargandoHistorial(true);
    setErrorHistorial("");
    try {
      const lista = await listarCajas(sesion.accessToken);
      if (!Array.isArray(lista)) throw new Error("La respuesta del historial no es válida.");
      setHistorialCajas(lista.filter((item) => item.estado === "CERRADA"));
    } catch (e) {
      setErrorHistorial(e.message);
    } finally {
      setCargandoHistorial(false);
    }
  };

  const consultarCierreHistorico = async (cajaHistorica) => {
    if (detalleHistorico?.caja?.id === cajaHistorica.id) {
      setDetalleHistorico(null);
      return;
    }
    setCargandoDetalleHistorico(true);
    setErrorDetalleHistorico("");
    setDetalleHistorico(null);
    try {
      const resumenHistorico = await obtenerResumenCaja(sesion.accessToken, cajaHistorica.id);
      setDetalleHistorico({ caja: cajaHistorica, resumen: resumenHistorico });
    } catch (e) {
      setErrorDetalleHistorico(e.message);
    } finally {
      setCargandoDetalleHistorico(false);
    }
  };

  const confirmarApertura = async (evento) => {
    evento.preventDefault();
    if (abriendoCaja || caja) return;
    setMensajeApertura("");
    const monto = Number(montoInicialApertura);
    if (montoInicialApertura.trim() === "" || !Number.isFinite(monto) || monto < 0 ||
        !/^\d+(?:\.\d{1,2})?$/.test(montoInicialApertura.trim())) {
      setMensajeApertura("Ingresa un monto inicial válido, mayor o igual a cero y con máximo dos decimales.");
      return;
    }
    setAbriendoCaja(true);
    try {
      // Verificar nuevamente antes de enviar, por si otro cajero abrió el turno.
      const existente = await obtenerCajaActual(sesion.accessToken);
      if (existente) {
        setCaja(existente);
        setMensajeApertura(`La caja ${existente.id} ya está abierta. No se creó otra.`);
        return;
      }
      const nuevaCaja = await abrirCaja(sesion.accessToken, monto);
      setCaja(nuevaCaja);
      setMovimientos([]);
      setMontoInicialApertura("0");
      setResumen(null);
      setErrorResumen("");
      setMensajeApertura(`Caja ${nuevaCaja.id} abierta correctamente.`);
      try {
        const nuevoResumen = await obtenerResumenCaja(sesion.accessToken, nuevaCaja.id);
        setResumen(nuevoResumen);
      } catch (err) {
        setErrorResumen(err.message);
      }
    } catch (err) {
      setMensajeApertura(`No se pudo abrir la caja: ${err.message}`);
      // Si otro usuario la abrió al mismo tiempo, actualizar el estado visible.
      try {
        const actual = await obtenerCajaActual(sesion.accessToken);
        if (actual) {
          setCaja(actual);
          setResumen(await obtenerResumenCaja(sesion.accessToken, actual.id));
        }
      } catch { /* El mensaje original se mantiene. */ }
    } finally {
      setAbriendoCaja(false);
    }
  };

  const confirmarCierre = async (evento) => {
    evento.preventDefault();
    setMensajeArqueo("");
    if (ordenes.length > 0) {
      setMensajeArqueo("No se puede cerrar: existen órdenes activas. Resuélvelas antes del cierre.");
      return;
    }
    if (montoDeclarado.trim() === "" || !Number.isFinite(Number(montoDeclarado)) || Number(montoDeclarado) < 0) {
      setMensajeArqueo("Ingresa un monto contado válido, mayor o igual a cero.");
      return;
    }
    const diferencia = Number(montoDeclarado) - Number(resumen?.montoFinalEsperado ?? 0);
    if (!window.confirm(`¿Confirmas el cierre de caja ${caja.id}?\nEfectivo declarado: $${formatoMonto(montoDeclarado)}\nDiferencia: $${formatoMonto(diferencia)}\nEsta operación no se puede deshacer desde la pantalla.`)) return;
    setCerrando(true);
    try {
      await cerrarCajaConArqueo(sesion.accessToken, caja.id, Number(montoDeclarado), observaciones.trim());
      setMensajeArqueo("Caja cerrada correctamente. Actualiza la pantalla para consultar el estado.");
      setCaja(null);
      setResumen(null);
      setMovimientos([]);
    } catch (e) {
      setMensajeArqueo(`No se pudo cerrar la caja: ${e.message}`);
    } finally {
      setCerrando(false);
    }
  };

  const ordenSeleccionada = ordenes.find(
    (orden) => orden.id === ordenSeleccionadaId,
  );

  const formatoMonto = (valor) =>
    Number(valor).toLocaleString("es-CL", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

  return (
    <section className="vista-caja">
      <h2>Caja y Cobros</h2>

      {cargando && <p>Consultando información...</p>}
      {error && <p role="alert">Error: {error}</p>}

      {!cargando && !error && (
        <>
          <div className="tarjeta">
            <h3>Estado de caja</h3>

            {caja ? (
              <>
                <p>
                  <strong>Estado:</strong> {caja.estado}
                </p>
                <p>
                  <strong>Caja ID:</strong> {caja.id}
                </p>
                <p>
                  <strong>Cajero:</strong>{" "}
                  {caja.cajeroNombre || "No disponible"}
                </p>
                <p>
                  <strong>Fecha de apertura:</strong>{" "}
                  {caja.fechaApertura
                    ? new Date(caja.fechaApertura).toLocaleString()
                    : "No disponible"}
                </p>
                <p>
                  <strong>Monto inicial:</strong>{" "}
                  {formatoMonto(caja.montoInicial ?? 0)}
                </p>
              </>
            ) : (
              <>
                <p>No hay una caja abierta.</p>
                <form onSubmit={confirmarApertura}>
                  <p>
                    <label>
                      Monto inicial en efectivo ($){" "}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={montoInicialApertura}
                        onChange={(e) => setMontoInicialApertura(e.target.value)}
                        disabled={abriendoCaja}
                      />
                    </label>
                  </p>
                  <p><small>El responsable y la fecha de apertura se registran automáticamente al confirmar.</small></p>
                  <button type="submit" disabled={abriendoCaja}>
                    {abriendoCaja ? "Abriendo caja..." : "Abrir caja"}
                  </button>
                </form>
              </>
            )}
            {mensajeApertura && <p role="status">{mensajeApertura}</p>}
          </div>

          {caja && (
            <div className="tarjeta">
              <h3>Resumen financiero y arqueo — Caja {caja.id}</h3>
              {errorResumen && <p role="alert">No se pudo consultar el resumen: {errorResumen}</p>}
              {!resumen && !errorResumen && <p>Cargando resumen financiero...</p>}
              {resumen && (
                <>
                  <table style={{ width: "100%", maxWidth: 600, textAlign: "left" }}>
                    <tbody>
                      <tr><th>Monto inicial</th><td>${formatoMonto(caja.montoInicial)}</td></tr>
                      <tr><th>Pagos de órdenes en efectivo</th><td>${formatoMonto(resumen.pagosPorMetodo?.find((p) => p.metodo === "EFECTIVO")?.total ?? 0)}</td></tr>
                      <tr><th>Abonos a créditos en efectivo</th><td>${formatoMonto(resumen.abonosPorMetodo?.find((p) => p.metodo === "EFECTIVO")?.total ?? 0)}</td></tr>
                      <tr><th>Ingresos manuales en efectivo</th><td>+${formatoMonto(resumen.totalIngresosManuales ?? 0)}</td></tr>
                      <tr><th>Egresos manuales en efectivo</th><td>−${formatoMonto(resumen.totalEgresosManuales ?? 0)}</td></tr>
                      <tr><th>Efectivo esperado</th><td><strong>${formatoMonto(resumen.montoFinalEsperado)}</strong></td></tr>
                      <tr><th>Tarjetas</th><td>${formatoMonto(resumen.totalTarjeta)}</td></tr>
                      <tr><th>Transferencias</th><td>${formatoMonto(resumen.totalTransferencia)}</td></tr>
                      <tr><th>Total recibido (sin monto inicial)</th><td>${formatoMonto(Number(resumen.totalPagos) + Number(resumen.totalAbonos))}</td></tr>
                    </tbody>
                  </table>
                  <p><small>Los créditos otorgados no cuentan como dinero recibido hasta registrar sus abonos.</small></p>
                  <button type="button" onClick={actualizarResumen}>Actualizar resumen</button>
                  <h4>Arqueo y cierre de caja</h4>
                  <form onSubmit={confirmarCierre}>
                    <p>
                      <label>Efectivo contado físicamente ($){" "}
                        <input type="number" min="0" step="0.01" required value={montoDeclarado} onChange={(e) => setMontoDeclarado(e.target.value)} />
                      </label>
                    </p>
                    {montoDeclarado !== "" && Number.isFinite(Number(montoDeclarado)) && (
                      <p><strong>Diferencia (declarado - esperado):</strong> ${formatoMonto(Number(montoDeclarado) - Number(resumen.montoFinalEsperado))}</p>
                    )}
                    <p>
                      <label>Observaciones<br />
                        <textarea rows={3} maxLength={1000} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Explica sobrantes, faltantes u otras novedades" />
                      </label>
                    </p>
                    {ordenes.length > 0 && <p role="status">Cierre bloqueado: hay {ordenes.length} órdenes activas. Deben resolverse antes de cerrar.</p>}
                    <button type="submit" disabled={cerrando || ordenes.length > 0}>
                      {cerrando ? "Cerrando..." : "Confirmar cierre de caja"}
                    </button>
                  </form>
                </>
              )}
              {mensajeArqueo && <p role="status">{mensajeArqueo}</p>}
            </div>
          )}

          {caja && (
            <div className="tarjeta">
              <h3>Movimientos manuales de efectivo — Caja {caja.id}</h3>
              <p><small>Los ingresos y egresos modifican el efectivo esperado del arqueo. Cada registro es real y queda asociado al usuario de la sesión.</small></p>
              <form onSubmit={confirmarMovimiento}>
                <p>
                  <label>Tipo de movimiento{" "}
                    <select value={tipoMovimiento} onChange={(e) => setTipoMovimiento(e.target.value)} disabled={registrandoMovimiento}>
                      <option value="INGRESO">Ingreso de efectivo</option>
                      <option value="EGRESO">Egreso de efectivo</option>
                    </select>
                  </label>
                </p>
                <p>
                  <label>Monto ($){" "}
                    <input type="number" min="0.01" step="0.01" required value={montoMovimiento} onChange={(e) => setMontoMovimiento(e.target.value)} disabled={registrandoMovimiento} />
                  </label>
                </p>
                <p>
                  <label>Concepto o motivo<br />
                    <textarea rows={2} maxLength={300} required value={conceptoMovimiento} onChange={(e) => setConceptoMovimiento(e.target.value)} disabled={registrandoMovimiento} placeholder="Explica el origen o destino del efectivo" />
                  </label>
                </p>
                <button type="submit" disabled={registrandoMovimiento}>
                  {registrandoMovimiento ? "Registrando..." : `Registrar ${tipoMovimiento.toLowerCase()}`}
                </button>
              </form>
              {mensajeMovimiento && <p role="status">{mensajeMovimiento}</p>}
              <h4>Historial de movimientos manuales</h4>
              <button type="button" disabled={cargandoMovimientos || registrandoMovimiento} onClick={() => actualizarMovimientos()}>
                {cargandoMovimientos ? "Actualizando..." : "Actualizar movimientos"}
              </button>
              {errorMovimientos && <p role="alert">No se pudo consultar el historial: {errorMovimientos}</p>}
              {!cargandoMovimientos && !errorMovimientos && movimientos.length === 0 && <p>No hay movimientos manuales registrados.</p>}
              {movimientos.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", textAlign: "left" }}>
                    <thead><tr><th>ID</th><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Concepto</th><th>Usuario ID</th></tr></thead>
                    <tbody>
                      {[...movimientos].sort((a, b) => Number(b.id) - Number(a.id)).map((movimiento) => (
                        <tr key={movimiento.id}>
                          <td>{movimiento.id}</td>
                          <td>{movimiento.fecha ? new Date(movimiento.fecha).toLocaleString() : "—"}</td>
                          <td>{movimiento.tipo}</td>
                          <td>{movimiento.tipo === "EGRESO" ? "−" : "+"}${formatoMonto(movimiento.monto)}</td>
                          <td>{movimiento.concepto}</td>
                          <td>{movimiento.usuarioId ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="tarjeta">
            <h3>Historial de cierres de caja</h3>
            <p><small>Consulta de turnos cerrados. Esta sección no modifica registros ni cierra la caja actual.</small></p>
            <button type="button" onClick={actualizarHistorial} disabled={cargandoHistorial}>
              {cargandoHistorial ? "Consultando historial..." : "Consultar / actualizar historial"}
            </button>
            {errorHistorial && <p role="alert">{errorHistorial}</p>}
            {!cargandoHistorial && !errorHistorial && historialCajas.length === 0 &&
              <p>No hay cierres cargados. Pulsa «Consultar / actualizar historial».</p>}
            {historialCajas.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", textAlign: "left" }}>
                  <thead><tr><th>Caja</th><th>Apertura</th><th>Cierre</th><th>Responsable de apertura</th><th>Responsable de cierre</th><th>Esperado</th><th>Declarado</th><th>Diferencia</th><th>Detalle</th></tr></thead>
                  <tbody>
                    {historialCajas.map((item) => (
                      <tr key={item.id}>
                        <td>{item.id}</td>
                        <td>{item.fechaApertura ? new Date(item.fechaApertura).toLocaleString() : "—"}</td>
                        <td>{item.fechaCierre ? new Date(item.fechaCierre).toLocaleString() : "—"}</td>
                        <td>{item.cajeroNombre || `Usuario ${item.usuarioId}`}</td>
                        <td>{item.responsableCierreNombre || (item.usuarioCierreId ? `Usuario ${item.usuarioCierreId}` : "No registrado")}</td>
                        <td>${formatoMonto(item.montoFinal ?? 0)}</td>
                        <td>{item.montoDeclarado == null ? "No registrado" : `$${formatoMonto(item.montoDeclarado)}`}</td>
                        <td>{item.diferencia == null ? "No registrada" : `$${formatoMonto(item.diferencia)}`}</td>
                        <td><button type="button" disabled={cargandoDetalleHistorico} onClick={() => consultarCierreHistorico(item)}>
                          {detalleHistorico?.caja?.id === item.id ? "Ocultar" : "Ver detalle"}
                        </button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {cargandoDetalleHistorico && <p>Consultando detalle del cierre...</p>}
            {errorDetalleHistorico && <p role="alert">{errorDetalleHistorico}</p>}
            {detalleHistorico && (
              <div>
                <h4>Detalle de caja {detalleHistorico.caja.id}</h4>
                <p><strong>Responsable de cierre:</strong> {detalleHistorico.caja.responsableCierreNombre || (detalleHistorico.caja.usuarioCierreId ? `Usuario ${detalleHistorico.caja.usuarioCierreId}` : "No registrado")}</p>
                <p><strong>Observaciones:</strong> {detalleHistorico.caja.observaciones || "Sin observaciones"}</p>
                <p><strong>Monto inicial:</strong> ${formatoMonto(detalleHistorico.resumen.caja?.montoInicial ?? 0)}</p>
                <p><strong>Pagos:</strong> ${formatoMonto(detalleHistorico.resumen.totalPagos)}</p>
                <p><strong>Abonos a créditos:</strong> ${formatoMonto(detalleHistorico.resumen.totalAbonos)}</p>
                <p><strong>Efectivo recibido:</strong> ${formatoMonto(detalleHistorico.resumen.totalEfectivo)}</p>
                <p><strong>Tarjeta:</strong> ${formatoMonto(detalleHistorico.resumen.totalTarjeta)}</p>
                <p><strong>Transferencia:</strong> ${formatoMonto(detalleHistorico.resumen.totalTransferencia)}</p>
                <p><strong>Ingresos manuales:</strong> ${formatoMonto(detalleHistorico.resumen.totalIngresosManuales)}</p>
                <p><strong>Egresos manuales:</strong> ${formatoMonto(detalleHistorico.resumen.totalEgresosManuales)}</p>
                <p><strong>Efectivo esperado al cierre (registrado):</strong> ${formatoMonto(detalleHistorico.caja.montoFinal ?? 0)}</p>
                <p><strong>Efectivo declarado:</strong> {detalleHistorico.caja.montoDeclarado == null ? "No registrado" : `$${formatoMonto(detalleHistorico.caja.montoDeclarado)}`}</p>
                <p><strong>Diferencia:</strong> {detalleHistorico.caja.diferencia == null ? "No registrada" : `$${formatoMonto(detalleHistorico.caja.diferencia)}`}</p>
              </div>
            )}
          </div>

          <div className="tarjeta">
            <h3>Órdenes activas para cobro ({ordenes.length})</h3>

            {ordenes.length === 0 ? (
              <p>No hay órdenes activas.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", textAlign: "left" }}>
                  <thead>
                    <tr>
                      <th>Orden</th>
                      <th>Mesa</th>
                      <th>Estado</th>
                      <th>Total cobrable</th>
                      <th>Saldo por cubrir</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenes.map((orden) => (
                      <tr key={orden.id}>
                        <td>{orden.codigoOrden}</td>
                        <td>{orden.mesa?.numero ?? "Sin mesa"}</td>
                        <td>{orden.estado}</td>
                        <td>
                          {orden.errorCobro
                            ? `Error: ${orden.errorCobro}`
                            : orden.totalCobrable === null ||
                                !Number.isFinite(orden.totalCobrable)
                              ? "No disponible"
                              : `$${formatoMonto(orden.totalCobrable)}`}
                        </td>
                        <td>
                          {orden.errorCobro
                            ? "No disponible"
                            : orden.saldoPorCubrir === null ||
                                !Number.isFinite(orden.saldoPorCubrir)
                              ? "No disponible"
                              : `$${formatoMonto(orden.saldoPorCubrir)}`}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => setOrdenSeleccionadaId(orden.id)}
                          >
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {ordenSeleccionada && (
              <div className="tarjeta">
                <h3>Detalle de {ordenSeleccionada.codigoOrden}</h3>

                <p>
                  <strong>Mesa:</strong>{" "}
                  {ordenSeleccionada.mesa?.numero ?? "Sin mesa"}
                </p>
                <p>
                  <strong>Estado:</strong> {ordenSeleccionada.estado}
                </p>
                <p>
                  <strong>Total cobrable:</strong>{" "}
                  {ordenSeleccionada.totalCobrable === null
                    ? "No disponible"
                    : `$${formatoMonto(ordenSeleccionada.totalCobrable)}`}
                </p>
                <p>
                  <strong>Saldo por cubrir:</strong>{" "}
                  {ordenSeleccionada.saldoPorCubrir === null
                    ? "No disponible"
                    : `$${formatoMonto(ordenSeleccionada.saldoPorCubrir)}`}
                </p>

                <h4>Productos de la orden</h4>

                {!ordenSeleccionada.items?.length ? (
                  <p>No hay productos disponibles.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", textAlign: "left" }}>
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Cantidad</th>
                          <th>Precio unitario</th>
                          <th>Subtotal</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ordenSeleccionada.items.map((item) => (
                          <tr key={item.id}>
                            <td>{item.nombre}</td>
                            <td>{item.cantidad}</td>
                            <td>${formatoMonto(item.precioUnitario)}</td>
                            <td>
                              $
                              {formatoMonto(
                                Number(item.cantidad) *
                                  Number(item.precioUnitario),
                              )}
                            </td>
                            <td>
                              {item.estadoItem === "ANULADO"
                                ? "ANULADO - No cobrable"
                                : item.estadoItem}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {!ordenSeleccionada.errorCobro &&
                  ordenSeleccionada.saldoPorCubrir > 0 &&
                  ordenSeleccionada.cantidadSubcuentas === 0 && (
                    <div className="tarjeta">
                      <h4>Cobrar orden completa</h4>
                      <p>Sin dividir entre personas. Puedes combinar los métodos de pago activos, incluido crédito a cliente, hasta cubrir exactamente el saldo.</p>
                      <button
                        type="button"
                        disabled={preparandoCobroCompleto}
                        onClick={() => prepararCobroCompleto(ordenSeleccionada.id)}
                      >
                        {preparandoCobroCompleto ? "Preparando cobro..." : "Cobrar orden completa"}
                      </button>
                    </div>
                  )}
                {errorCobroCompleto && <p role="alert">{errorCobroCompleto}</p>}
                {cuentaCompleta && ordenSeleccionada.estado === "ENTREGADA" &&
                  ordenSeleccionada.saldoPorCubrir > 0 && (
                    <CobroCombinado
                      key={`combinado-${ordenSeleccionada.id}`}
                      token={sesion.accessToken}
                      ordenId={ordenSeleccionada.id}
                      saldo={ordenSeleccionada.saldoPorCubrir}
                      onCobroRegistrado={(resultado) =>
                        refrescarTrasCobro(ordenSeleccionada.id, resultado.ordenCerrada)
                      }
                    />
                  )}

                <DetalleSubcuentas
                  token={sesion.accessToken}
                  ordenId={ordenSeleccionada.id}
                  versionActualizacion={versionActualizacion}
                />

                {!ordenSeleccionada.errorCobro &&
                  ordenSeleccionada.saldoPorCubrir > 0 &&
                  ordenSeleccionada.cantidadSubcuentas === 0 && (
                    <DividirCuentaIguales
                      key={ordenSeleccionada.id}
                      token={sesion.accessToken}
                      ordenId={ordenSeleccionada.id}
                      totalCobrable={ordenSeleccionada.totalCobrable}
                      onDivisionRegistrada={(ordenId) => {
                        setVersionActualizacion((actual) => actual + 1);
                        actualizarSaldoOrden(ordenId);
                      }}
                    />
                  )}

                {!ordenSeleccionada.errorCobro &&
                  ordenSeleccionada.saldoPorCubrir > 0 &&
                  !cuentaCompleta && (
                    <RegistrarPagoSubcuenta
                      key={`pago-${ordenSeleccionada.id}`}
                      token={sesion.accessToken}
                      ordenId={ordenSeleccionada.id}
                      versionActualizacion={versionActualizacion}
                      onPagoRegistrado={(ordenId) => {
                        setVersionActualizacion((actual) => actual + 1);
                        actualizarResumen();
                        return actualizarSaldoOrden(ordenId);
                      }}
                    />
                  )}

                <button
                  type="button"
                  onClick={() => setOrdenSeleccionadaId(null)}
                >
                  Cerrar detalle
                </button>
              </div>
            )}

            <p>
              <small>
                El saldo por cubrir considera los pagos y créditos registrados
                en las subcuentas.
              </small>
            </p>
          </div>
        </>
      )}
    </section>
  );
}
