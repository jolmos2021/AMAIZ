import { useEffect, useMemo, useState } from "react";
import { API_URL, buscarClientes, obtenerMetodosPago } from "../api";

const centavos = (valor) => {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const moneda = (valor) => `$${(valor / 100).toLocaleString("es-CL", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;

export default function CobroCombinado({ token, ordenId, saldo, onCobroRegistrado }) {
  const [metodos, setMetodos] = useState([]);
  const [valores, setValores] = useState({});
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [cargando, setCargando] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError("");
    obtenerMetodosPago(token)
      .then((data) => {
        if (!vigente) return;
        if (!Array.isArray(data)) throw new Error("No se pudieron leer los métodos de pago.");
        if (data.some((m) => !["PAGO_INMEDIATO", "CREDITO_CLIENTE"].includes(m.tipo_procesamiento))) {
          throw new Error("Existe un método activo sin clasificación de procesamiento válida.");
        }
        setMetodos(data.filter((m) => m.activo !== false));
        setValores({});
        setClienteId("");
      })
      .catch((e) => { if (vigente) setError(e.message); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [token, ordenId]);

  const total = useMemo(
    () => metodos.reduce((s, m) => s + centavos(valores[m.id] || 0), 0),
    [metodos, valores],
  );
  const pendiente = centavos(saldo) - total;
  const pagos = metodos.filter((m) => centavos(valores[m.id]) > 0).map((m) => ({
    metodoPagoId: Number(m.id),
    valor: centavos(valores[m.id]) / 100,
    ...(m.tipo_procesamiento === "CREDITO_CLIENTE" ? { clienteId: Number(clienteId) } : {}),
  }));
  const requiereCliente = pagos.some((p) =>
    metodos.find((m) => Number(m.id) === p.metodoPagoId)?.tipo_procesamiento === "CREDITO_CLIENTE",
  );
  const cantidadCreditos = pagos.filter((p) =>
    metodos.find((m) => Number(m.id) === p.metodoPagoId)?.tipo_procesamiento === "CREDITO_CLIENTE",
  ).length;
  const importesValidos = metodos.every((m) => {
    const v = valores[m.id];
    return v === undefined || v === "" || (
      Number.isFinite(Number(v)) && Number(v) >= 0 &&
      Math.abs(Number(v) * 100 - Math.round(Number(v) * 100)) < 0.000001
    );
  });
  const valido = !cargando && !enviando && pagos.length > 0 &&
    pendiente === 0 && importesValidos && cantidadCreditos <= 1 &&
    (!requiereCliente || (Number.isSafeInteger(Number(clienteId)) && Number(clienteId) > 0));

  useEffect(() => {
    if (!requiereCliente) return;
    let vigente = true;
    setBuscando(true);
    buscarClientes(token, busqueda)
      .then((data) => {
        if (!vigente) return;
        if (!Array.isArray(data)) throw new Error("Respuesta de clientes no válida.");
        setClientes(data);
      })
      .catch((e) => { if (vigente) setError(e.message); })
      .finally(() => { if (vigente) setBuscando(false); });
    return () => { vigente = false; };
  }, [token, busqueda, requiereCliente]);

  async function confirmar(e) {
    e.preventDefault();
    setError("");
    setMensaje("");
    if (!valido) return;
    if (!window.confirm(`¿Confirmas cubrir ${moneda(total)} de esta orden? Los créditos generan una cuenta por cobrar y no dinero recibido.`)) return;
    setEnviando(true);
    try {
      const res = await fetch(`${API_URL}/cobros/orden/${ordenId}/pagar-combinado`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pagos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join("; ") : data.message || `Error HTTP ${res.status}`);
      setValores({});
      setMensaje("Cobro registrado correctamente.");
      await onCobroRegistrado?.(data);
    } catch (e) {
      setError(e.message || "No se pudo registrar el cobro.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tarjeta" style={{ border: "1px solid #e6d4b5", borderRadius: 16, padding: 20, marginTop: 16 }}>
      <h4 style={{ marginTop: 0 }}>Cobrar orden completa</h4>
      <p>Asigna el saldo exacto entre los métodos de pago activos. El crédito genera una cuenta por cobrar.</p>
      <p><strong>Total pendiente:</strong> {moneda(centavos(saldo))}</p>
      {cargando ? <p>Cargando métodos de pago...</p> : (
        <form onSubmit={confirmar}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {metodos.map((m) => (
              <label key={m.id} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <strong>{m.nombre} ($)</strong>
                <small>{m.tipo_procesamiento === "CREDITO_CLIENTE" ? "Cuenta por cobrar" : "Pago recibido"}</small>
                <input type="number" min="0" step="0.01" placeholder="0,00"
                  value={valores[m.id] ?? ""}
                  onChange={(e) => setValores((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  disabled={enviando} />
              </label>
            ))}
          </div>
          {requiereCliente && (
            <div style={{ marginTop: 16 }}>
              <label htmlFor="buscar-cliente-cobro"><strong>Cliente del crédito (obligatorio)</strong></label>
              <input id="buscar-cliente-cobro" type="search" value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setClienteId(""); }}
                placeholder="Buscar por nombre o teléfono" disabled={enviando}
                style={{ display: "block", width: "100%", maxWidth: 450, marginTop: 6 }} />
              <label htmlFor="cliente-cobro">Seleccionar cliente registrado</label>
              <select id="cliente-cobro" value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                disabled={enviando || buscando}
                style={{ display: "block", width: "100%", maxWidth: 450, marginTop: 6 }}>
                <option value="">{buscando ? "Buscando clientes..." : "Selecciona un cliente"}</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}{c.telefono ? ` — ${c.telefono}` : ""}</option>
                ))}
              </select>
              <small>El crédito quedará asociado al cliente seleccionado y podrá abonarse posteriormente.</small>
            </div>
          )}
          <hr style={{ margin: "18px 0" }} />
          <p><strong>Total asignado:</strong> {moneda(total)}</p>
          <p><strong>Diferencia por cubrir:</strong> {moneda(pendiente)}</p>
          {pendiente > 0 && <p role="status">Faltan {moneda(pendiente)} para completar el cobro.</p>}
          {pendiente < 0 && <p role="alert">El importe excede el saldo pendiente.</p>}
          {!importesValidos && <p role="alert">Los importes deben ser positivos y tener máximo dos decimales.</p>}
          {cantidadCreditos > 1 && <p role="alert">Solo se admite un crédito por subcuenta.</p>}
          {requiereCliente && !clienteId && <p role="status">Selecciona el cliente del crédito.</p>}
          <button type="submit" disabled={!valido}>
            {enviando ? "Registrando..." : "Confirmar cobro completo"}
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {mensaje && <p role="status">{mensaje}</p>}
    </div>
  );
}
