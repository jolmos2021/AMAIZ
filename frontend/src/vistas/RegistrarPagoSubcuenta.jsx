import { useEffect, useRef, useState } from "react";
import {
  obtenerMetodosPago,
  obtenerSubcuentasOrden,
  registrarPagoSubcuenta,
  registrarCreditoSubcuenta,
  buscarClientes,
  crearCliente,
} from "../api";

const ORDEN_PRUEBA_ID = 11;
const moneda = (valor) =>
  `$${Number(valor).toLocaleString("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const normalizar = (texto) =>
  String(texto ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

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
  const [terminoCliente, setTerminoCliente] = useState("");
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState("");
  const [buscandoClientes, setBuscandoClientes] = useState(false);
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [telefonoNuevo, setTelefonoNuevo] = useState("");
  const [tipoNuevo, setTipoNuevo] = useState("NORMAL");
  const [creandoCliente, setCreandoCliente] = useState(false);
  const envioEnProceso = useRef(false);
  const busquedaEnProceso = useRef(0);
  const esOrdenPrueba = Number(ordenId) === ORDEN_PRUEBA_ID;

  useEffect(() => {
    let activo = true;
    busquedaEnProceso.current += 1;
    setSubcuentas([]);
    setMetodos([]);
    setSubcuentaId("");
    setMetodoPagoId("");
    setValor("");
    setError("");
    setClientes([]);
    setClienteId("");
    setTerminoCliente("");
    setMostrarNuevoCliente(false);
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
        setMetodos(datosMetodos.filter((metodo) => metodo.activo !== false));
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
  const metodoSeleccionado = metodos.find(
    (metodo) => Number(metodo.id) === Number(metodoPagoId),
  );
  const esCredito = normalizar(metodoSeleccionado?.nombre) === "CREDITO";
  const clienteSeleccionado = clientes.find(
    (cliente) => Number(cliente.id) === Number(clienteId),
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
  const tieneCredito = Number(subcuentaSeleccionada?.total_credito ?? 0) > 0;
  const puedeConfirmar =
    esOrdenPrueba &&
    !cargando &&
    !guardando &&
    !creandoCliente &&
    !envioEnProceso.current &&
    Boolean(token) &&
    Boolean(subcuentaSeleccionada) &&
    Boolean(metodoSeleccionado) &&
    saldoCentavos > 0 &&
    valorValido &&
    (!esCredito || (Boolean(clienteSeleccionado) && !tieneCredito));

  const consultarClientes = async () => {
    if (!token || buscandoClientes || guardando) return;
    const idBusqueda = ++busquedaEnProceso.current;
    setBuscandoClientes(true);
    setError("");
    try {
      const resultado = await buscarClientes(token, terminoCliente);
      if (idBusqueda !== busquedaEnProceso.current) return;
      if (!Array.isArray(resultado)) {
        throw new Error("Respuesta de clientes no válida.");
      }
      setClientes(resultado);
      setClienteId("");
    } catch (err) {
      if (idBusqueda === busquedaEnProceso.current) {
        setError(err.message || "No se pudieron buscar los clientes.");
      }
    } finally {
      if (idBusqueda === busquedaEnProceso.current) setBuscandoClientes(false);
    }
  };

  const registrarNuevoCliente = async () => {
    if (guardando || creandoCliente || !nombreNuevo.trim()) return;
    setCreandoCliente(true);
    setError("");
    setMensaje("");
    try {
      const nuevo = await crearCliente(token, {
        nombre: nombreNuevo.trim(),
        telefono: telefonoNuevo.trim() || undefined,
        tipo: tipoNuevo,
      });
      if (!nuevo?.id)
        throw new Error("El servidor no devolvió el ID del cliente.");
      busquedaEnProceso.current += 1;
      setBuscandoClientes(false);
      setClientes((anteriores) => [
        nuevo,
        ...anteriores.filter(
          (cliente) => Number(cliente.id) !== Number(nuevo.id),
        ),
      ]);
      setClienteId(String(nuevo.id));
      setMostrarNuevoCliente(false);
      setNombreNuevo("");
      setTelefonoNuevo("");
      setTipoNuevo("NORMAL");
      setMensaje(
        `Cliente ${nuevo.nombre} registrado. Aún no se ha creado ningún crédito.`,
      );
    } catch (err) {
      setError(err.message || "No se pudo registrar el cliente.");
    } finally {
      setCreandoCliente(false);
    }
  };

  const registrarOperacion = async () => {
    if (!puedeConfirmar || envioEnProceso.current) return;
    const credito = esCredito;
    const textoConfirmacion = credito
      ? `¿Registrar realmente este CRÉDITO?\n\n` +
        `Orden: ORD-000011\n` +
        `Subcuenta: ${subcuentaSeleccionada.nombre}\n` +
        `Cliente: ${clienteSeleccionado.nombre}\n` +
        `Importe: ${moneda(valorNumerico)}\n\n` +
        `Esta operación creará una deuda real del cliente en PostgreSQL.`
      : `¿Registrar realmente este pago?\n\n` +
        `Orden: ORD-000011\n` +
        `Subcuenta: ${subcuentaSeleccionada.nombre}\n` +
        `Método: ${metodoSeleccionado.nombre}\n` +
        `Importe: ${moneda(valorNumerico)}\n\n` +
        `Esta operación registrará un pago real en PostgreSQL.`;
    if (!window.confirm(textoConfirmacion)) return;

    envioEnProceso.current = true;
    setGuardando(true);
    setError("");
    setMensaje("");
    let operacionRegistrada = false;
    try {
      const datosActualizados = await obtenerSubcuentasOrden(token, ordenId);
      if (!Array.isArray(datosActualizados)) {
        throw new Error("No se pudo verificar el saldo actualizado.");
      }
      const subcuentaActual = datosActualizados.find(
        (subcuenta) => Number(subcuenta.id) === Number(subcuentaId),
      );
      if (!subcuentaActual)
        throw new Error("La subcuenta ya no está disponible.");
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
      if (credito && Number(subcuentaActual.total_credito ?? 0) > 0) {
        throw new Error("Esta subcuenta ya tiene un crédito registrado.");
      }

      const resultado = credito
        ? await registrarCreditoSubcuenta(
            token,
            ordenId,
            Number(subcuentaId),
            Number(clienteId),
            valorNumerico,
          )
        : await registrarPagoSubcuenta(
            token,
            ordenId,
            Number(subcuentaId),
            Number(metodoPagoId),
            valorNumerico,
          );
      operacionRegistrada = true;
      setMensaje(
        credito
          ? `Crédito registrado correctamente por ${moneda(valorNumerico)}.`
          : `Pago registrado correctamente. ID de pago: ${resultado.pagoId}.`,
      );
      setValor("");
      setSubcuentaId("");
      setMetodoPagoId("");
      setClienteId("");

      try {
        const nuevasSubcuentas = await obtenerSubcuentasOrden(token, ordenId);
        if (Array.isArray(nuevasSubcuentas)) setSubcuentas(nuevasSubcuentas);
      } catch (errorActualizacion) {
        console.error(
          "La operación se registró, pero falló la actualización de saldos:",
          errorActualizacion,
        );
      }
      if (typeof onPagoRegistrado === "function") {
        try {
          await onPagoRegistrado(ordenId, resultado);
        } catch (errorActualizacion) {
          console.error(
            "La operación se registró, pero falló la actualización visual:",
            errorActualizacion,
          );
        }
      }
    } catch (err) {
      if (operacionRegistrada) {
        console.error("Error posterior al registro:", err);
      } else {
        setError(err.message || "No se pudo completar la operación.");
      }
    } finally {
      envioEnProceso.current = false;
      setGuardando(false);
    }
  };

  if (!esOrdenPrueba) return null;

  return (
    <section>
      <h4>Registrar pago individual o crédito</h4>
      <p>
        <small>
          Prueba controlada: las operaciones están habilitadas únicamente para
          la orden ORD-000011.
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
              disabled={guardando || creandoCliente}
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
              disabled={guardando || creandoCliente}
              onChange={(e) => {
                setMetodoPagoId(e.target.value);
                setValor("");
                setClienteId("");
                setMensaje("");
              }}
            >
              <option value="">Seleccionar método</option>
              {metodos.map((metodo) => (
                <option key={metodo.id} value={metodo.id}>
                  {metodo.nombre}
                </option>
              ))}
            </select>
          </label>

          {esCredito && (
            <div
              style={{
                display: "grid",
                gap: "10px",
                border: "1px solid #aaa",
                borderRadius: "8px",
                padding: "12px",
              }}
            >
              <strong>Cliente responsable del crédito</strong>
              {tieneCredito && (
                <p role="alert">
                  Esta subcuenta ya tiene un crédito. No se permite registrar
                  otro.
                </p>
              )}
              <label>
                Buscar por nombre o teléfono
                <input
                  type="text"
                  value={terminoCliente}
                  disabled={guardando || creandoCliente}
                  onChange={(e) => setTerminoCliente(e.target.value)}
                  placeholder="Nombre o teléfono"
                />
              </label>
              <button
                type="button"
                onClick={consultarClientes}
                disabled={buscandoClientes || guardando || creandoCliente}
              >
                {buscandoClientes ? "Buscando..." : "Buscar clientes"}
              </button>
              <label>
                Cliente
                <select
                  value={clienteId}
                  disabled={guardando || creandoCliente}
                  onChange={(e) => setClienteId(e.target.value)}
                >
                  <option value="">Seleccionar cliente</option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nombre}
                      {cliente.telefono ? ` — ${cliente.telefono}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={guardando || creandoCliente}
                onClick={() => setMostrarNuevoCliente((actual) => !actual)}
              >
                {mostrarNuevoCliente
                  ? "Cancelar nuevo cliente"
                  : "Registrar nuevo cliente"}
              </button>
              {mostrarNuevoCliente && (
                <div style={{ display: "grid", gap: "10px" }}>
                  <label>
                    Nombre
                    <input
                      type="text"
                      maxLength={150}
                      value={nombreNuevo}
                      disabled={creandoCliente || guardando}
                      onChange={(e) => setNombreNuevo(e.target.value)}
                    />
                  </label>
                  <label>
                    Teléfono (opcional)
                    <input
                      type="text"
                      maxLength={20}
                      value={telefonoNuevo}
                      disabled={creandoCliente || guardando}
                      onChange={(e) => setTelefonoNuevo(e.target.value)}
                    />
                  </label>
                  <label>
                    Tipo de cliente
                    <select
                      value={tipoNuevo}
                      disabled={creandoCliente || guardando}
                      onChange={(e) => setTipoNuevo(e.target.value)}
                    >
                      <option value="NORMAL">NORMAL</option>
                      <option value="VIP">VIP</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={
                      creandoCliente || guardando || !nombreNuevo.trim()
                    }
                    onClick={registrarNuevoCliente}
                  >
                    {creandoCliente
                      ? "Registrando cliente..."
                      : "Guardar cliente"}
                  </button>
                  <small>
                    Guardar el cliente crea un registro real en PostgreSQL, pero
                    no registra ningún crédito.
                  </small>
                </div>
              )}
            </div>
          )}

          <label>
            {esCredito ? "Importe del crédito" : "Importe del pago"}
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={valor}
              disabled={guardando || creandoCliente || !subcuentaSeleccionada}
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
            onClick={registrarOperacion}
          >
            {guardando
              ? esCredito
                ? "Registrando crédito..."
                : "Registrando pago..."
              : esCredito
                ? "Confirmar crédito"
                : "Confirmar pago"}
          </button>
        </div>
      )}
    </section>
  );
}
