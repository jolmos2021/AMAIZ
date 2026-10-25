const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
const CLAVE_SESION = "meseroapp.sesion";

export { API_URL };

// --- Persistencia de la sesión ---
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

// --- Llamadas al backend ---
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

// --- Mesas ---
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

// --- Órdenes ---
export const obtenerMenuDelDia = (token) =>
  pedir(`${API_URL}/productos/menu-del-dia`, {
    headers: authHeaders(token),
  });

export const obtenerOrdenesActivas = (token) =>
  pedir(`${API_URL}/ordenes/activas`, {
    headers: authHeaders(token),
  });

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

// --- Caja y Cobros ---
export const obtenerCajaActual = (token) =>
  pedir(`${API_URL}/cajas/actual`, {
    headers: authHeaders(token),
  });

// Consultar detalle y total cobrable de una orden
export const obtenerDetalleCobro = (token, ordenId) =>
  pedir(`${API_URL}/cobros/orden/${ordenId}`, {
    headers: authHeaders(token),
  });

// Consultar subcuentas y sus saldos
export const obtenerSubcuentasOrden = (token, ordenId) =>
  pedir(`${API_URL}/cobros/orden/${ordenId}/subcuentas`, {
    headers: authHeaders(token),
  });

// Registrar una división de cuenta en partes iguales
export const dividirCuentaIguales = (token, ordenId, nombres) =>
  pedir(`${API_URL}/cobros/orden/${ordenId}/dividir`, {
    method: "POST",
    headers: authHeaders(token, true),
    body: JSON.stringify({
      modalidad: "IGUALES",
      personas: nombres.map((nombre) => ({
        nombre: nombre.trim(),
      })),
    }),
  });

// Consultar métodos de pago configurados
export const obtenerMetodosPago = (token) =>
  pedir(`${API_URL}/cobros/metodos`, {
    headers: authHeaders(token),
  });

// Registrar un pago individual asociado a una subcuenta
export const registrarPagoSubcuenta = (
  token,
  ordenId,
  subcuentaId,
  metodoPagoId,
  valor,
) =>
  pedir(`${API_URL}/cobros/orden/${ordenId}/pagar`, {
    method: "POST",
    headers: authHeaders(token, true),
    body: JSON.stringify({
      subcuentaId,
      metodoPagoId,
      valor,
    }),
  });

// Obtener saldo por cubrir de una orden
export async function obtenerSaldoOrden(token, ordenId) {
  const [detalle, subcuentas] = await Promise.all([
    obtenerDetalleCobro(token, ordenId),
    obtenerSubcuentasOrden(token, ordenId),
  ]);

  if (!Array.isArray(subcuentas)) {
    throw new Error("Respuesta de subcuentas no válida");
  }

  const totalCobrable = Number(detalle.total);

  if (!Number.isFinite(totalCobrable)) {
    throw new Error("Total cobrable no válido");
  }

  if (subcuentas.length === 0) {
    return {
      totalCobrable,
      saldoPorCubrir: totalCobrable,
      cantidadSubcuentas: 0,
    };
  }

  const saldos = subcuentas.map((subcuenta) =>
    Number(subcuenta.saldo_por_cubrir),
  );

  if (saldos.some((saldo) => !Number.isFinite(saldo))) {
    throw new Error("Saldo de subcuenta no válido");
  }

  return {
    totalCobrable,
    saldoPorCubrir: saldos.reduce((total, saldo) => total + saldo, 0),
    cantidadSubcuentas: subcuentas.length,
  };
}

// --- Clientes ---

// Buscar clientes por nombre o teléfono.
// Sin término, devuelve los primeros 50 clientes.
export const buscarClientes = (token, termino = "") =>
  pedir(`${API_URL}/clientes?q=${encodeURIComponent(termino.trim())}`, {
    headers: authHeaders(token),
  });

// Registrar un cliente NORMAL o VIP.
export const crearCliente = (token, datos) =>
  pedir(`${API_URL}/clientes`, {
    method: "POST",
    headers: authHeaders(token, true),
    body: JSON.stringify(datos),
  });

// --- Créditos ---

// Registrar un crédito parcial o total para una subcuenta.
// Esta operación crea un crédito real en PostgreSQL.
export const registrarCreditoSubcuenta = (
  token,
  ordenId,
  subcuentaId,
  clienteId,
  valor,
) =>
  pedir(`${API_URL}/cobros/orden/${ordenId}/credito`, {
    method: "POST",
    headers: authHeaders(token, true),
    body: JSON.stringify({
      subcuentaId,
      clienteId,
      valor,
    }),
  });
