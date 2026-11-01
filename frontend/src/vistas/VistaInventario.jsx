import { useCallback, useEffect, useMemo, useState } from "react";
import { ajustarStockProducto, obtenerProductosInventario, obtenerCategoriasAdmin, eliminarProductoAdmin } from "../api";
import FormularioProducto from "./FormularioProducto";

const campo = { padding: "9px 10px", border: "1px solid #c9c9c9", borderRadius: 8, maxWidth: "100%" };
const boton = { padding: "9px 14px", borderRadius: 8, cursor: "pointer" };

export default function VistaInventario({ sesion }) {
  const token = sesion?.accessToken;
  const autorizado = sesion?.usuario?.rol === "ADMINISTRADOR";
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [formulario, setFormulario] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [filtro, setFiltro] = useState("");
  const [seleccion, setSeleccion] = useState("");
  const [tipo, setTipo] = useState("entrada");
  const [cantidad, setCantidad] = useState("");

  const cargar = useCallback(async () => {
    if (!autorizado || !token) return;
    setCargando(true);
    setError("");
    try {
      const datos = await obtenerProductosInventario(token);
      if (!Array.isArray(datos)) throw new Error("La respuesta de productos no es válida.");
      setProductos(datos);
      const cats = await obtenerCategoriasAdmin(token);
      setCategorias(Array.isArray(cats) ? cats : []);
    } catch (e) {
      setError(e?.message || "No fue posible consultar el inventario.");
    } finally {
      setCargando(false);
    }
  }, [token, autorizado]);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = useMemo(() => productos.filter((p) =>
    p.manejaInventario === true &&
    `${p.nombre} ${p.categoria?.nombre || ""}`.toLocaleLowerCase().includes(filtro.toLocaleLowerCase())
  ), [productos, filtro]);
  const elegible = productos.find((p) => String(p.id) === seleccion);

  async function registrar(evento) {
    evento.preventDefault();
    if (guardando || !elegible || !elegible.manejaInventario) return;
    const unidades = Number(cantidad);
    if (!Number.isSafeInteger(unidades) || unidades <= 0) {
      setError("Ingresa una cantidad entera mayor que cero.");
      return;
    }
    const delta = tipo === "entrada" ? unidades : -unidades;
    if (delta < 0 && unidades > Number(elegible.stockActual)) {
      setError("La salida supera las existencias disponibles.");
      return;
    }
    if (!window.confirm(`¿Confirmar ${tipo === "entrada" ? "entrada" : "salida"} de ${unidades} unidad(es) de ${elegible.nombre}?`)) return;
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const actualizado = await ajustarStockProducto(token, elegible.id, delta);
      setProductos((actuales) => actuales.map((p) => String(p.id) === String(elegible.id) ? { ...p, ...actualizado } : p));
      setCantidad("");
      setAviso(`Stock actualizado: ${elegible.nombre} — ${actualizado.stockActual} unidad(es).`);
      // Refrescar desde servidor para reflejar cambios simultáneos.
      await cargar();
    } catch (e) {
      setError(e?.message || "No fue posible ajustar el stock.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrarProducto(p) {
    if (!window.confirm(`¿Eliminar definitivamente '${p.nombre}'? Solo se permite si no tiene registros relacionados.`)) return;
    setError(""); setAviso(""); setGuardando(true);
    try {
      await eliminarProductoAdmin(token, p.id);
      if (seleccion === String(p.id)) setSeleccion("");
      setFormulario(null);
      await cargar();
      setAviso(`Producto '${p.nombre}' eliminado.`);
    } catch (e) { setError(e?.message || "No se pudo eliminar el producto."); }
    finally { setGuardando(false); }
  }

  if (!autorizado) return <section><h2>Inventario</h2><p>Acceso reservado al administrador.</p></section>;

  return (
    <section className="vista-inventario" style={{ padding: "8px 0 28px" }}>
      <h2>Inventario</h2>
      <p>Administra productos con control de inventario y registra entradas o salidas.</p>
      <button type="button" style={boton} onClick={() => { setFormulario({ nuevo: true }); setSeleccion(""); }} disabled={guardando}>+ Crear producto</button>
      {formulario && <FormularioProducto key={formulario.nuevo ? "nuevo" : formulario.producto.id} sesion={sesion} producto={formulario.producto} categorias={categorias} inventario alGuardar={async () => { await cargar(); setFormulario(null); setAviso("Producto guardado correctamente."); }} alCancelar={() => setFormulario(null)} />}
      {error && <p role="alert" style={{ color: "#a21c1c" }}>{error}</p>}
      {aviso && <p role="status" style={{ color: "#236333" }}>{aviso}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", margin: "18px 0" }}>
        <input style={{ ...campo, flex: "1 1 240px" }} aria-label="Buscar productos" placeholder="Buscar por producto o categoría" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        <button style={boton} type="button" onClick={cargar} disabled={cargando || guardando}>{cargando ? "Consultando…" : "Actualizar listado"}</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead><tr><th style={{ padding: 10 }}>Producto</th><th style={{ padding: 10 }}>Categoría</th><th style={{ padding: 10 }}>Inventario</th><th style={{ padding: 10 }}>Existencias</th><th style={{ padding: 10 }}>Menú del día</th><th style={{ padding: 10 }}>Acción</th></tr></thead>
          <tbody>
            {filtrados.map((p) => <tr key={p.id} style={{ borderTop: "1px solid #ddd" }}>
              <td style={{ padding: 10 }}>{p.nombre}</td>
              <td style={{ padding: 10 }}>{p.categoria?.nombre || "—"}</td>
              <td style={{ padding: 10 }}>{p.manejaInventario ? "Controlado" : "No aplica"}</td>
              <td style={{ padding: 10, fontWeight: "bold" }}>{p.manejaInventario ? p.stockActual : "—"}</td>
              <td style={{ padding: 10 }}>{p.disponibleMenuDia ? "Visible" : "Oculto"}</td>
              <td style={{ padding: 10 }}><button type="button" style={boton} disabled={!p.manejaInventario || guardando} onClick={() => { setSeleccion(String(p.id)); setCantidad(""); setError(""); setAviso(""); }}>Ajustar</button> <button type="button" style={boton} disabled={guardando} onClick={() => { setFormulario({ producto: p }); setSeleccion(""); }}>Editar</button> <button type="button" style={boton} disabled={guardando} onClick={() => borrarProducto(p)}>Eliminar</button></td>
            </tr>)}
          </tbody>
        </table>
        {!cargando && filtrados.length === 0 && <p>No se encontraron productos.</p>}
      </div>
      {elegible && elegible.manejaInventario && (
        <form onSubmit={registrar} style={{ marginTop: 22, padding: 16, border: "1px solid #ddd", borderRadius: 10, maxWidth: 650 }}>
          <h3>Ajustar: {elegible.nombre}</h3>
          <p>Existencias actuales: <strong>{elegible.stockActual}</strong></p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 5 }}>Movimiento
              <select style={campo} value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={guardando}>
                <option value="entrada">Entrada / reposición (+)</option>
                <option value="salida">Salida / merma (−)</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 5 }}>Cantidad (unidades)
              <input style={campo} type="number" min="1" step="1" required value={cantidad} onChange={(e) => setCantidad(e.target.value)} disabled={guardando} />
            </label>
            <button style={boton} type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Confirmar ajuste"}</button>
            <button style={boton} type="button" onClick={() => setSeleccion("")} disabled={guardando}>Cancelar</button>
          </div>
        </form>
      )}
      <p style={{ marginTop: 18, fontSize: ".9em", opacity: .8 }}>Esta pantalla registra el ajuste de existencias, pero el backend actual no conserva un historial de motivos o movimientos.</p>
    </section>
  );
}
