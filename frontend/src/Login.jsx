import { useState } from "react";
import { login, guardarSesion, API_URL } from "./api";

export default function Login({ alIniciar }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarClave, setMostrarClave] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const enviar = async (evento) => {
    evento.preventDefault(); // evita el recargo clásico del formulario
    setError("");

    if (!username.trim()) {
      setError("Escribe tu nombre de usuario");
      return;
    }
    if (password.length < 4) {
      setError("La contraseña debe tener al menos 4 caracteres");
      return;
    }

    setCargando(true);
    try {
      const sesion = await login(username.trim(), password);
      guardarSesion(sesion);
      alIniciar(sesion); // App.jsx cambia de pantalla
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="login-fondo">
      <form className="login-caja" onSubmit={enviar}>
        <div className="login-marca">
          <img src="/logo2.jpeg" alt="Amaiz" className="logo-imagen" />
          <h1>Mesero App</h1>
          <p className="subtitulo">Ingresa con tu usuario del restaurante</p>
        </div>

        <label className="campo">
          <span>Usuario</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="tu usuario del sistema"
            autoComplete="username"
            autoFocus
          />
        </label>

        <label className="campo">
          <span>Contraseña</span>
          <div className="campo-clave">
            <input
              type={mostrarClave ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            <button
              type="button"
              className="ojo"
              onClick={() => setMostrarClave((v) => !v)}
              aria-label="Mostrar u ocultar contraseña"
            >
              {mostrarClave ? "🙈" : "👁️"}
            </button>
          </div>
        </label>

        {error && <p className="login-error">⚠️ {error}</p>}

        <button
          className="primario login-boton"
          type="submit"
          disabled={cargando}
        >
          {cargando ? "Ingresando…" : "Ingresar"}
        </button>

        <p className="login-pie">
          Backend: <code>{API_URL}</code>
        </p>
      </form>
    </div>
  );
}
