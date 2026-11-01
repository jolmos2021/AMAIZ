import { useState } from "react";
import { crearProductoAdmin, actualizarProductoAdmin } from "../api";

const input = { padding: 9, border: "1px solid #bbb", borderRadius: 8, width: "100%", boxSizing: "border-box" };
const button = { padding: "9px 14px", borderRadius: 8, cursor: "pointer" };

export default function FormularioProducto({ sesion, producto, categorias, inventario = false, alGuardar, alCancelar }) {
  const [nombre, setNombre] = useState(producto?.nombre || "");
  const [precio, setPrecio] = useState(String(producto?.precio ?? ""));
  const [categoriaId, setCategoriaId] = useState(String(producto?.categoriaId ?? categorias[0]?.id ?? ""));
  const [manejaInventario, setManejaInventario] = useState(producto?.manejaInventario ?? inventario);
  const [stockInicial, setStockInicial] = useState("0");
  const [disponibleMenuDia, setDisponibleMenuDia] = useState(producto?.disponibleMenuDia ?? true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function guardar(e) {
    e.preventDefault();
    const nPrecio = Number(precio);
    const nStock = Number(stockInicial);
    if (nombre.trim().length < 2 || nombre.trim().length > 150) return setError("El nombre debe tener entre 2 y 150 caracteres.");
    if (!Number.isFinite(nPrecio) || nPrecio < 0 || precio.trim() === "") return setError("Ingresa un precio válido.");
    if (!Number.isSafeInteger(Number(categoriaId)) || Number(categoriaId) <= 0) return setError("Selecciona una categoría.");
    if (!producto && manejaInventario && (!Number.isSafeInteger(nStock) || nStock < 0)) return setError("El stock inicial debe ser un entero no negativo.");
    if (producto && producto.manejaInventario && !manejaInventario && Number(producto.stockActual) !== 0) return setError("Para desactivar inventario, primero ajusta el stock a cero desde Inventario.");
    const datos = { nombre: nombre.trim(), precio: nPrecio, categoriaId: Number(categoriaId), manejaInventario, disponibleMenuDia };
    if (!producto && manejaInventario) datos.stockInicial = nStock;
    setGuardando(true); setError("");
    try {
      if (producto) await actualizarProductoAdmin(sesion.accessToken, producto.id, datos);
      else await crearProductoAdmin(sesion.accessToken, datos);
      await alGuardar();
    } catch (err) { setError(err?.message || "No se pudo guardar el producto."); }
    finally { setGuardando(false); }
  }
  return <form onSubmit={guardar} style={{ border: "1px solid #ddd", padding: 16, borderRadius: 10, marginTop: 16, display: "grid", gap: 12, maxWidth: 650 }}>
    <h3>{producto ? `Editar: ${producto.nombre}` : inventario ? "Nuevo producto de inventario" : "Nuevo plato / producto"}</h3>
    {error && <p role="alert" style={{ color: "#a21c1c" }}>{error}</p>}
    <label>Nombre<input style={input} value={nombre} onChange={e => setNombre(e.target.value)} required minLength={2} maxLength={150} /></label>
    <label>Precio<input style={input} type="number" min="0" step="0.01" value={precio} onChange={e => setPrecio(e.target.value)} required /></label>
    <label>Categoría<select style={input} value={categoriaId} onChange={e => setCategoriaId(e.target.value)} required>
      <option value="">Selecciona categoría</option>{categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
    </select></label>
    <label style={{ display: "flex", gap: 8 }}><input type="checkbox" checked={manejaInventario} onChange={e => setManejaInventario(e.target.checked)} /> Controlar existencias</label>
    {!producto && manejaInventario && <label>Stock inicial<input style={input} type="number" min="0" step="1" value={stockInicial} onChange={e => setStockInicial(e.target.value)} required /></label>}
    {producto && manejaInventario && <p>Stock actual: <strong>{producto.stockActual}</strong>. Las existencias se ajustan desde Inventario, no mediante la edición del producto.</p>}
    <label style={{ display: "flex", gap: 8 }}><input type="checkbox" checked={disponibleMenuDia} onChange={e => setDisponibleMenuDia(e.target.checked)} /> Disponible en el menú del día</label>
    <div style={{ display: "flex", gap: 10 }}><button style={button} type="submit" disabled={guardando || !categorias.length}>{guardando ? "Guardando…" : "Guardar"}</button><button style={button} type="button" onClick={alCancelar} disabled={guardando}>Cancelar</button></div>
  </form>;
}
