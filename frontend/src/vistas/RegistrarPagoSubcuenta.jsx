import { useEffect, useRef, useState } from "react";
import {
  obtenerMetodosPago,
  obtenerSubcuentasOrden,
  registrarPagoSubcuenta,
} from "../api";

const ORDEN_PRUEBA_ID = 11;

const moneda = (valor) =>
  `$${Number(valor).toLocaleString("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function RegistrarPagoSubcuenta({
  token,
  ordenId,
  versionActualizacion = 0,
  onPagoRegistrado,
}) {
  const [subcuentas, setSubcuentas] = useState([]);
  const [metodos, setMetodos] = useState([]);
  const [subcuentaId, setSubcuentaId] = useState("");
  const [metodoPagoId, setMetodoPagoId] = useState("");
  const [valor, setValor] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const envioEnProceso = useRef(false);

  const esOrdenPrueba = Number(ordenId) === ORDEN_PRUEBA_ID;

  useEffect(() => {
    let activo = true;

    setSubcuentas([]);
    setMetodos([]);
    setSubcuentaId("");
    setMetodoPagoId("");
    setValor("");
    setError("");
    setMensaje("");
    setCargando(true);

    if (!esOrdenPrueba || !token) {
      setCargando(false);
      return () => {
        activo = false;
      };
    }

    Promise.all([
      obtenerSubcuentasOrden(token, ordenId),
      obtenerMetodosPago(token),
    ])
      .then(([datosSubcuentas, datosMetodos]) => {
        if (!activo) return;

        if (!Array.isArray(datosSubcuentas)) {
          throw new Error("Respuesta de subcuentas no válida.");
        }

        if (!Array.isArray(datosMetodos)) {
          throw new Error("Respuesta de métodos de pago no válida.");
        }

        setSubcuentas(datosSubcuentas);

        const metodosDisponibles = datosMetodos.filter(
          (metodo) =>
            metodo.nombre?.trim().toLocaleUpperCase() !== "CRÉDITO" &&
            metodo.activo !== false,
        );

        setMetodos(metodosDisponibles);
      })
      .catch((err) => {
        if (activo) setError(err.message);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [token, ordenId, versionActualizacion, esOrdenPrueba]);

  const subcuentaSeleccionada = subcuentas.find(
    (subcuenta) => Number(subcuenta.id) === Number(subcuentaId),
  );

  const saldo = subcuentaSeleccionada
    ? Number(subcuentaSeleccionada.saldo_por_cubrir)
    : 0;

  const valorNumerico = Number(valor);
  const valorCentavos = Math.round(valorNumerico * 100);
  const saldoCentavos = Math.round(saldo * 100);

  const valorValido =
    valor.trim() !== "" &&
    Number.isFinite(valorNumerico) &&
    valorNumerico > 0 &&
    /^\d+(\.\d{1,2})?$/.test(valor.trim()) &&
    valorCentavos <= saldoCentavos;

  const metodoSeleccionado = metodos.find(
    (metodo) => Number(metodo.id) === Number(metodoPagoId),
  );

  const puedeConfirmar =
    esOrdenPrueba &&
    !cargando &&
    !guardando &&
    !envioEnProceso.current &&
    Boolean(token) &&
    Boolean(subcuentaSeleccionada) &&
    Boolean(metodoSeleccionado) &&
    saldoCentavos > 0 &&
    valorValido;

  const registrarPago = async () => {
    if (!puedeConfirmar || envioEnProceso.current) return;

    const confirmado = window.confirm(
      `¿Registrar realmente este pago?\n\n` +
        `Orden: ORD-000011\n` +
        `Subcuenta: ${subcuentaSeleccionada.nombre}\n` +
        `Método: ${metodoSeleccionado.nombre}\n` +
        `Importe: ${moneda(valorNumerico)}\n\n` +
        `Esta operación registrará un pago real en PostgreSQL.`,
    );

    if (!confirmado) return;

    envioEnProceso.current = true;
    setGuardando(true);
    setError("");
    setMensaje("");

    try {
      // Volver a consultar el saldo antes de enviar el pago.
      const datosActualizados = await obtenerSubcuentasOrden(token, ordenId);

      if (!Array.isArray(datosActualizados)) {
        throw new Error("No se pudo verificar el saldo actualizado.");
      }

      const subcuentaActual = datosActualizados.find(
        (subcuenta) => Number(subcuenta.id) === Number(subcuentaId),
      );

      if (!subcuentaActual) {
        throw new Error("La subcuenta ya no está disponible.");
      }

      const saldoActualCentavos = Math.round(
        Number(subcuentaActual.saldo_por_cubrir) * 100,
      );

      if (
        !Number.isFinite(saldoActualCentavos) ||
        saldoActualCentavos <= 0 ||
        valorCentavos > saldoActualCentavos
      ) {
        throw new Error(
          "El saldo de la subcuenta cambió. Actualiza los datos antes de continuar.",
        );
      }

      const resultado = await registrarPagoSubcuenta(
        token,
        ordenId,
        Number(subcuentaId),
        Number(metodoPagoId),
        valorNumerico,
      );

      setMensaje(
        `Pago registrado correctamente. ID de pago: ${resultado.pagoId}.`,
      );
      setValor("");
      setSubcuentaId("");
      setMetodoPagoId("");

      // Actualizar los datos locales.
      const nuevasSubcuentas = await obtenerSubcuentasOrden(token, ordenId);

      if (Array.isArray(nuevasSubcuentas)) {
        setSubcuentas(nuevasSubcuentas);
      }

      if (typeof onPagoRegistrado === "function") {
        try {
          await onPagoRegistrado(ordenId, resultado);
        } catch (errorActualizacion) {
          console.error(
            "El pago se registró, pero falló la actualización visual:",
            errorActualizacion,
          );
        }
      }
    } catch (err) {
      setError(err.message || "No se pudo completar la operación.");
    } finally {
      envioEnProceso.current = false;
      setGuardando(false);
    }
  };

  if (!esOrdenPrueba) {
    return null;
  }

  return (
    <section>
      <h4>Registrar pago individual</h4>

      <p>
        <small>
          Prueba controlada: los pagos están habilitados únicamente para la
          orden ORD-000011.
        </small>
      </p>

      {cargando && <p>Consultando información de cobro...</p>}

      {error && <p role="alert">Error: {error}</p>}

      {mensaje && <p role="status">{mensaje}</p>}

      {!cargando && (
        <div style={{ display: "grid", gap: "12px", maxWidth: "420px" }}>
          <label>
            Subcuenta
            <select
              value={subcuentaId}
              disabled={guardando}
              onChange={(e) => {
                setSubcuentaId(e.target.value);
                setValor("");
                setMensaje("");
              }}
            >
              <option value="">Seleccionar subcuenta</option>
              {subcuentas
                .filter((subcuenta) => Number(subcuenta.saldo_por_cubrir) > 0)
                .map((subcuenta) => (
                  <option key={subcuenta.id} value={subcuenta.id}>
                    {subcuenta.nombre} — {moneda(subcuenta.saldo_por_cubrir)}
                  </option>
                ))}
            </select>
          </label>

          {subcuentaSeleccionada && (
            <p>
              Saldo pendiente: <strong>{moneda(saldo)}</strong>
            </p>
          )}

          <label>
            Método de pago
            <select
              value={metodoPagoId}
              disabled={guardando}
              onChange={(e) => setMetodoPagoId(e.target.value)}
            >
              <option value="">Seleccionar método</option>
              {metodos.map((metodo) => (
                <option key={metodo.id} value={metodo.id}>
                  {metodo.nombre}
                </option>
              ))}
            </select>
          </label>

          <label>
            Importe del pago
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={valor}
              disabled={guardando || !subcuentaSeleccionada}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Ejemplo: 6740"
            />
          </label>

          {subcuentaSeleccionada && valor.trim() !== "" && !valorValido && (
            <p role="alert">
              Ingresa un importe válido, mayor que cero y que no supere el saldo
              pendiente.
            </p>
          )}

          <button
            type="button"
            disabled={!puedeConfirmar}
            onClick={registrarPago}
          >
            {guardando ? "Registrando pago..." : "Confirmar pago"}
          </button>
        </div>
      )}
    </section>
  );
}
