import { useEffect, useState, useCallback, useMemo } from "react";
import { io } from "socket.io-client";
import {
  obtenerMesas,
  obtenerMenuDelDia,
  obtenerOrdenesActivas,
  crearOrden,
  cambiarEstadoItem,
  anularItem,
  entregarOrden,
  anularOrden,
} from "../api";

// El WebSocket vive en la RAÍZ del backend (no en /api) — igual que en VistaMesas
const SOCKET_URL = "http://localhost:3000";

const TIPOS_CONSUMO = [
  { valor: "MESA", etiqueta: "🍽️ En mesa" },
  { valor: "LLEVAR", etiqueta: "🥡 Para llevar" },
  { valor: "MOSTRADOR", etiqueta: "🧾 Mostrador" },
];

// Clase de color por estado (definidas en el bloque CSS de esta etapa)
const CLASE_ORDEN = {
  CREADA: "info",
  PROCESANDO: "cocinando",
  LISTA: "ok",
  ENTREGADA: "entregada",
  CERRADA: "entregada",
  ANULADA: "mal",
};

const CLASE_ITEM = {
  PENDIENTE: "info",
  EN_PREPARACION: "cocinando",
  LISTO: "ok",
  ENTREGADO: "entregado",
  ANULADO: "mal",
};

const pesos = (n) => `$${Number(n).toLocaleString("es-CL")}`;

