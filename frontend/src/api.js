const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
const CLAVE_SESION = "meseroapp.sesion";

export { API_URL };

// ─── Persistencia de la sesión ───
export function leerSesion() {
  try {
    const cruda = localStorage.getItem(CLAVE_SESION);
    if (!cruda) return null;
    const sesion = JSON.parse(cruda);
    return sesion?.accessToken ? sesion : null;
  } catch {
    return null;
  }
}

export function guardarSesion(sesion) {
  localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
}

export function borrarSesion() {
  localStorage.removeItem(CLAVE_SESION);
}

// ─── Llamadas al backend ───
function extraerMensaje(data, status) {
  if (Array.isArray(data?.message)) return data.message.join(" · ");
  if (typeof data?.message === "string") return data.message;
  return `Error inesperado (HTTP ${status})`;
}

async function pedir(url, opciones = {}) {
  let res;
  try {
    res = await fetch(url, opciones);
  } catch {
    throw new Error("sin-conexion");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(extraerMensaje(data, res.status));
  return data;
}

export async function login(username, password) {
  let res;
  try {
    res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new Error(
      "No se pudo conectar al backend — ¿está corriendo en el puerto 3000?",
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(extraerMensaje(data, res.status));
  return data;
}

export async function obtenerPerfil(token) {
  let res;
  try {
    res = await fetch(`${API_URL}/auth/perfil`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error("sin-conexion");
  }
  if (res.status === 401) throw new Error("token-invalido");
  if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
  return res.json();
}

// ─── Mesas ───
const authHeaders = (token, json = false) => ({
  Authorization: `Bearer ${token}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

export const obtenerMesas = (token) =>
  pedir(`${API_URL}/mesas`, { headers: authHeaders(token) });

export const guardarDisposicion = (token, posiciones) =>
  pedir(`${API_URL}/mesas/disposicion`, {
    method: "PATCH",
    headers: authHeaders(token, true),
    body: JSON.stringify({ mesas: posiciones }),
  });

export const cambiarEstadoMesa = (token, id, estado) =>
  pedir(`${API_URL}/mesas/${id}/estado`, {
    method: "PATCH",
    headers: authHeaders(token, true),
    body: JSON.stringify({ estado }),
  });

export const crearMesa = (token, dto) =>
  pedir(`${API_URL}/mesas`, {
    method: "POST",
    headers: authHeaders(token, true),
    body: JSON.stringify(dto),
  });

export const eliminarMesa = (token, id) =>
  pedir(`${API_URL}/mesas/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });

// ─── Órdenes ───
export const obtenerMenuDelDia = (token) =>
  pedir(`${API_URL}/productos/menu-del-dia`, { headers: authHeaders(token) });

export const obtenerOrdenesActivas = (token) =>
  pedir(`${API_URL}/ordenes/activas`, { headers: authHeaders(token) });

export const crearOrden = (token, dto) =>
  pedir(`${API_URL}/ordenes`, {
    method: "POST",
    headers: authHeaders(token, true),
    body: JSON.stringify(dto),
  });

export const agregarItemsOrden = (token, ordenId, dto) =>
  pedir(`${API_URL}/ordenes/${ordenId}/items`, {
    method: "POST",
    headers: authHeaders(token, true),
    body: JSON.stringify(dto),
  });

export const avanzarItem = (token, ordenId, itemId, estadoItem) =>
  pedir(`${API_URL}/ordenes/${ordenId}/items/${itemId}/estado`, {
    method: "PATCH",
    headers: authHeaders(token, true),
    body: JSON.stringify({ estadoItem }),
  });

export const cambiarEstadoItem = (token, ordenId, itemId, estadoItem) =>
  avanzarItem(token, ordenId, itemId, estadoItem);

export const anularItem = (token, ordenId, itemId) =>
  pedir(`${API_URL}/ordenes/${ordenId}/items/${itemId}/anular`, {
    method: "PATCH",
    headers: authHeaders(token),
  });

export const entregarOrden = (token, ordenId) =>
  pedir(`${API_URL}/ordenes/${ordenId}/entregar`, {
    method: "PATCH",
    headers: authHeaders(token),
  });

export const anularOrden = (token, ordenId) =>
  pedir(`${API_URL}/ordenes/${ordenId}/anular`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
