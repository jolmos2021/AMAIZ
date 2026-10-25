import { useCallback, useEffect, useState } from "react";
import {
  obtenerCreditos,
  obtenerMetodosPago,
  registrarAbonoCredito,
} from "../api";

export default function VistaCreditos({ sesion }) {
  const [creditos, setCreditos] = useState([]);
  const [metodos, setMetodos] = useState([]);
  const [creditoSeleccionadoId, setCreditoSeleccionadoId] = useState("");
  const [metodoPagoId, setMetodoPagoId] = useState("");
  const [valor, setValor] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const token = sesion.accessToken;

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError("");

    try {
      const [datosCreditos, datosMetodos] = await Promise.all([
        obtenerCreditos(token),
        obtenerMetodosPago(token),
      ]);

      if (!Array.isArray(datosCreditos)) {
        throw new Error("La respuesta de créditos no es válida.");
      }

      if (!Array.isArray(datosMetodos)) {
        throw new Error("La respuesta de métodos de pago no es válida.");
      }

      setCreditos(datosCreditos);
      setMetodos(
        datosMetodos.filter(
          (metodo) =>
            metodo.activo !== false &&
            String(metodo.nombre ?? "")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .trim()
              .toUpperCase() !== "CREDITO",
        ),
      );
    } catch (err) {
      setError(err.message || "No se pudieron consultar los créditos.");
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const formatoMonto = (importe) =>
    Number(importe ?? 0).toLocaleString("es-CL", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

  const pendientes = creditos.filter(
    (credito) =>
      credito.estado === "PENDIENTE" && Number(credito.saldo_pendiente) > 0,
  );

  const totalPendiente = pendientes.reduce(
    (total, credito) => total + Number(credito.saldo_pendiente || 0),
    0,
  );

  const creditoSeleccionado = creditos.find(
    (credito) => String(credito.id) === String(creditoSeleccionadoId),
  );

  const metodoSeleccionado = metodos.find(
    (metodo) => String(metodo.id) === String(metodoPagoId),
  );

  const valorNumerico = Number(valor);
  const valorCentavos = Math.round(valorNumerico * 100);
  const saldoCentavos = Math.round(
    Number(creditoSeleccionado?.saldo_pendiente ?? 0) * 100,
  );

  const valorValido =
    valor.trim() !== "" &&
    Number.isFinite(valorNumerico) &&
    /^\d+(\.\d{1,2})?$/.test(valor.trim()) &&
    Number.isSafeInteger(valorCentavos) &&
    valorCentavos > 0 &&
    valorCentavos <= saldoCentavos;

  const puedeRegistrar =
    !cargando &&
    !guardando &&
    Boolean(creditoSeleccionado) &&
    creditoSeleccionado?.estado === "PENDIENTE" &&
    saldoCentavos > 0 &&
    Boolean(metodoSeleccionado) &&
    valorValido;

  const registrarAbono = async (evento) => {
    evento.preventDefault();

    if (!puedeRegistrar) return;

    const importe = valorCentavos / 100;
    const saldo = saldoCentavos / 100;

    const confirmado = window.confirm(
      `¿Confirmas registrar este abono?\n\n` +
        `Cliente: ${creditoSeleccionado.cliente_nombre}\n` +
        `Orden: ${creditoSeleccionado.codigo_orden}\n` +
        `Método: ${metodoSeleccionado.nombre}\n` +
        `Abono: $${formatoMonto(importe)}\n` +
        `Saldo actual: $${formatoMonto(saldo)}\n` +
        `Saldo posterior: $${formatoMonto(saldo - importe)}\n\n` +
        `Esta operación registrará un movimiento real en PostgreSQL.`,
    );

    if (!confirmado) return;

    setGuardando(true);
    setError("");
    setMensaje("");

    try {
      const resultado = await registrarAbonoCredito(
        token,
        Number(creditoSeleccionado.id),
        importe,
        Number(metodoPagoId),
      );

      setMensaje(
        `Abono registrado correctamente por $${formatoMonto(
          resultado.valorAbonado ?? importe,
        )}. Saldo restante: $${formatoMonto(
          resultado.saldoPendiente,
        )}. Estado: ${resultado.estado}.`,
      );

      setValor("");
      setMetodoPagoId("");
      setCreditoSeleccionadoId("");

      await cargarDatos();
    } catch (err) {
      setError(
        err.message ||
          "No se pudo registrar el abono. Verifica el saldo y la caja abierta.",
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="vista-caja">
      <h2>Créditos de clientes</h2>

      <button
        type="button"
        onClick={cargarDatos}
        disabled={cargando || guardando}
      >
        {cargando ? "Actualizando..." : "Actualizar créditos"}
      </button>

      {error && <p role="alert">Error: {error}</p>}
      {mensaje && <p role="status">{mensaje}</p>}
      {cargando && <p>Consultando créditos...</p>}

      {!cargando && !error && (
        <>
          <div className="tarjeta">
            <h3>Resumen de deudas</h3>
            <p>
              <strong>Créditos pendientes:</strong> {pendientes.length}
            </p>
            <p>
              <strong>Total por cobrar:</strong> ${formatoMonto(totalPendiente)}
            </p>
            <p>
              <strong>Créditos registrados:</strong> {creditos.length}
            </p>
          </div>

          <div className="tarjeta">
            <h3>Registrar abono</h3>

            {pendientes.length === 0 ? (
              <p>No hay créditos pendientes de pago.</p>
            ) : (
              <form onSubmit={registrarAbono}>
                <p>
                  <label htmlFor="credito-cliente">Cliente y crédito</label>
                </p>
                <select
                  id="credito-cliente"
                  value={creditoSeleccionadoId}
                  onChange={(evento) => {
                    setCreditoSeleccionadoId(evento.target.value);
                    setValor("");
                    setError("");
                    setMensaje("");
                  }}
                  disabled={guardando}
                  required
                  style={{ width: "100%", marginBottom: 12 }}
                >
                  <option value="">Selecciona un crédito pendiente</option>
                  {pendientes.map((credito) => (
                    <option key={credito.id} value={credito.id}>
                      {credito.cliente_nombre} — {credito.codigo_orden} — saldo
                      ${formatoMonto(credito.saldo_pendiente)}
                    </option>
                  ))}
                </select>

                {creditoSeleccionado && (
                  <p>
                    <strong>Saldo actual:</strong> $
                    {formatoMonto(creditoSeleccionado.saldo_pendiente)}
                  </p>
                )}

                <p>
                  <label htmlFor="metodo-abono">Método de pago</label>
                </p>
                <select
                  id="metodo-abono"
                  value={metodoPagoId}
                  onChange={(evento) => setMetodoPagoId(evento.target.value)}
                  disabled={guardando}
                  required
                  style={{ width: "100%", marginBottom: 12 }}
                >
                  <option value="">Selecciona un método</option>
                  {metodos.map((metodo) => (
                    <option key={metodo.id} value={metodo.id}>
                      {metodo.nombre}
                    </option>
                  ))}
                </select>

                <p>
                  <label htmlFor="valor-abono">Importe del abono</label>
                </p>
                <input
                  id="valor-abono"
                  type="number"
                  min="0.01"
                  max={
                    creditoSeleccionado
                      ? Number(creditoSeleccionado.saldo_pendiente)
                      : undefined
                  }
                  step="0.01"
                  value={valor}
                  onChange={(evento) => setValor(evento.target.value)}
                  disabled={guardando}
                  required
                  placeholder="Ej.: 1000"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    marginBottom: 12,
                  }}
                />

                {creditoSeleccionado && valor.trim() !== "" && !valorValido && (
                  <p role="alert">
                    Introduce un importe positivo, de hasta dos decimales, que
                    no supere el saldo pendiente.
                  </p>
                )}

                <button type="submit" disabled={!puedeRegistrar}>
                  {guardando ? "Registrando abono..." : "Registrar abono"}
                </button>
              </form>
            )}
          </div>

          <div className="tarjeta">
            <h3>Listado de créditos</h3>

            {creditos.length === 0 ? (
              <p>No hay créditos registrados.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", textAlign: "left" }}>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Teléfono</th>
                      <th>Orden</th>
                      <th>Consumo</th>
                      <th>Valor original</th>
                      <th>Abonado</th>
                      <th>Saldo pendiente</th>
                      <th>Estado</th>
                      <th>Abonos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditos.map((credito) => (
                      <tr key={credito.id}>
                        <td>{credito.cliente_nombre}</td>
                        <td>{credito.cliente_telefono || "—"}</td>
                        <td>{credito.codigo_orden}</td>
                        <td>{credito.tipo_consumo}</td>
                        <td>${formatoMonto(credito.valor_total)}</td>
                        <td>${formatoMonto(credito.total_abonado)}</td>
                        <td>${formatoMonto(credito.saldo_pendiente)}</td>
                        <td>{credito.estado}</td>
                        <td>{credito.cantidad_abonos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