const formatearHora = (f) => {
  try {
    return new Date(f).toLocaleTimeString("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

export default function VistaOrdenes({
  sesion,
  mesaInicial,
  alConsumarMesaInicial,
}) {
  // ---- datos del backend ----
  const [menu, setMenu] = useState([]);
  const [mesas, setMesas] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(true);

  // ---- comanda en construcción ----
  const [tipoConsumo, setTipoConsumo] = useState("MESA");
  const [mesaElegida, setMesaElegida] = useState(null);
  const [carrito, setCarrito] = useState([]);
  const [enviando, setEnviando] = useState(false);

  // ---- avisos y conexión ----
  const [aviso, setAviso] = useState(null);
  const [enVivo, setEnVivo] = useState(false);

  const esAdmin = usuario?.rol === "ADMINISTRADOR";
  const esMesero = usuario?.rol === "MESERO";

  // ==================== CARGA ====================
  const recargar = useCallback(async () => {
    if (!token) return;
    try {
      const [menuDb, ordenesDb, mesasDb] = await Promise.all([
        obtenerMenuDelDia(token),
        obtenerOrdenesActivas(token),
        obtenerMesas(token),
      ]);
      setMenu(menuDb);
      setOrdenes(ordenesDb);
      setMesas(mesasDb);
    } catch (e) {
      setAviso({ tipo: "mal", texto: e.message });
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // ==================== MESA PRECARGADA DESDE EL PLANO ====================
  // El mesero pulsó "Tomar pedido" en una mesa del plano: llega como mesaInicial.
  // Cuando las mesas terminan de cargar, la dejamos seleccionada en la comanda.
  useEffect(() => {
    if (!mesaInicial || mesas.length === 0) return;
    const m = mesas.find((x) => Number(x.id) === Number(mesaInicial.id));
    if (m && m.estado !== "OCUPADA") {
      setTipoConsumo("MESA");
      setMesaElegida(Number(m.id));
    }
    alConsumarMesaInicial?.(); // le avisamos al Dashboard que ya la usamos
  }, [mesaInicial, mesas, alConsumarMesaInicial]);

  // ==================== TIEMPO REAL ====================
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socket.on("connect", () => setEnVivo(true));
    socket.on("disconnect", () => setEnVivo(false));
    const refrescar = () => recargar();
    socket.on("orden:nueva", refrescar);
    socket.on("orden:estado", refrescar);
    socket.on("orden:lista", refrescar);
    socket.on("item:estado", refrescar);
    socket.on("mesas:actualizadas", refrescar);
    return () => socket.disconnect();
  }, [recargar]);

  // Menú agrupado por categoría (el backend ya lo devuelve ordenado)
  const porCategoria = useMemo(() => {
    const grupos = new Map();
    for (const p of menu) {
      const nombre = p.categoria?.nombre ?? "Otros";
      if (!grupos.has(nombre)) grupos.set(nombre, []);
      grupos.get(nombre).push(p);
    }
    return [...grupos.entries()];
  }, [menu]);

  // ==================== CARRITO ====================
  const total = carrito.reduce((t, l) => t + l.precio * l.cantidad, 0);
  // Comparación tolerante: los ids bigint llegan como string del driver
  const numeroMesaElegida = mesas.find(
    (m) => Number(m.id) === Number(mesaElegida),
  )?.numero;

  const agregarAlCarrito = (p) => {
    const existente = carrito.find((l) => l.productoId === Number(p.id));
    const tope = p.manejaInventario ? p.stockActual : 99;
    if (existente && existente.cantidad >= tope) {
      setAviso({
        tipo: "mal",
        texto: `Solo hay ${tope} de '${p.nombre}' en stock`,
      });
      return;
    }
    if (existente) {
      setCarrito((prev) =>
        prev.map((l) =>
          l.productoId === Number(p.id)
            ? { ...l, cantidad: l.cantidad + 1 }
            : l,
        ),
      );
    } else {
      setCarrito((prev) => [
        ...prev,
        {
          productoId: Number(p.id), // ⚠️ bigint llega como string → numerizamos
          nombre: p.nombre,
          precio: Number(p.precio),
          cantidad: 1,
          notas: "",
          manejaInventario: p.manejaInventario,
          stockActual: p.stockActual,
        },
      ]);
    }
  };

  const cambiarCantidad = (productoId, delta) => {
    setCarrito((prev) =>
      prev
        .map((l) => {
          if (l.productoId !== productoId) return l;
          const nueva = l.cantidad + delta;
          const tope = l.manejaInventario ? l.stockActual : 99;
          return { ...l, cantidad: Math.max(0, Math.min(nueva, tope)) };
        })
        .filter((l) => l.cantidad > 0),
    );
  };

  const cambiarNotas = (productoId, texto) => {
    setCarrito((prev) =>
      prev.map((l) =>
        l.productoId === productoId ? { ...l, notas: texto } : l,
      ),
    );
  };

  // ==================== ENVIAR COMANDA ====================
  const enviarComanda = async () => {
    setAviso(null);
    if (carrito.length === 0) {
      setAviso({
        tipo: "mal",
        texto: "Agrega al menos un producto a la comanda",
      });
      return;
    }
    if (tipoConsumo === "MESA" && !mesaElegida) {
      setAviso({
        tipo: "mal",
        texto: "Elige la mesa para una orden de tipo MESA",
      });
      return;
    }
    setEnviando(true);
    try {
      const orden = await crearOrden(token, {
        tipoConsumo,
        mesaId: tipoConsumo === "MESA" ? Number(mesaElegida) : undefined,
        items: carrito.map((l) => ({
          productoId: l.productoId,
          cantidad: l.cantidad,
          notas: l.notas?.trim() ? l.notas.trim() : undefined,
        })),
      });
      setCarrito([]);
      setMesaElegida(null);
      setAviso({
        tipo: "ok",
        texto:
          `✅ ${orden.codigoOrden} enviada a cocina` +
          (orden.mesa ? ` — Mesa ${orden.mesa.numero} ahora OCUPADA` : ""),
      });
      await recargar();
    } catch (e) {
      setAviso({ tipo: "mal", texto: e.message });
    } finally {
      setEnviando(false);
    }
  };

  // ==================== ACCIONES SOBRE ÓRDENES ====================
  const accionOrden = async (fn, mensajeExito) => {
    try {
      await fn();
      setAviso({ tipo: "ok", texto: mensajeExito });
      await recargar();
    } catch (e) {
      setAviso({ tipo: "mal", texto: e.message });
    }
  };

  // Máquina de estados del item (transiciones que permite el backend)
  const siguientesDe = (estadoItem) => {
    if (estadoItem === "PENDIENTE") return ["EN_PREPARACION", "LISTO"];
    if (estadoItem === "EN_PREPARACION") return ["LISTO"];
    if (estadoItem === "LISTO") return ["ENTREGADO"];
    return [];
  };

  // Controles "demo cocina": el admin simula lo que hará la pantalla de cocina
  const botonesItem = (orden, item) => {
    if (orden.estado === "ANULADA" || orden.estado === "CERRADA") return null;
    const siguientes = siguientesDe(item.estadoItem).filter((e) =>
      e === "ENTREGADO" ? esAdmin || esMesero : esAdmin,
    );
    const anulable =
      esAdmin &&
      (item.estadoItem === "PENDIENTE" || item.estadoItem === "EN_PREPARACION");
    if (siguientes.length === 0 && !anulable) return null;
    return (
      <span className="demo-item-acciones">
        {siguientes.map((e) => (
          <button
            key={e}
            className="btn-mini"
            title={`Marcar ${e} (transición que permite el backend)`}
            onClick={() =>
              accionOrden(
                () => cambiarEstadoItem(token, orden.id, item.id, e),
                `'${item.nombre}' → ${e}`,
              )
            }
          >
            {e === "EN_PREPARACION" ? "▶" : e === "LISTO" ? "👨‍🍳" : "📦"}
          </button>
        ))}
        {anulable && (
          <button
            className="btn-mini mal"
            title="Anular item — devuelve el stock al inventario"
            onClick={() => {
              if (
                window.confirm(
                  `¿Anular '${item.nombre}'? El stock vuelve al inventario.`,
                )
              ) {
                accionOrden(
                  () => anularItem(token, orden.id, item.id),
                  `'${item.nombre}' anulado — stock devuelto`,
                );
              }
            }}
          >
            ✕
          </button>
        )}
      </span>
    );
  };

  // ==================== GUARD: SIN TOKEN NO HAY FIESTA ====================
  if (!token) {
    return (
      <div className="orden-vista">
        <div className="orden-banner mal">
          ⚠️ La vista no recibió la sesión (sesion con{" "}
          {sesion ? Object.keys(sesion).join(", ") : "nada"}). El Dashboard debe
          renderizarla como:{" "}
          {
            "<VistaOrdenes sesion={sesion} mesaInicial={mesaParaOrden} alConsumarMesaInicial={...} />"
          }
        </div>
      </div>
    );
  }

  const enCocina = ordenes.filter(
    (o) => o.estado === "CREADA" || o.estado === "PROCESANDO",
  ).length;
  const listas = ordenes.filter((o) => o.estado === "LISTA").length;

  // ==================== RENDER ====================
  return (
    <div className="orden-vista">
      <div className="orden-cabecera">
        <h2>🧾 Órdenes</h2>
        <span className={`orden-vivo ${enVivo ? "ok" : "mal"}`}>
          {enVivo ? "🟢 En vivo" : "🔴 Sin conexión"}
        </span>
      </div>

      {aviso && (
        <div className={`orden-banner ${aviso.tipo}`}>{aviso.texto}</div>
      )}

      <div className="orden-stats">
        <div className="orden-stat">
          <b>{ordenes.length}</b>
          <span>Activas</span>
        </div>
        <div className="orden-stat">
          <b>{enCocina}</b>
          <span>En cocina</span>
        </div>
        <div className="orden-stat">
          <b>{listas}</b>
          <span>Listas</span>
        </div>
      </div>

      {/* ==================== NUEVA COMANDA ==================== */}
      <div className="comanda-card">
        <h3>📝 Nueva comanda</h3>

        <div className="tipo-tabs">
          {TIPOS_CONSUMO.map((t) => (
            <button
              key={t.valor}
              className={`tipo-tab ${tipoConsumo === t.valor ? "activa" : ""}`}
              onClick={() => {
                setTipoConsumo(t.valor);
                setMesaElegida(null);
              }}
            >
              {t.etiqueta}
            </button>
          ))}
        </div>

        {tipoConsumo === "MESA" && (
          <div className="mesa-picker">
            {mesas.length === 0 && (
              <p className="orden-suave">No hay mesas parametrizadas.</p>
            )}
            {mesas.map((m) => {
              const seleccionada = Number(mesaElegida) === Number(m.id);
              const bloqueada = m.estado === "OCUPADA";
              return (
                <button
                  key={m.id}
                  className={`mesa-chip ${seleccionada ? "seleccionada" : ""} ${
                    bloqueada ? "bloqueada" : ""
                  }`}
                  disabled={bloqueada}
                  onClick={() => setMesaElegida(seleccionada ? null : m.id)}
                >
                  <b>Mesa {m.numero}</b>
                  <span>{bloqueada ? "OCUPADA" : m.estado}</span>
                </button>
              );
            })}
          </div>
        )}

        {cargando ? (
          <p className="orden-suave">Cargando menú…</p>
        ) : menu.length === 0 ? (
          <p className="orden-suave">
            El menú del día está vacío (¿sembraste los productos en la Prueba
            1?)
          </p>
        ) : (
          porCategoria.map(([categoria, productos]) => (
            <div key={categoria} className="menu-cat">
              <h4 className="menu-cat-titulo">{categoria}</h4>
              {productos.map((p) => {
                const enCarrito = carrito.find(
                  (l) => l.productoId === Number(p.id),
                );
                const sinStock = p.manejaInventario && p.stockActual <= 0;
                return (
                  <div
                    key={p.id}
                    className={`menu-prod ${sinStock ? "agotado" : ""}`}
                  >
                    <div className="prod-info">
                      <span className="prod-nombre">{p.nombre}</span>
                      <span className="prod-detalles">
                        {pesos(p.precio)}
                        {p.manejaInventario && (
                          <em className="stock-badge">
                            stock: {p.stockActual}
                          </em>
                        )}
                      </span>
                    </div>
                    {sinStock ? (
                      <span className="stock-badge mal">agotado</span>
                    ) : (
                      <button
                        className="btn-anadir"
                        onClick={() => agregarAlCarrito(p)}
                      >
                        {enCarrito ? `＋ (${enCarrito.cantidad})` : "＋ Añadir"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}

        {carrito.length > 0 && (
          <div className="carrito">
            <h4>
              🛒 Comanda en curso
              {tipoConsumo === "MESA" && numeroMesaElegida
                ? ` — Mesa ${numeroMesaElegida}`
                : tipoConsumo !== "MESA"
                  ? ` — ${tipoConsumo.toLowerCase()}`
                  : ""}
            </h4>
            {carrito.map((l) => (
              <div key={l.productoId} className="carrito-linea">
                <div className="linea-info">
                  <span className="linea-nombre">{l.nombre}</span>
                  <span className="linea-sub">{pesos(l.precio)} c/u</span>
                </div>
                <div className="qty-controles">
                  <button onClick={() => cambiarCantidad(l.productoId, -1)}>
                    −
                  </button>
                  <b>{l.cantidad}</b>
                  <button onClick={() => cambiarCantidad(l.productoId, +1)}>
                    ＋
                  </button>
                </div>
                <input
                  className="notas-input"
                  placeholder="Notas (ej: sin cebolla)"
                  value={l.notas}
                  maxLength={300}
                  onChange={(e) => cambiarNotas(l.productoId, e.target.value)}
                />
                <span className="linea-total">
                  {pesos(l.precio * l.cantidad)}
                </span>
              </div>
            ))}
            <div className="carrito-pie">
              <span className="carrito-total">
                Total: <b>{pesos(total)}</b>
              </span>
              <button
                className="btn-enviar"
                onClick={enviarComanda}
                disabled={enviando}
              >
                {enviando ? "Enviando…" : "🚀 Enviar a cocina"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ==================== ÓRDENES ACTIVAS ==================== */}
      <div className="ordenes-seccion">
        <h3>🔥 Órdenes activas</h3>
        {ordenes.length === 0 && (
          <p className="orden-suave">
            Sin órdenes activas — la primera que envíes aparecerá aquí.
          </p>
        )}
        {ordenes.map((o) => (
          <div key={o.id} className="orden-card">
            <div className="orden-head">
              <div>
                <b>{o.codigoOrden}</b>
                <span className="orden-sub">
                  {o.mesa ? `Mesa ${o.mesa.numero}` : o.tipoConsumo} ·{" "}
                  {o.mesero?.nombre ?? ""} · {formatearHora(o.fechaCreacion)}
                </span>
              </div>
              <span
                className={`estado-chip ${CLASE_ORDEN[o.estado] ?? "info"}`}
              >
                {o.estado}
              </span>
            </div>

            <div className="orden-items">
              {o.items.map((it) => (
                <div key={it.id} className="item-linea">
                  <span className="item-cant">×{it.cantidad}</span>
                  <span className="item-nombre">{it.nombre}</span>
                  {it.notas && <em className="item-notas">“{it.notas}”</em>}
                  <span
                    className={`item-chip ${CLASE_ITEM[it.estadoItem] ?? "info"}`}
                  >
                    {it.estadoItem}
                  </span>
                  {botonesItem(o, it)}
                </div>
              ))}
            </div>

            <div className="orden-pie">
              <span>
                Total: <b>{pesos(o.total)}</b>
              </span>
              <div className="orden-acciones">
                {o.estado === "LISTA" && (esAdmin || esMesero) && (
                  <button
                    className="btn-mini ok"
                    onClick={() =>
                      accionOrden(
                        () => entregarOrden(token, o.id),
                        `✅ ${o.codigoOrden} entregada`,
                      )
                    }
                  >
                    ✅ Entregar
                  </button>
                )}
                {esAdmin &&
                  ["CREADA", "PROCESANDO", "LISTA"].includes(o.estado) && (
                    <button
                      className="btn-mini mal"
                      onClick={() => {
                        if (
                          window.confirm(
                            `¿Anular ${o.codigoOrden}? Se devuelve el stock y la mesa queda LIBRE.`,
                          )
                        ) {
                          accionOrden(
                            () => anularOrden(token, o.id),
                            `${o.codigoOrden} anulada — mesa liberada`,
                          );
                        }
                      }}
                    >
                      🗑️ Anular
                    </button>
                  )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
