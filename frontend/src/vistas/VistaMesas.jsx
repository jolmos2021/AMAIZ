import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  API_URL,
  obtenerMesas,
  guardarDisposicion,
  cambiarEstadoMesa,
  crearMesa,
  eliminarMesa,
} from "../api";

const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");

// Lienzo lógico: el plano mide estas "unidades" internamente;
// el zoom solo decide cuánto se amplía al mostrarlo.
const LIENZO_W = 1000;
const LIENZO_H = 700;
const MESA_W = 96;
const MESA_H = 78;

const limitar = (v, min, max) => Math.min(Math.max(v, min), max);
const redondear = (v) => Math.round(v * 100) / 100;

/** ¿Todas las mesas siguen en (0,0)? → el plano nunca fue organizado */
const sinOrganizar = (mesas) =>
  mesas.length > 0 &&
  mesas.every(
    (m) => Number(m.coordenadaX) === 0 && Number(m.coordenadaY) === 0,
  );

/** Rejilla provisional para que las mesas no apilen en la esquina */
function rejillaProvisional(mesas) {
  const posiciones = {};
  mesas.forEach((m, i) => {
    posiciones[m.id] = {
      x: 80 + (i % 5) * 190,
      y: 60 + Math.floor(i / 5) * 150,
    };
  });
  return posiciones;
}

