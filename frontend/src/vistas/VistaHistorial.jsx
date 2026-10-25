import { useEffect, useMemo, useState } from "react";
import { obtenerHistorialOrdenes, obtenerSubcuentasOrden } from "../api";

const dinero = (valor) =>
  `$${Number(valor || 0).toLocaleString("es-CL", { maximumFractionDigits: 2 })}`;
const fechaLegible = (valor) =>
  valor ? new Date(valor).toLocaleString("es-CL") : "Sin fecha";

export default function VistaHistorial({ sesion }) {
  const [ordenes, setOrdenes] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("CERRADA");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [filtros, setFiltros] = useState({ desde: "", hasta: "" });
  const [seleccionada, setSeleccionada] = useState(null);
  const [subcuentas, setSubcuentas] = useState([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const token = sesion.accessToken;

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError("");
    obtenerHistorialOrdenes(token, filtros.desde, filtros.hasta)
      .then((datos) => {
        if (!activo) return;
        if (!Array.isArray(datos)) throw new Error("Respuesta de historial no válida.");
        setOrdenes(datos);
      })
      .catch((err) => { if (activo) setError(err.message); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [token, filtros, version]);

  useEffect(() => {
    if (!seleccionada) {
      setSubcuentas([]);
      setErrorDetalle("");
      return;
    }
    let activo = true;
    setCargandoDetalle(true);
    setErrorDetalle("");
    setSubcuentas([]);
    obtenerSubcuentasOrden(token, seleccionada.id)
      .then((datos) => {
        if (!activo) return;
        if (!Array.isArray(datos)) throw new Error("Respuesta de subcuentas no válida.");
        setSubcuentas(datos);
      })
      .catch((err) => { if (activo) setErrorDetalle(err.message); })
      .finally(() => { if (activo) setCargandoDetalle(false); });
    return () => { activo = false; };
  }, [token, seleccionada]);

  const filtradas = useMemo(() => ordenes.filter((orden) => {
    const coincideEstado = estado === "TODAS" || orden.estado === estado;
    const coincideTexto = String(orden.codigoOrden || "").toLowerCase()
      .includes(busqueda.trim().toLowerCase());
    return coincideEstado && coincideTexto;
  }), [ordenes, estado, busqueda]);

  const aplicarFechas = (e) => {
    e.preventDefault();
    if (desde && hasta && desde > hasta) {
      setError("La fecha inicial no puede ser posterior a la final.");
      return;
    }
    setSeleccionada(null);
    setFiltros({ desde, hasta });
    setVersion((n) => n + 1);
  };

  return (
    <section className="vista-historial">
      <h2>Historial de órdenes</h2>
      <p className="ayuda">Consulta de solo lectura. Las órdenes y sus pagos no se modifican aquí.</p>
      <form className="historial-filtros tarjeta" onSubmit={aplicarFechas}>
        <label>Desde <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label>Hasta <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        <button type="submit">Aplicar fechas</button>
      </form>
      <div className="historial-filtros tarjeta">
        <label>Buscar código
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej. ORD-000012" />
        </label>
        <label>Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="CERRADA">Cerradas</option>
            <option value="ANULADA">Anuladas</option>
            <option value="TODAS">Todos los estados</option>
          </select>
        </label>
        <button type="button" onClick={() => setVersion((n) => n + 1)}>Actualizar</button>
      </div>
      {cargando && <p>Cargando historial...</p>}
      {error && <p role="alert">Error: {error}</p>}
      {!cargando && !error && (
        <>
          <p>{filtradas.length} orden(es) encontradas.</p>
          {filtradas.length === 0 && <p>No hay órdenes con esos filtros.</p>}
          <div className="historial-listado">
            {filtradas.map((orden) => (
              <article className="tarjeta" key={orden.id}>
                <div className="historial-fila">
                  <div>
                    <strong>{orden.codigoOrden || `Orden ${orden.id}`}</strong>
                    <div>{fechaLegible(orden.fechaCreacion)}</div>
                    <small>{orden.tipoConsumo || "Sin tipo"} · {orden.estado}</small>
                  </div>
                  <div className="historial-acciones">
                    <strong>{dinero(orden.total)}</strong>
                    <button type="button" onClick={() => setSeleccionada((actual) => actual?.id === orden.id ? null : orden)}>
                      {seleccionada?.id === orden.id ? "Ocultar detalle" : "Ver detalle"}
                    </button>
                  </div>
                </div>
                {seleccionada?.id === orden.id && (
                  <div className="historial-detalle">
                    <p><strong>Estado:</strong> {orden.estado} · <strong>Mesero:</strong> {orden.mesero?.nombre || "No registrado"}</p>
                    <p><strong>Mesa:</strong> {orden.mesa?.numero ?? "Sin mesa"}</p>
                    <h4>Productos</h4>
                    {orden.items?.length ? (
                      <div className="historial-tabla-contenedor"><table className="historial-tabla">
                        <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th></tr></thead>
                        <tbody>{orden.items.map((item) => (
                          <tr key={item.id}>
                            <td>{item.nombre}{item.estadoItem === "ANULADO" ? " (anulado)" : ""}</td>
                            <td>{item.cantidad}</td><td>{dinero(item.precioUnitario)}</td>
                            <td>{dinero(Number(item.precioUnitario) * Number(item.cantidad))}</td>
                          </tr>
                        ))}</tbody>
                      </table></div>
                    ) : <p>Sin productos.</p>}
                    <h4>Subcuentas</h4>
                    {cargandoDetalle && <p>Cargando subcuentas...</p>}
                    {errorDetalle && <p role="alert">No se pudieron consultar las subcuentas: {errorDetalle}</p>}
                    {!cargandoDetalle && !errorDetalle && (
                      subcuentas.length ? <div className="historial-tabla-contenedor"><table className="historial-tabla">
                        <thead><tr><th>Persona</th><th>Asignado</th><th>Pagos</th><th>Crédito</th><th>Pendiente</th></tr></thead>
                        <tbody>{subcuentas.map((sub) => <tr key={sub.id}>
                          <td>{sub.nombre || `Persona ${sub.numero_persona}`}</td>
                          <td>{dinero(sub.total_asignado)}</td><td>{dinero(sub.total_pagado)}</td>
                          <td>{dinero(sub.total_credito)}</td><td>{dinero(sub.saldo_por_cubrir)}</td>
                        </tr>)}</tbody>
                      </table></div> : <p>Sin subcuentas registradas.</p>
                    )}
                    <p className="ayuda">Los importes de crédito reflejan lo aplicado a la orden; sus abonos se consultan en Créditos.</p>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
