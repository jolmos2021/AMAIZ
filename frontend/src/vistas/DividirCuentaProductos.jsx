import { useEffect, useRef, useState } from "react";
import { dividirCuentaProductos, obtenerDetalleCobro, obtenerSubcuentasOrden } from "../api";

const dinero = (centavos) => `$${(centavos / 100).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const entero = (valor) => Number.isSafeInteger(valor) && valor >= 0;

function distribuir(total, pesos) {
  const bases = pesos.map((peso) => Math.floor(total * peso / 10000));
  let resto = total - bases.reduce((a, b) => a + b, 0);
  const orden = pesos.map((peso, i) => ({ i, resto: (total * peso) % 10000 }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (let j = 0; j < resto; j++) bases[orden[j].i]++;
  return bases;
}

export default function DividirCuentaProductos({ token, ordenId, onDivisionRegistrada }) {
  const [personas, setPersonas] = useState(["Persona 1", "Persona 2"]);
  const [detalle, setDetalle] = useState(null);
  const [existentes, setExistentes] = useState(null);
  const [config, setConfig] = useState({});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const enviando = useRef(false);

  useEffect(() => {
    let activo = true;
    setDetalle(null); setExistentes(null); setError(""); setConfig({});
    Promise.all([obtenerDetalleCobro(token, ordenId), obtenerSubcuentasOrden(token, ordenId)])
      .then(([d, s]) => {
        if (!activo) return;
        if (!Array.isArray(d?.items) || !Array.isArray(s)) throw new Error("Respuesta de cobros no válida.");
        setDetalle(d); setExistentes(s);
      })
      .catch((e) => { if (activo) setError(e.message); });
    return () => { activo = false; };
  }, [token, ordenId]);

  const items = (detalle?.items ?? []).filter((i) => i.estado_item !== "ANULADO");
  const actualizar = (id, cambios) => setConfig((anterior) => ({
    ...anterior, [id]: { ...anterior[id], ...cambios },
  }));
  const nombres = personas.map((p) => p.trim());
  const nombresValidos = nombres.every((p) => p.length > 0 && p.length <= 100)
    && new Set(nombres.map((p) => p.toLocaleLowerCase())).size === nombres.length;

  const calculos = items.map((item) => {
    const id = Number(item.id);
    const cantidad = Number(item.cantidad);
    const unitario = Math.round(Number(item.precio_unitario) * 100);
    const total = cantidad * unitario;
    const c = config[id] ?? {};
    const modo = c.modo ?? "COMPLETO";
    const seleccionados = c.seleccionados ?? [0, 1];
    const valores = c.valores ?? {};
    let partes = personas.map(() => 0);
    let mensaje = "";
    let asignaciones = [];
    if (!entero(total) || total <= 0 || !Number.isInteger(cantidad) || cantidad <= 0) {
      mensaje = "Cantidad o precio no válido.";
    } else if (modo === "COMPLETO") {
      const persona = Number(c.persona ?? 0);
      if (!entero(persona) || persona >= personas.length) mensaje = "Selecciona una persona.";
      else { partes[persona] = total; asignaciones = [{ persona, cantidad }]; }
    } else if (modo === "IGUALES") {
      const indices = [...new Set(seleccionados)].filter((i) => i >= 0 && i < personas.length);
      if (!indices.length || total < indices.length) mensaje = "Selecciona participantes; cada uno debe recibir al menos $0,01.";
      else {
        const base = Math.floor(total / indices.length);
        indices.forEach((i, pos) => { partes[i] = base + (pos < total % indices.length ? 1 : 0); });
        asignaciones = indices.map((persona) => ({ persona, importeAsignado: partes[persona] / 100 }));
      }
    } else if (modo === "PORCENTAJE") {
      const pesos = personas.map((_, i) => {
        const texto = String(valores[i] ?? "0").replace(",", ".");
        const n = Number(texto);
        return /^\d+(?:\.\d{1,2})?$/.test(texto) && n >= 0 ? Math.round(n * 100) : NaN;
      });
      if (pesos.some((p) => !entero(p)) || pesos.reduce((a, b) => a + b, 0) !== 10000) {
        mensaje = "Los porcentajes deben sumar exactamente 100% (máximo 2 decimales).";
      } else {
        partes = distribuir(total, pesos);
        if (partes.some((p, i) => pesos[i] > 0 && p === 0)) mensaje = "Una participación queda en $0,00.";
        else asignaciones = pesos.flatMap((peso, persona) => peso > 0 ? [{ persona, porcentaje: peso / 100 }] : []);
      }
    } else if (modo === "IMPORTE") {
      const importes = personas.map((_, i) => {
        const texto = String(valores[i] ?? "0").replace(",", ".");
        const n = Number(texto);
        return /^\d+(?:\.\d{1,2})?$/.test(texto) && n >= 0 ? Math.round(n * 100) : NaN;
      });
      if (importes.some((n) => !entero(n)) || importes.reduce((a, b) => a + b, 0) !== total) {
        mensaje = `Los importes deben sumar ${dinero(total)}.`;
      } else {
        partes = importes;
        asignaciones = partes.flatMap((importe, persona) => importe > 0 ? [{ persona, importeAsignado: importe / 100 }] : []);
      }
    }
    return { id, item, modo, total, partes, mensaje, asignaciones, seleccionados, valores, c };
  });
  const totales = personas.map((_, i) => calculos.reduce((s, c) => s + c.partes[i], 0));
  const totalOrden = calculos.reduce((s, c) => s + c.total, 0);
  const valido = !!detalle && existentes?.length === 0 && nombresValidos && calculos.length > 0
    && calculos.every((c) => !c.mensaje) && totales.every((n) => n > 0)
    && totales.reduce((a, b) => a + b, 0) === totalOrden;

  const guardar = async () => {
    if (!valido || guardando || enviando.current) return;
    if (!window.confirm(`¿Crear ${personas.length} subcuentas por ${dinero(totalOrden)}? Esta división no se puede repetir.`)) return;
    enviando.current = true; setGuardando(true); setError("");
    try {
      const subcuentas = await obtenerSubcuentasOrden(token, ordenId);
      if (!Array.isArray(subcuentas) || subcuentas.length) throw new Error("La orden ya tiene subcuentas o no se pudo comprobar su estado.");
      const payload = nombres.map((nombre, persona) => ({
        nombre,
        items: calculos.flatMap((c) => c.asignaciones.filter((a) => a.persona === persona)
          .map(({ persona: _persona, ...asignacion }) => ({ detalleOrdenId: c.id, ...asignacion }))),
      }));
      await dividirCuentaProductos(token, ordenId, payload);
      setExistentes([{ id: "registrada" }]);
      onDivisionRegistrada?.(ordenId);
    } catch (e) { setError(e.message || "No se pudo registrar la división."); }
    finally { setGuardando(false); enviando.current = false; }
  };

  return (
    <section className="tarjeta" style={{ marginTop: 16 }}>
      <h4>Dividir cuenta por productos</h4>
      <p>Asigna productos completos o comparte su valor por partes iguales, porcentajes o importes. No se modifica el cobro ni el estado de la orden.</p>
      {error && <p role="alert">{error}</p>}
      {existentes === null && !error && <p>Consultando productos y subcuentas...</p>}
      {existentes?.length > 0 && <p>La orden ya tiene subcuentas. No es posible dividirla nuevamente.</p>}
      {existentes?.length === 0 && detalle && <>
        <label>Personas (1 a 50): <input type="number" min="1" max="50" value={personas.length}
          onChange={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 50) {
            setPersonas((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? `Persona ${i + 1}`)); setConfig({});
          } }} /></label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "12px 0" }}>
          {personas.map((nombre, i) => <label key={i}>Persona {i + 1}<input maxLength={100} value={nombre}
            onChange={(e) => setPersonas((prev) => prev.map((v, j) => i === j ? e.target.value : v))} /></label>)}
        </div>
        {!nombresValidos && <p role="alert">Los nombres deben ser únicos y no estar vacíos.</p>}
        {calculos.map((c) => <div key={c.id} style={{ borderTop: "1px solid #aaa", padding: "12px 0" }}>
          <strong>{c.item.producto}</strong> — {c.item.cantidad} × {dinero(Math.round(Number(c.item.precio_unitario) * 100))} = {dinero(c.total)}
          <div><label>Repartir mediante: <select value={c.modo} onChange={(e) => actualizar(c.id, { modo: e.target.value, valores: {}, seleccionados: [0, 1] })}>
            <option value="COMPLETO">Producto completo para una persona</option>
            <option value="IGUALES">Compartido en partes iguales</option>
            <option value="PORCENTAJE">Porcentajes</option>
            <option value="IMPORTE">Importes personalizados</option>
          </select></label></div>
          {c.modo === "COMPLETO" && <label>Asignar a: <select value={c.c.persona ?? 0}
            onChange={(e) => actualizar(c.id, { persona: Number(e.target.value) })}>
            {personas.map((p, i) => <option key={i} value={i}>{p || `Persona ${i + 1}`}</option>)}
          </select></label>}
          {c.modo === "IGUALES" && <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {personas.map((p, i) => <label key={i}><input type="checkbox" checked={c.seleccionados.includes(i)}
              onChange={(e) => actualizar(c.id, { seleccionados: e.target.checked
                ? [...c.seleccionados, i].sort((a, b) => a - b)
                : c.seleccionados.filter((n) => n !== i) })} /> {p || `Persona ${i + 1}`}</label>)}
          </div>}
          {(c.modo === "PORCENTAJE" || c.modo === "IMPORTE") && <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {personas.map((p, i) => <label key={i}>{p || `Persona ${i + 1}`} ({c.modo === "PORCENTAJE" ? "%" : "$"})
              <input type="text" inputMode="decimal" style={{ width: 90 }} value={c.valores[i] ?? "0"}
                onChange={(e) => actualizar(c.id, { valores: { ...c.valores, [i]: e.target.value } })} /></label>)}
          </div>}
          <div>{personas.map((p, i) => c.partes[i] > 0 ? <span key={i} style={{ marginRight: 14 }}>{p || `Persona ${i + 1}`}: {dinero(c.partes[i])}</span> : null)}</div>
          {c.mensaje && <p role="alert">{c.mensaje}</p>}
        </div>)}
        <h4>Resumen de subcuentas</h4>
        {personas.map((p, i) => <p key={i}>{p || `Persona ${i + 1}`}: <strong>{dinero(totales[i])}</strong></p>)}
        <p>Total distribuido: <strong>{dinero(totales.reduce((a, b) => a + b, 0))}</strong> / {dinero(totalOrden)}</p>
        {totales.some((n) => n <= 0) && <p role="alert">Cada persona debe tener un importe positivo.</p>}
        <button type="button" disabled={!valido || guardando} onClick={guardar}>
          {guardando ? "Registrando división..." : "Confirmar división por productos"}
        </button>
      </>}
    </section>
  );
}