export default function VistaMesas({ sesion, onTomarPedido }) {
  const { accessToken, usuario } = sesion;
  const esAdmin = usuario.rol === "ADMINISTRADOR";

  const [mesas, setMesas] = useState(null); // null = cargando
  const [errorCarga, setErrorCarga] = useState("");
  const [editando, setEditando] = useState(false);
  const [posiciones, setPosiciones] = useState({}); // locales del modo edición
  const [hayCambios, setHayCambios] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [seleccion, setSeleccion] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [avisoRemoto, setAvisoRemoto] = useState("");
  const [errorAccion, setErrorAccion] = useState("");
  const [nueva, setNueva] = useState({ numero: "", capacidad: "" });

  const lienzoRef = useRef(null);
  const contenedorRef = useRef(null);
  const arrastreRef = useRef(null);

  // Espejo del estado de edición: el socket siempre lee lo más reciente
  const modoEdicionRef = useRef(false);
  modoEdicionRef.current = editando || hayCambios;

  const recargar = useCallback(async () => {
    try {
      const lista = await obtenerMesas(accessToken);
      setMesas(lista);
      setErrorCarga("");
      setSeleccion((prev) =>
        prev
          ? (lista.find((m) => String(m.id) === String(prev.id)) ?? null)
          : null,
      );
      if (!modoEdicionRef.current) {
        const base = {};
        lista.forEach((m) => {
          base[m.id] = { x: Number(m.coordenadaX), y: Number(m.coordenadaY) };
        });
        setPosiciones(base);
      }
    } catch (e) {
      setErrorCarga(
        e.message === "sin-conexion"
          ? "No se pudo conectar al backend — ¿está corriendo en el puerto 3000?"
          : e.message,
      );
    }
  }, [accessToken]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // Canal en tiempo real: si OTRA pantalla cambia mesas, este plano
  // se refresca solo (el WebSocket validado en 3.4b, en producción)
  useEffect(() => {
    const socket = io(SOCKET_URL);
    socket.on("mesas:actualizadas", () => {
      if (modoEdicionRef.current) {
        setAvisoRemoto(
          "Otro usuario modificó las mesas — guarda tu edición y vuelve a entrar para ver sus cambios",
        );
        return;
      }
      recargar();
    });
    return () => socket.disconnect();
  }, [recargar]);

  // Zoom: ajustar al ancho disponible la primera vez
  const ajustar = useCallback(() => {
    const ancho = contenedorRef.current?.clientWidth ?? LIENZO_W;
    setZoom(limitar(redondear(ancho / LIENZO_W), 0.4, 1.6));
  }, []);

  useEffect(() => {
    ajustar();
  }, [ajustar]);

  // Posiciones que se muestran: edición > rejilla provisional > guardadas
  const posicionesVisibles = (() => {
    if (editando) return posiciones;
    if (sinOrganizar(mesas ?? [])) return rejillaProvisional(mesas);
    const base = {};
    (mesas ?? []).forEach((m) => {
      base[m.id] = { x: Number(m.coordenadaX), y: Number(m.coordenadaY) };
    });
    return base;
  })();

  // ─── Modo edición ───
  const entrarEdicion = () => {
    const base = sinOrganizar(mesas) ? rejillaProvisional(mesas) : posiciones;
    setPosiciones({ ...base });
    setSeleccion(null);
    setHayCambios(false);
    setEditando(true);
  };

  const salirEdicion = () => {
    if (
      hayCambios &&
      !window.confirm("Hay cambios sin guardar. ¿Salir de todas formas?")
    )
      return;
    setEditando(false);
    setHayCambios(false);
    setAvisoRemoto("");
  };

  // ─── Arrastre (pointer events: mouse Y táctil) ───
  const iniciarArrastre = (e, mesa) => {
    if (!editando) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = lienzoRef.current.getBoundingClientRect();
    const p = posiciones[mesa.id] ?? { x: 0, y: 0 };
    arrastreRef.current = {
      id: mesa.id,
      dx: (e.clientX - rect.left) / zoom - p.x,
      dy: (e.clientY - rect.top) / zoom - p.y,
    };
  };

  const duranteArrastre = (e) => {
    const a = arrastreRef.current;
    if (!a) return;
    const rect = lienzoRef.current.getBoundingClientRect();
    const x = limitar(
      (e.clientX - rect.left) / zoom - a.dx,
      0,
      LIENZO_W - MESA_W,
    );
    const y = limitar(
      (e.clientY - rect.top) / zoom - a.dy,
      0,
      LIENZO_H - MESA_H,
    );
    setPosiciones((prev) => ({
      ...prev,
      [a.id]: { x: redondear(x), y: redondear(y) },
    }));
    setHayCambios(true);
  };

  const terminarArrastre = () => {
    arrastreRef.current = null;
  };

  // ─── Guardar el plano ───
  const guardarPlano = async () => {
    setGuardando(true);
    setErrorAccion("");
    try {
      const cuerpo = mesas.map((m) => ({
        id: Number(m.id),
        coordenadaX: posiciones[m.id]?.x ?? 0,
        coordenadaY: posiciones[m.id]?.y ?? 0,
      }));
      const actualizadas = await guardarDisposicion(accessToken, cuerpo);
      setMesas(actualizadas);
      const base = {};
      actualizadas.forEach((m) => {
        base[m.id] = { x: Number(m.coordenadaX), y: Number(m.coordenadaY) };
      });
      setPosiciones(base);
      setHayCambios(false);
      setEditando(false);
      setAvisoRemoto("");
    } catch (e) {
      setErrorAccion(
        e.message === "sin-conexion"
          ? "Sin conexión con el backend"
          : e.message,
      );
    } finally {
      setGuardando(false);
    }
  };

  // ─── Estados y CRUD ───
  const cambiarEstado = async (mesa, estado) => {
    setErrorAccion("");
    try {
      const actualizada = await cambiarEstadoMesa(
        accessToken,
        Number(mesa.id),
        estado,
      );
      setMesas((prev) =>
        prev.map((m) =>
          String(m.id) === String(actualizada.id) ? actualizada : m,
        ),
      );
      setSeleccion(actualizada);
    } catch (e) {
      setErrorAccion(
        e.message === "sin-conexion"
          ? "Sin conexión con el backend"
          : e.message,
      );
    }
  };

  const siguienteNumero = () =>
    mesas?.length ? Math.max(...mesas.map((m) => m.numero)) + 1 : 1;

  const crearNueva = async (e) => {
    e.preventDefault();
    setErrorAccion("");
    const numero = Number(nueva.numero || siguienteNumero());
    const capacidad = Number(nueva.capacidad);
    if (!Number.isInteger(numero) || numero < 1) {
      setErrorAccion("Número de mesa inválido");
      return;
    }
    if (!Number.isInteger(capacidad) || capacidad < 1) {
      setErrorAccion("La capacidad debe ser un entero mayor a 0");
      return;
    }
    try {
      // Nace en el centro del plano — el admin la arrastra a su lugar
      const creada = await crearMesa(accessToken, {
        numero,
        capacidadMaxima: capacidad,
        coordenadaX: (LIENZO_W - MESA_W) / 2,
        coordenadaY: (LIENZO_H - MESA_H) / 2,
      });
      setMesas((prev) => [...prev, creada].sort((a, b) => a.numero - b.numero));
      setPosiciones((prev) => ({
        ...prev,
        [creada.id]: {
          x: Number(creada.coordenadaX),
          y: Number(creada.coordenadaY),
        },
      }));
      setNueva({ numero: "", capacidad: "" });
    } catch (e2) {
      setErrorAccion(
        e2.message === "sin-conexion"
          ? "Sin conexión con el backend"
          : e2.message,
      );
    }
  };

  const eliminarSeleccionada = async () => {
    if (!seleccion) return;
    if (
      !window.confirm(
        `¿Eliminar la mesa ${seleccion.numero}? No se puede deshacer.`,
      )
    )
      return;
    setErrorAccion("");
    try {
      await eliminarMesa(accessToken, Number(seleccion.id));
      setMesas((prev) =>
        prev.filter((m) => String(m.id) !== String(seleccion.id)),
      );
      setSeleccion(null);
    } catch (e) {
      setErrorAccion(
        e.message === "sin-conexion"
          ? "Sin conexión con el backend"
          : e.message,
      );
    }
  };

  // ─── Carga / vacío ───
  if (!mesas) {
    return errorCarga ? (
      <section className="tarjeta">
        <h2>No se pudo cargar el plano</h2>
        <p className="ayuda">{errorCarga}</p>
        <button className="primario" onClick={recargar}>
          Reintentar
        </button>
      </section>
    ) : (
      <section className="tarjeta">
        <p className="ayuda">Cargando el plano del salón…</p>
      </section>
    );
  }

  const libres = mesas.filter((m) => m.estado === "LIBRE").length;
  const ocupadas = mesas.filter((m) => m.estado === "OCUPADA").length;
  const reservadas = mesas.filter((m) => m.estado === "RESERVADA").length;
  const claseEstado = seleccion ? String(seleccion.estado).toLowerCase() : "";

  return (
    <>
      {/* Estadísticas y acciones */}
      <section className="tarjeta mesas-barra">
        <div className="mesas-stats">
          <strong className="mesas-total">🏠 {mesas.length} mesas</strong>
          <span className="stat libre">🟢 {libres} libres</span>
          <span className="stat ocupada">🟡 {ocupadas} ocupadas</span>
          <span className="stat reservada">🔵 {reservadas} reservadas</span>
        </div>
        <div className="fila">
          {!editando && esAdmin && (
            <button className="primario" onClick={entrarEdicion}>
              ✏️ Editar plano
            </button>
          )}
          {editando && (
            <>
              <button
                className="primario"
                onClick={guardarPlano}
                disabled={guardando || !hayCambios}
              >
                {guardando ? "Guardando…" : "💾 Guardar plano"}
              </button>
              <button
                className="secundario"
                onClick={salirEdicion}
                disabled={guardando}
              >
                Cancelar
              </button>
            </>
          )}
        </div>
      </section>

      {!editando && sinOrganizar(mesas) && (
        <div className="banner-plano">
          🗺️ El plano aún no ha sido organizado — las mesas se muestran en una
          rejilla provisional
          {esAdmin
            ? ". Usa ✏️ Editar plano para acomodarlas como están en tu local y guarda."
            : "."}
        </div>
      )}
      {avisoRemoto && (
        <div className="banner-plano aviso">🔄 {avisoRemoto}</div>
      )}
      {errorAccion && (
        <div className="banner-plano error">⚠️ {errorAccion}</div>
      )}

      {/* Crear mesa: en edición, o si el salón está vacío */}
      {(editando || (mesas.length === 0 && esAdmin)) && (
        <section className="tarjeta">
          <h2>➕ Nueva mesa</h2>
          <p className="ayuda">
            La mesa nace en el centro del plano — arrástrala a su lugar y
            guarda. Se crea en estado <strong>LIBRE</strong>.
          </p>
          <form className="fila form-mesa" onSubmit={crearNueva}>
            <label>
              Nº de mesa
              <input
                type="number"
                min="1"
                value={nueva.numero}
                onChange={(e) =>
                  setNueva((n) => ({ ...n, numero: e.target.value }))
                }
                placeholder={siguienteNumero()}
              />
            </label>
            <label>
              Capacidad
              <input
                type="number"
                min="1"
                value={nueva.capacidad}
                onChange={(e) =>
                  setNueva((n) => ({ ...n, capacidad: e.target.value }))
                }
                placeholder="4"
              />
            </label>
            <button className="primario" type="submit">
              Crear mesa
            </button>
          </form>
        </section>
      )}

      {/* Detalle de la mesa seleccionada (modo vista) */}
      {seleccion && !editando && (
        <section className="tarjeta detalle-mesa">
          <button className="cerrar-detalle" onClick={() => setSeleccion(null)}>
            ✕
          </button>
          <h2>Mesa {seleccion.numero}</h2>
          <p className="ayuda">
            Capacidad: <strong>{seleccion.capacidadMaxima} personas</strong> ·
            Estado:{" "}
            <span className={`estado-texto ${claseEstado}`}>
              {seleccion.estado}
            </span>
          </p>
          {seleccion.estado === "OCUPADA" && (
            <p className="ayuda">
              🟡 Mesa con orden abierta — se liberará automáticamente al cerrar
              la orden en caja.
            </p>
          )}
          <div className="fila">
            {esAdmin && seleccion.estado === "LIBRE" && (
              <button
                className="secundario"
                onClick={() => cambiarEstado(seleccion, "RESERVADA")}
              >
                🔵 Reservar
              </button>
            )}
            {esAdmin && seleccion.estado === "RESERVADA" && (
              <button
                className="secundario"
                onClick={() => cambiarEstado(seleccion, "LIBRE")}
              >
                🟢 Liberar
              </button>
            )}
            {esAdmin && seleccion.estado === "LIBRE" && (
              <button className="peligro" onClick={eliminarSeleccionada}>
                🗑️ Eliminar
              </button>
            )}
            {onTomarPedido &&
              seleccion.estado !== "OCUPADA" &&
              (usuario.rol === "MESERO" || esAdmin) && (
                <button
                  className="primario"
                  onClick={() => onTomarPedido(seleccion)}
                >
                  📝 Tomar pedido
                </button>
              )}
          </div>
        </section>
      )}

      {/* El plano */}
      <section className="tarjeta plano-envoltura">
        <div className="plano-contenedor" ref={contenedorRef}>
          <div style={{ width: LIENZO_W * zoom, height: LIENZO_H * zoom }}>
            <div
              className={`plano-lienzo ${editando ? "editando" : ""}`}
              ref={lienzoRef}
              style={{
                width: LIENZO_W,
                height: LIENZO_H,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
              }}
            >
              {mesas.length === 0 && (
                <p className="plano-vacio">
                  Sin mesas todavía
                  {esAdmin
                    ? " — crea la primera con el formulario de abajo"
                    : ""}
                </p>
              )}
              {mesas.map((m) => {
                const p = posicionesVisibles[m.id] ?? { x: 0, y: 0 };
                const estaSeleccionada =
                  seleccion && String(seleccion.id) === String(m.id);
                return (
                  <div
                    key={String(m.id)}
                    className={`mesa-card ${String(m.estado).toLowerCase()} ${
                      estaSeleccionada ? "seleccionada" : ""
                    }`}
                    style={{
                      left: p.x,
                      top: p.y,
                      width: MESA_W,
                      height: MESA_H,
                    }}
                    onPointerDown={(e) => iniciarArrastre(e, m)}
                    onPointerMove={duranteArrastre}
                    onPointerUp={terminarArrastre}
                    onPointerCancel={terminarArrastre}
                    onClick={() => !editando && setSeleccion(m)}
                  >
                    <span className="mesa-numero">M{m.numero}</span>
                    <span className="mesa-capacidad">
                      {m.capacidadMaxima} pers.
                    </span>
                    <span className="mesa-estado-punto" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="zoom-controles">
          <button
            onClick={() => setZoom((z) => limitar(redondear(z + 0.15), 0.4, 2))}
            aria-label="Acercar"
          >
            ＋
          </button>
          <button
            onClick={() => setZoom((z) => limitar(redondear(z - 0.15), 0.4, 2))}
            aria-label="Alejar"
          >
            −
          </button>
          <button onClick={ajustar} aria-label="Ajustar a la pantalla">
            ⤢
          </button>
        </div>
      </section>
    </>
  );
}
