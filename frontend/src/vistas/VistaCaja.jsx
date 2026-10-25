import { useEffect, useState } from "react";
import DetalleSubcuentas from "./DetalleSubcuentas";
import DividirCuentaIguales from "./DividirCuentaIguales";
import RegistrarPagoSubcuenta from "./RegistrarPagoSubcuenta";
import {
  obtenerCajaActual,
  obtenerOrdenesActivas,
  obtenerSaldoOrden,
} from "../api";

export default function VistaCaja({ sesion }) {
  const [caja, setCaja] = useState(null);
  const [ordenes, setOrdenes] = useState([]);
  const [ordenSeleccionadaId, setOrdenSeleccionadaId] = useState(null);
  const [versionActualizacion, setVersionActualizacion] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

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
                errorCobro: null,
              };
            } catch (err) {
              return {
                ...orden,
                totalCobrable: null,
                saldoPorCubrir: null,
                errorCobro: err.message,
              };
            }
          }),
        );

        if (activo) {
          setCaja(cajaActual);
          setOrdenes(resultados);
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
                errorCobro: err.message,
              }
            : orden,
        ),
      );
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
              <p>No hay una caja abierta.</p>
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

                <DetalleSubcuentas
                  token={sesion.accessToken}
                  ordenId={ordenSeleccionada.id}
                  versionActualizacion={versionActualizacion}
                />

                {!ordenSeleccionada.errorCobro &&
                  ordenSeleccionada.saldoPorCubrir > 0 && (
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
                  ordenSeleccionada.saldoPorCubrir > 0 && (
                    <RegistrarPagoSubcuenta
                      key={`pago-${ordenSeleccionada.id}`}
                      token={sesion.accessToken}
                      ordenId={ordenSeleccionada.id}
                      versionActualizacion={versionActualizacion}
                      onPagoRegistrado={(ordenId) => {
                        setVersionActualizacion((actual) => actual + 1);
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
