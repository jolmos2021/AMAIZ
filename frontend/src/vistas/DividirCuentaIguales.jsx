import { useEffect, useRef, useState } from "react";
import { obtenerSubcuentasOrden, dividirCuentaIguales } from "../api";

export default function DividirCuentaIguales({
  totalCobrable,
  token,
  ordenId,
  onDivisionRegistrada,
}) {
  const [nombres, setNombres] = useState(["Persona 1", "Persona 2"]);
  const [guardando, setGuardando] = useState(false);
  const envioEnProceso = useRef(false);
  const [estadoDivision, setEstadoDivision] = useState("CONSULTANDO");
  const [errorDivision, setErrorDivision] = useState("");

  useEffect(() => {
    let activo = true;

    setEstadoDivision("CONSULTANDO");
    setErrorDivision("");

    obtenerSubcuentasOrden(token, ordenId)
      .then((datos) => {
        if (!activo) return;

        if (!Array.isArray(datos)) {
          throw new Error("Respuesta de subcuentas no válida.");
        }

        setEstadoDivision(datos.length === 0 ? "DISPONIBLE" : "BLOQUEADO");
      })
      .catch((err) => {
        if (!activo) return;
        setEstadoDivision("ERROR");
        setErrorDivision(err.message || "Error al consultar subcuentas.");
      });

    return () => {
      activo = false;
    };
  }, [token, ordenId]);

  const idOrden = Number(ordenId);
  const ordenValida = Number.isSafeInteger(idOrden) && idOrden > 0;

  const total = Number(totalCobrable);
  const totalValido = Number.isFinite(total) && total > 0;
  const centavos = totalValido ? Math.round(total * 100) : 0;

  const formatoMonto = (valor) =>
    `$${(valor / 100).toLocaleString("es-CL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const cambiarCantidad = (cantidad) => {
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 50) {
      return;
    }

    setNombres((actuales) =>
      Array.from(
        { length: cantidad },
        (_, i) => actuales[i] ?? `Persona ${i + 1}`,
      ),
    );
  };

  const base = Math.floor(centavos / nombres.length);
  const resto = centavos % nombres.length;

  const nombresLimpios = nombres.map((nombre) => nombre.trim());

  const nombresValidos =
    nombresLimpios.every((nombre) => nombre.length > 0) &&
    new Set(nombresLimpios.map((nombre) => nombre.toLocaleLowerCase())).size ===
      nombresLimpios.length;

  const puedeConfirmar =
    ordenValida &&
    estadoDivision === "DISPONIBLE" &&
    totalValido &&
    base > 0 &&
    nombresValidos &&
    !guardando;

  const registrarDivision = async () => {
    if (!puedeConfirmar || envioEnProceso.current) return;

    envioEnProceso.current = true;
    setGuardando(true);
    setErrorDivision("");

    try {
      const subcuentas = await obtenerSubcuentasOrden(token, ordenId);

      if (!Array.isArray(subcuentas)) {
        throw new Error("Respuesta de subcuentas no válida.");
      }

      if (subcuentas.length > 0) {
        setEstadoDivision("BLOQUEADO");
        throw new Error("Esta orden ya tiene subcuentas registradas.");
      }

      await dividirCuentaIguales(token, ordenId, nombresLimpios);

      setEstadoDivision("BLOQUEADO");

      window.alert("La división se registró correctamente.");

      if (typeof onDivisionRegistrada === "function") {
        try {
          await onDivisionRegistrada(ordenId);
        } catch (errorActualizacion) {
          console.error(
            "La división se registró, pero falló la actualización visual:",
            errorActualizacion,
          );
        }
      }
    } catch (err) {
      setErrorDivision(err.message || "No se pudo registrar la división.");

      setEstadoDivision((estadoActual) =>
        estadoActual === "BLOQUEADO" ? "BLOQUEADO" : "ERROR",
      );
    } finally {
      envioEnProceso.current = false;
      setGuardando(false);
    }
  };

  return (
    <div className="tarjeta">
      <h4>Dividir cuenta en partes iguales</h4>

      <p>
        <strong>Total cobrable:</strong>{" "}
        {totalValido ? formatoMonto(centavos) : "No disponible"}
      </p>

      {estadoDivision === "CONSULTANDO" && (
        <p>Verificando si la orden tiene subcuentas...</p>
      )}

      {estadoDivision === "BLOQUEADO" && (
        <p role="alert">
          Esta orden ya tiene subcuentas y no puede dividirse nuevamente.
        </p>
      )}

      {estadoDivision === "ERROR" && (
        <p role="alert">No se pudo verificar la división: {errorDivision}</p>
      )}

      {estadoDivision === "DISPONIBLE" && (
        <p>La orden está disponible para preparar una división.</p>
      )}

      <fieldset
        disabled={estadoDivision !== "DISPONIBLE" || guardando}
        style={{ border: "none", padding: 0, margin: 0 }}
      >
        <label htmlFor="cantidad-personas">Cantidad de personas:</label>{" "}
        <input
          id="cantidad-personas"
          type="number"
          min="1"
          max="50"
          value={nombres.length}
          onChange={(e) => cambiarCantidad(Number(e.target.value))}
        />
        <h4>Distribución propuesta</h4>
        {nombres.map((nombre, i) => {
          const importe = base + (i < resto ? 1 : 0);

          return (
            <div key={i} style={{ marginBottom: "12px" }}>
              <input
                type="text"
                maxLength={100}
                value={nombre}
                aria-label={`Nombre de persona ${i + 1}`}
                onChange={(e) => {
                  const copia = [...nombres];
                  copia[i] = e.target.value;
                  setNombres(copia);
                }}
              />
              {" — "}
              <strong>{formatoMonto(importe)}</strong>
            </div>
          );
        })}
      </fieldset>

      {!ordenValida && (
        <p role="alert">No se ha seleccionado una orden válida.</p>
      )}

      {!totalValido && (
        <p role="alert">La orden no tiene un total válido para dividir.</p>
      )}

      {totalValido && base === 0 && (
        <p role="alert">
          El total no permite crear tantas subcuentas positivas.
        </p>
      )}

      {!nombresValidos && (
        <p role="alert">
          Todas las personas deben tener nombres distintos y no vacíos.
        </p>
      )}

      <p>
        <strong>Estado de validación:</strong>{" "}
        {puedeConfirmar
          ? "La división está lista para confirmar."
          : "La división todavía no puede confirmarse."}
      </p>

      <button
        type="button"
        disabled={!puedeConfirmar}
        onClick={() => {
          if (!puedeConfirmar || envioEnProceso.current) return;

          const resumen = nombresLimpios
            .map((nombre, i) => {
              const importe = base + (i < resto ? 1 : 0);
              return `${nombre}: ${formatoMonto(importe)}`;
            })
            .join("\n");

          const confirmado = window.confirm(
            `¿Registrar realmente la división de la orden ${ordenId}?\n\n` +
              resumen +
              "\n\nEsta operación guardará las subcuentas en PostgreSQL.",
          );

          if (!confirmado) return;

          registrarDivision();
        }}
      >
        {guardando ? "Registrando división..." : "Confirmar división"}
      </button>
    </div>
  );
}
