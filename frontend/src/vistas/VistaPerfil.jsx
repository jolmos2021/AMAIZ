import { useState } from "react";
import { obtenerPerfil, borrarSesion } from "../api";

// Color del chip según rol (roles desconocidos → verde hoja apagado)
const COLORES_ROL = {
  ADMINISTRADOR: "#C0453E",
  MESERO: "#C98A1B",
  CAJERO: "#3E7EC0",
  COCINERO: "#7C5CBF",
};

export default function VistaPerfil({ sesion, alSalir }) {
  const { usuario, accessToken } = sesion;
  const [perfil, setPerfil] = useState(null);
  const [estado, setEstado] = useState("");
  const [cargando, setCargando] = useState(false);

  const verificarToken = async () => {
    setPerfil(null);
    setEstado("");
    setCargando(true);
    try {
      const p = await obtenerPerfil(accessToken);
      setPerfil(p);
      setEstado("ok");
    } catch (e) {
      if (e.message === "token-invalido") setEstado("invalido");
      else if (e.message === "sin-conexion") setEstado("sin-conexion");
      else setEstado("error");
    } finally {
      setCargando(false);
    }
  };

  const salir = () => {
    borrarSesion();
    alSalir();
  };

  const colorRol = COLORES_ROL[usuario.rol] || "#8A9170";
  const nombre = usuario.nombre || usuario.username;

  return (
    <>
      <section className="tarjeta perfil-tarjeta">
        <div className="avatar" style={{ background: colorRol }}>
          {nombre.charAt(0).toUpperCase()}
        </div>
        <div className="perfil-datos">
          <h2>{nombre}</h2>
          <p className="perfil-usuario">@{usuario.username}</p>
          <span className="rol-chip" style={{ background: colorRol }}>
            {usuario.rol}
          </span>
        </div>
      </section>

      <section className="tarjeta">
        <h2>🎫 Tu token de acceso (JWT)</h2>
        <p className="ayuda">
          Al ingresar, el backend te entregó un token firmado que este navegador
          guarda y presentará en cada llamada futura. Verifiquemos que el
          backend lo sigue aceptando — esto es exactamente lo que hará cada
          pantalla con datos protegidos.
        </p>
        <code className="token-vista">{accessToken.slice(0, 40)}…</code>
        <div className="fila">
          <button
            className="primario"
            onClick={verificarToken}
            disabled={cargando}
          >
            {cargando ? "Verificando…" : "Verificar token con el backend"}
          </button>
        </div>

        {estado === "ok" && (
          <p className="resultado ok">
            ✅ Token válido — el backend te reconoce como userId{" "}
            <code>{perfil?.userId}</code>, <code>@{perfil?.username}</code>, rol{" "}
            <code>{perfil?.rol}</code>
          </p>
        )}
        {estado === "invalido" && (
          <p className="resultado mal">
            ❌ El backend rechazó el token (vencido o inválido). Cierra sesión y
            vuelve a ingresar.
          </p>
        )}
        {estado === "sin-conexion" && (
          <p className="resultado aviso">
            ⚠️ No se pudo conectar al backend — ¿sigue corriendo en el puerto
            3000?
          </p>
        )}
      </section>

      <section className="tarjeta">
        <h2>🔐 Cómo funciona tu sesión</h2>
        <ul className="lista-sesion">
          <li>
            <strong>POST /api/auth/login</strong> validó tu usuario y contraseña
            contra Postgres
          </li>
          <li>
            El backend firmó un <strong>JWT</strong> (vence en 8 horas) con tu
            id, usuario y rol
          </li>
          <li>
            El token queda en <strong>localStorage</strong>: sobrevive a F5 y al
            cierre del navegador
          </li>
          <li>
            Al cargar, la app pregunta a <strong>GET /api/auth/perfil</strong>{" "}
            si el token sigue vivo
          </li>
          <li>
            El username es <strong>insensible a mayúsculas</strong> — decisión
            que vive en el backend
          </li>
          <li>
            Próximas etapas: el token viajará por el <strong>WebSocket</strong>{" "}
            y en cada llamada de mesas y órdenes
          </li>
        </ul>
      </section>

      <button className="salir" onClick={salir}>
        Cerrar sesión
      </button>
    </>
  );
}
