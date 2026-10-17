import { useEffect, useState } from "react";
import Login from "./Login";
import Dashboard from "./Dashboard";
import { leerSesion, borrarSesion, obtenerPerfil } from "./api";
import "./App.css";

export default function App() {
  const [sesion, setSesion] = useState(null);
  const [verificando, setVerificando] = useState(true);

  // Al cargar: ¿hay sesión guardada? ¿su token sigue vivo?
  useEffect(() => {
    const guardada = leerSesion();
    if (!guardada) {
      setVerificando(false);
      return;
    }
    obtenerPerfil(guardada.accessToken)
      .then(() => setSesion(guardada)) // token vivo → directo al dashboard
      .catch((e) => {
        if (e.message === "token-invalido") {
          borrarSesion(); // vencido: a ingresar de nuevo
        } else {
          setSesion(guardada); // backend abajo: entramos igual (modo optimista)
        }
      })
      .finally(() => setVerificando(false));
  }, []);

  if (verificando) {
    return (
      <div className="pantalla-carga">
        <img src="/logo2.jpeg" alt="Amaiz" className="logo-imagen latiendo" />
        <p>Recuperando tu sesión…</p>
      </div>
    );
  }

  return sesion ? (
    <Dashboard sesion={sesion} alSalir={() => setSesion(null)} />
  ) : (
    <Login alIniciar={setSesion} />
  );
}
