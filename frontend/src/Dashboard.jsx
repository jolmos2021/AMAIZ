import { useEffect, useState } from "react";
import VistaMesas from "./vistas/VistaMesas";
import VistaOrdenes from "./vistas/VistaOrdenes";
import VistaPerfil from "./vistas/VistaPerfil";
import VistaCaja from "./vistas/VistaCaja";
import VistaCreditos from "./vistas/VistaCreditos";
import VistaHistorial from "./vistas/VistaHistorial";
import "./App.css";

const CLAVE_VISTA = "meseroapp.ultima-vista";

const COLORES_ROL = {
  ADMINISTRADOR: "#C0453E",
  MESERO: "#C98A1B",
  CAJERO: "#3E7EC0",
  COCINERO: "#7C5CBF",
};

const VISTAS = [
  { id: "mesas", icono: "🏠", etiqueta: "Mesas" },
  { id: "ordenes", icono: "📋", etiqueta: "Órdenes" },
  { id: "caja", icono: "💳", etiqueta: "Caja y Cobros" },
  { id: "creditos", icono: "🧾", etiqueta: "Créditos" },
  { id: "historial", icono: "📚", etiqueta: "Historial" },
  { id: "perfil", icono: "👤", etiqueta: "Perfil" },
];

export default function Dashboard({ sesion, alSalir }) {
  const [vista, setVista] = useState(
    () => localStorage.getItem(CLAVE_VISTA) || "mesas",
  );

  const [mesaParaOrden, setMesaParaOrden] = useState(null);

  useEffect(() => {
    localStorage.setItem(CLAVE_VISTA, vista);
  }, [vista]);

  const tomarPedidoEnMesa = (mesa) => {
    setMesaParaOrden(mesa);
    setVista("ordenes");
  };

  const { usuario } = sesion;
  const nombre = usuario.nombre || usuario.username;

  const puedeAccederCaja = ["ADMINISTRADOR", "CAJERO"].includes(usuario.rol);

  const vistasDisponibles = VISTAS.filter(
    (v) => !["caja", "creditos", "historial"].includes(v.id) || puedeAccederCaja,
  );

  return (
    <div className="app">
      <header className="cabecera">
        <div className="marca">
          <img src="/logo2.jpeg" alt="Amaiz" className="logo-imagen chica" />
          <div>
            <h1>Amaiz</h1>
            <p className="subtitulo">Mesero App · Sabor Natural y Saludable</p>
          </div>
        </div>

        <div className="chip-usuario">
          <span
            className="avatar-mini"
            style={{
              background: COLORES_ROL[usuario.rol] || "#8A9170",
            }}
          >
            {nombre.charAt(0).toUpperCase()}
          </span>
          <div>
            <strong>{nombre}</strong>
            <small>@{usuario.username}</small>
          </div>
        </div>
      </header>

      <main className="panel">
        {vista === "mesas" && (
          <VistaMesas sesion={sesion} onTomarPedido={tomarPedidoEnMesa} />
        )}

        {vista === "ordenes" && (
          <VistaOrdenes
            sesion={sesion}
            mesaInicial={mesaParaOrden}
            alConsumarMesaInicial={() => setMesaParaOrden(null)}
          />
        )}

        {vista === "caja" && puedeAccederCaja && <VistaCaja sesion={sesion} />}

        {vista === "creditos" && puedeAccederCaja && (
          <VistaCreditos sesion={sesion} />
        )}

        {vista === "historial" && puedeAccederCaja && (
          <VistaHistorial sesion={sesion} />
        )}

        {vista === "perfil" && (
          <VistaPerfil sesion={sesion} alSalir={alSalir} />
        )}
      </main>

      <nav className="tabs">
        <div className="tabs-interior">
          {vistasDisponibles.map((v) => (
            <button
              key={v.id}
              className={`tab ${vista === v.id ? "activo" : ""}`}
              onClick={() => setVista(v.id)}
            >
              <span className="tab-icono">{v.icono}</span>
              <span>{v.etiqueta}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
