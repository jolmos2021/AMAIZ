import { useCallback, useEffect, useMemo, useState } from "react";
import { obtenerProductosInventario, obtenerCategoriasAdmin, actualizarProductoAdmin, eliminarProductoAdmin, crearCategoriaAdmin, actualizarCategoriaAdmin, eliminarCategoriaAdmin } from "../api";
import FormularioProducto from "./FormularioProducto";

const boton = { padding: "9px 12px", borderRadius: 8, cursor: "pointer" };
const celda = { padding: 9, borderTop: "1px solid #ddd" };
export default function VistaMenuAdmin({ sesion }) {
  const token = sesion?.accessToken;
  const autorizado = sesion?.usuario?.rol === "ADMINISTRADOR";
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [formulario, setFormulario] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [nombreCategoria, setNombreCategoria] = useState("");
  const [editandoCategoria, setEditandoCategoria] = useState("");
  const cargar = useCallback(async () => {
    if (!autorizado || !token) return;
    const [prods, cats] = await Promise.all([obtenerProductosInventario(token), obtenerCategoriasAdmin(token)]);
    if (!Array.isArray(prods) || !Array.isArray(cats)) throw new Error("Respuesta inválida del servidor.");
    setProductos(prods); setCategorias(cats);
  }, [autorizado, token]);
  useEffect(() => { cargar().catch(e => setError(e?.message || "No se pudo cargar el menú.")); }, [cargar]);
  const filtrados = useMemo(() => productos.filter(p => `${p.nombre} ${p.categoria?.nombre || ""}`.toLocaleLowerCase().includes(busqueda.toLocaleLowerCase())), [productos, busqueda]);
  async function operar(accion, mensaje) {
    setOcupado(true); setError(""); setAviso("");
    try { await accion(); await cargar(); setAviso(mensaje); }
    catch (e) { setError(e?.message || "No se pudo completar la operación."); }
    finally { setOcupado(false); }
  }
  async function cambiarDisponibilidad(p) {
    await operar(() => actualizarProductoAdmin(token, p.id, { disponibleMenuDia: !p.disponibleMenuDia }), `Disponibilidad de '${p.nombre}' actualizada.`);
  }
  async function borrar(p) {
    if (!window.confirm(`¿Eliminar definitivamente '${p.nombre}'? No podrá recuperarse. Se rechazará si tiene registros relacionados.`)) return;
    await operar(() => eliminarProductoAdmin(token, p.id), `Producto '${p.nombre}' eliminado.`);
  }
  async function guardarCategoria(e) {
    e.preventDefault();
    const nombre = nombreCategoria.trim();
    if (nombre.length < 2 || nombre.length > 100) return setError("Nombre de categoría inválido.");
    await operar(() => editandoCategoria ? actualizarCategoriaAdmin(token, editandoCategoria, { nombre }) : crearCategoriaAdmin(token, { nombre }), "Categoría guardada.");
    setEditandoCategoria(""); setNombreCategoria("");
  }
  if (!autorizado) return <section><h2>Administrar menú</h2><p>Acceso reservado al administrador.</p></section>;
  return <section style={{ padding: "8px 0 28px" }}>
    <h2>Administrar menú</h2>
    <p>Crea y edita platos, y selecciona cuáles aparecen en el menú del día. Los productos ocultos conservan sus registros e historial.</p>
    {error && <p role="alert" style={{ color: "#a21c1c" }}>{error}</p>}
    {aviso && <p role="status" style={{ color: "#236333" }}>{aviso}</p>}
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
      <button style={boton} type="button" disabled={ocupado} onClick={() => setFormulario({ nuevo: true })}>+ Crear plato / producto</button>
      <button style={boton} type="button" disabled={ocupado} onClick={() => operar(async () => {}, "Listado actualizado.")}>Actualizar listado</button>
    </div>
    {formulario && <FormularioProducto key={formulario.nuevo ? "nuevo" : formulario.producto.id} sesion={sesion} producto={formulario.producto} categorias={categorias} alGuardar={async () => { await cargar(); setFormulario(null); setAviso("Producto guardado correctamente."); }} alCancelar={() => setFormulario(null)} />}
    <div style={{ margin: "16px 0" }}><input aria-label="Buscar platos" placeholder="Buscar plato o categoría" style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc", width: "min(100%, 520px)", boxSizing: "border-box" }} value={busqueda} onChange={e => setBusqueda(e.target.value)} /></div>
    <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}><thead><tr><th>Plato / producto</th><th>Categoría</th><th>Precio</th><th>Menú del día</th><th>Acciones</th></tr></thead><tbody>
      {filtrados.map(p => <tr key={p.id}><td style={celda}>{p.nombre}</td><td style={celda}>{p.categoria?.nombre || "—"}</td><td style={celda}>${Number(p.precio).toLocaleString("es-CL")}</td><td style={celda}>{p.disponibleMenuDia ? "Disponible" : "Oculto"}</td><td style={{ ...celda, minWidth: 250 }}>
        <button style={boton} type="button" disabled={ocupado} onClick={() => cambiarDisponibilidad(p)}>{p.disponibleMenuDia ? "Ocultar" : "Mostrar"}</button>{" "}
        <button style={boton} type="button" disabled={ocupado} onClick={() => setFormulario({ producto: p })}>Editar</button>{" "}
        <button style={boton} type="button" disabled={ocupado} onClick={() => borrar(p)}>Eliminar</button>
      </td></tr>)}
    </tbody></table>{filtrados.length === 0 && <p>No se encontraron productos.</p>}</div>
    <section style={{ marginTop: 28, borderTop: "1px solid #ddd", paddingTop: 14 }}>
      <h3>Categorías del menú</h3>
      <form onSubmit={guardarCategoria} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <input aria-label="Nombre de categoría" required minLength={2} maxLength={100} placeholder="Nombre de categoría" value={nombreCategoria} onChange={e => setNombreCategoria(e.target.value)} style={{ padding: 9, borderRadius: 8, border: "1px solid #bbb" }} />
        <button type="submit" style={boton} disabled={ocupado}>{editandoCategoria ? "Guardar categoría" : "Crear categoría"}</button>
        {editandoCategoria && <button type="button" style={boton} onClick={() => { setEditandoCategoria(""); setNombreCategoria(""); }}>Cancelar</button>}
      </form>
      <div style={{ marginTop: 12 }}>{categorias.map(c => <div key={c.id} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: 7, borderBottom: "1px solid #ddd" }}><span style={{ flex: 1 }}>{c.nombre}</span>
        <button type="button" style={boton} disabled={ocupado} onClick={() => { setEditandoCategoria(String(c.id)); setNombreCategoria(c.nombre); }}>Editar</button>
        <button type="button" style={boton} disabled={ocupado} onClick={() => { if (window.confirm(`¿Eliminar la categoría '${c.nombre}'? Solo es posible si no contiene productos.`)) operar(() => eliminarCategoriaAdmin(token, c.id), "Categoría eliminada."); }}>Eliminar</button>
      </div>)}</div>
    </section>
  </section>;
}
