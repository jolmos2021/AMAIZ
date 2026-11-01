import { useEffect, useState } from "react";
import { buscarClientes, crearCliente, editarCliente, eliminarCliente } from "../api";

const ROLES_AUTORIZADOS = ["ADMINISTRADOR", "CAJERO"];

const ESTILO_CELDA = {
  padding: 8,
  borderTop: "1px solid #ddd",
};

const ESTILO_CAMPO = {
  display: "block",
  width: "100%",
  padding: 8,
};

function formatearFecha(fecha) {
  if (!fecha) return "—";

  const valor = new Date(fecha);

  if (Number.isNaN(valor.getTime())) {
    return "—";
  }

  return valor.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function VistaClientes({ sesion }) {
  const token = sesion?.accessToken;
  const autorizado = ROLES_AUTORIZADOS.includes(sesion?.usuario?.rol);
  const esAdministrador = sesion?.usuario?.rol === "ADMINISTRADOR";

  const [termino, setTermino] = useState("");
  const [clientes, setClientes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tipo, setTipo] = useState("NORMAL");

  const [clienteEditando, setClienteEditando] = useState(null);
  const [nombreEdicion, setNombreEdicion] = useState("");
  const [telefonoEdicion, setTelefonoEdicion] = useState("");
  const [tipoEdicion, setTipoEdicion] = useState("NORMAL");

  async function cargarClientes(busqueda = "") {
    if (!token || !autorizado) return;

    setCargando(true);
    setError("");

    try {
      const resultado = await buscarClientes(token, busqueda);

      setClientes(Array.isArray(resultado) ? resultado : []);
    } catch (e) {
      setError(e?.message || "No fue posible consultar los clientes.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (autorizado && token) {
      cargarClientes("");
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, autorizado]);

  function iniciarEdicion(cliente) {
    setClienteEditando(cliente);
    setNombreEdicion(cliente.nombre || "");
    setTelefonoEdicion(cliente.telefono || "");
    setTipoEdicion(cliente.tipo || "NORMAL");

    setMostrarFormulario(false);
    setError("");
    setAviso("");
  }

  function cancelarEdicion() {
    setClienteEditando(null);
    setNombreEdicion("");
    setTelefonoEdicion("");
    setTipoEdicion("NORMAL");
    setError("");
  }

  async function guardarEdicion(evento) {
    evento.preventDefault();

    if (!autorizado || !clienteEditando || guardando) {
      return;
    }

    setError("");
    setAviso("");

    const nombreLimpio = nombreEdicion.trim();
    const telefonoLimpio = telefonoEdicion.trim();

    if (!nombreLimpio || nombreLimpio.length > 150) {
      setError("El nombre debe tener entre 1 y 150 caracteres.");
      return;
    }

    if (telefonoLimpio.length > 20) {
      setError("El teléfono no puede superar 20 caracteres.");
      return;
    }

    setGuardando(true);

    try {
      const datos = {
        nombre: nombreLimpio,
        telefono: telefonoLimpio,
        tipo: tipoEdicion,
      };

      await editarCliente(token, clienteEditando.id, datos);

      cancelarEdicion();

      await cargarClientes(termino);

      setAviso("Cliente actualizado correctamente.");
    } catch (e) {
      setError(e?.message || "No fue posible actualizar el cliente.");
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarEliminacion(cliente) {
    if (!esAdministrador || !token || guardando) return;

    const confirmado = window.confirm(
      `¿Confirmas que deseas eliminar al cliente #${cliente.id} (${cliente.nombre})?\n\n` +
        "Esta acción no se puede deshacer. Si tiene órdenes, créditos o subcuentas, " +
        "el sistema impedirá su eliminación.",
    );

    if (!confirmado) return;

    setError("");
    setAviso("");
    setGuardando(true);

    try {
      await eliminarCliente(token, cliente.id);
      if (String(clienteEditando?.id) === String(cliente.id)) {
        cancelarEdicion();
      }
      await cargarClientes(termino);
      setAviso(`Cliente #${cliente.id} eliminado correctamente.`);
    } catch (e) {
      setError(e?.message || "No fue posible eliminar el cliente.");
    } finally {
      setGuardando(false);
    }
  }

  async function registrar(evento) {
    evento.preventDefault();

    if (!autorizado || guardando) return;

    setError("");
    setAviso("");

    const nombreLimpio = nombre.trim();
    const telefonoLimpio = telefono.trim();

    if (!nombreLimpio || nombreLimpio.length > 150) {
      setError("El nombre debe tener entre 1 y 150 caracteres.");
      return;
    }

    if (telefonoLimpio.length > 20) {
      setError("El teléfono no puede superar 20 caracteres.");
      return;
    }

    setGuardando(true);

    try {
      const posibles = await buscarClientes(
        token,
        telefonoLimpio || nombreLimpio,
      );

      const duplicado = (Array.isArray(posibles) ? posibles : []).some(
        (cliente) =>
          (telefonoLimpio && cliente.telefono?.trim() === telefonoLimpio) ||
          cliente.nombre?.trim().toLocaleLowerCase() ===
            nombreLimpio.toLocaleLowerCase(),
      );

      if (duplicado) {
        const confirmar = window.confirm(
          "Existe un cliente con el mismo nombre o teléfono. " +
            "¿Deseas registrarlo de todas formas?",
        );

        if (!confirmar) return;
      }

      await crearCliente(token, {
        nombre: nombreLimpio,
        telefono: telefonoLimpio || undefined,
        tipo,
      });

      setNombre("");
      setTelefono("");
      setTipo("NORMAL");
      setMostrarFormulario(false);
      setTermino("");

      await cargarClientes("");

      setAviso("Cliente registrado correctamente.");
    } catch (e) {
      setError(e?.message || "No fue posible registrar el cliente.");
    } finally {
      setGuardando(false);
    }
  }

  if (!autorizado) {
    return (
      <section>
        <h2>Clientes</h2>
        <p>No tienes permisos para acceder a esta sección.</p>
      </section>
    );
  }

  return (
    <section
      style={{
        padding: "1rem",
        maxWidth: 980,
        margin: "0 auto",
      }}
    >
      <h2>Clientes</h2>

      <p>Consulta, registra y edita clientes del restaurante.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          cargarClientes(termino);
        }}
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <input
          aria-label="Buscar cliente por nombre o teléfono"
          placeholder="Nombre o teléfono"
          value={termino}
          onChange={(e) => setTermino(e.target.value)}
          style={{
            flex: "1 1 220px",
            padding: 10,
          }}
        />

        <button type="submit" disabled={cargando}>
          Buscar
        </button>

        <button
          type="button"
          disabled={cargando}
          onClick={() => {
            setTermino("");
            cargarClientes("");
          }}
        >
          Mostrar todos
        </button>

        <button
          type="button"
          disabled={guardando}
          onClick={() => {
            cancelarEdicion();
            setMostrarFormulario((actual) => !actual);
            setAviso("");
          }}
        >
          {mostrarFormulario ? "Cancelar registro" : "Nuevo cliente"}
        </button>
      </form>

      {error && (
        <p role="alert" style={{ color: "#a12622" }}>
          {error}
        </p>
      )}

      {aviso && <p role="status">{aviso}</p>}

      {mostrarFormulario && (
        <form
          onSubmit={registrar}
          style={{
            display: "grid",
            gap: 10,
            padding: 16,
            border: "1px solid #ccc",
            borderRadius: 8,
            marginBottom: 20,
          }}
        >
          <h3>Registrar cliente</h3>

          <label>
            Nombre *
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={150}
              required
              style={ESTILO_CAMPO}
            />
          </label>

          <label>
            Teléfono
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              maxLength={20}
              style={ESTILO_CAMPO}
            />
          </label>

          <label>
            Tipo de cliente
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              style={ESTILO_CAMPO}
            >
              <option value="NORMAL">NORMAL</option>
              <option value="VIP">VIP</option>
            </select>
          </label>

          <button type="submit" disabled={guardando}>
            {guardando ? "Guardando..." : "Registrar cliente"}
          </button>
        </form>
      )}

      {clienteEditando && (
        <form
          onSubmit={guardarEdicion}
          style={{
            display: "grid",
            gap: 10,
            padding: 16,
            border: "1px solid #ccc",
            borderRadius: 8,
            marginBottom: 20,
          }}
        >
          <h3>Editar cliente #{clienteEditando.id}</h3>

          <p>Fecha de creación: {formatearFecha(clienteEditando.created_at)}</p>

          <label>
            Nombre *
            <input
              value={nombreEdicion}
              onChange={(e) => setNombreEdicion(e.target.value)}
              maxLength={150}
              required
              style={ESTILO_CAMPO}
            />
          </label>

          <label>
            Teléfono
            <input
              value={telefonoEdicion}
              onChange={(e) => setTelefonoEdicion(e.target.value)}
              maxLength={20}
              style={ESTILO_CAMPO}
            />
          </label>

          <label>
            Tipo de cliente
            <select
              value={tipoEdicion}
              onChange={(e) => setTipoEdicion(e.target.value)}
              style={ESTILO_CAMPO}
            >
              <option value="NORMAL">NORMAL</option>
              <option value="VIP">VIP</option>
            </select>
          </label>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <button type="submit" disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar cambios"}
            </button>

            <button
              type="button"
              disabled={guardando}
              onClick={cancelarEdicion}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <h3>Listado de clientes</h3>

      {cargando ? (
        <p>Consultando clientes...</p>
      ) : clientes.length === 0 ? (
        <p>No se encontraron clientes.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 780,
            }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 8 }}>ID</th>
                <th style={{ textAlign: "left", padding: 8 }}>Nombre</th>
                <th style={{ textAlign: "left", padding: 8 }}>Teléfono</th>
                <th style={{ textAlign: "left", padding: 8 }}>Tipo</th>
                <th style={{ textAlign: "left", padding: 8 }}>
                  Fecha de creación
                </th>
                <th style={{ textAlign: "left", padding: 8 }}>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {clientes.map((cliente) => (
                <tr key={cliente.id}>
                  <td style={ESTILO_CELDA}>{cliente.id}</td>

                  <td style={ESTILO_CELDA}>{cliente.nombre}</td>

                  <td style={ESTILO_CELDA}>{cliente.telefono || "—"}</td>

                  <td style={ESTILO_CELDA}>{cliente.tipo}</td>

                  <td
                    style={{
                      ...ESTILO_CELDA,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatearFecha(cliente.created_at)}
                  </td>

                  <td style={ESTILO_CELDA}>
                    <button
                      type="button"
                      disabled={guardando}
                      onClick={() => iniciarEdicion(cliente)}
                    >
                      Editar
                    </button>
                    {esAdministrador && (
                      <button
                        type="button"
                        disabled={guardando}
                        onClick={() => confirmarEliminacion(cliente)}
                        style={{ marginLeft: 8, color: "#a12622" }}
                      >
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {clientes.length === 50 && (
            <p>
              Se muestran hasta 50 resultados. Usa la búsqueda para encontrar
              otros clientes.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
