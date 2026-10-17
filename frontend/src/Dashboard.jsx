import { useEffect, useState } from "react";
import VistaMesas from "./vistas/VistaMesas";
import VistaOrdenes from "./vistas/VistaOrdenes";
import VistaPerfil from "./vistas/VistaPerfil";
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
  { id: "perfil", icono: "👤", etiqueta: "Perfil" },
];

export default function Dashboard({ sesion, alSalir }) {
  // Lazy init: arranca en la última pestaña usada (se recuerda entre sesiones)
  const [vista, setVista] = useState(
    () => localStorage.getItem(CLAVE_VISTA) || "mesas",
  );
  // Mesa precargada cuando el mesero hace "Tomar pedido" en el plano
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
            style={{ background: COLORES_ROL[usuario.rol] || "#8A9170" }}
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
        {vista === "perfil" && (
          <VistaPerfil sesion={sesion} alSalir={alSalir} />
        )}
      </main>

      <nav className="tabs">
        <div className="tabs-interior">
          {VISTAS.map((v) => (
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
