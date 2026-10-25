import { useEffect, useState } from "react";
import { obtenerSubcuentasOrden } from "../api";

export default function DetalleSubcuentas({
  token,
  ordenId,
  versionActualizacion = 0,
}) {
  const [subcuentas, setSubcuentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let activo = true;

    setCargando(true);
    setError("");
    setSubcuentas([]);

    obtenerSubcuentasOrden(token, ordenId)
      .then((datos) => {
        if (!activo) return;

        if (!Array.isArray(datos)) {
          throw new Error("Respuesta de subcuentas no válida");
        }

        setSubcuentas(datos);
      })
      .catch((err) => {
        if (activo) setError(err.message);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [token, ordenId, versionActualizacion]);

  const moneda = (valor) =>
    `$${Number(valor).toLocaleString("es-CL", {
      maximumFractionDigits: 2,
    })}`;

  return (
    <div>
      <h4>Subcuentas</h4>

      {cargando && <p>Consultando subcuentas...</p>}

      {error && <p role="alert">Error: {error}</p>}

      {!cargando && !error && subcuentas.length === 0 && (
        <p>Esta orden todavía no tiene subcuentas.</p>
      )}

      {!cargando && !error && subcuentas.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", textAlign: "left" }}>
            <thead>
              <tr>
                <th>Persona</th>
                <th>Total asignado</th>
                <th>Pagado</th>
                <th>Crédito</th>
                <th>Saldo por cubrir</th>
              </tr>
            </thead>
            <tbody>
              {subcuentas.map((subcuenta) => (
                <tr key={subcuenta.id}>
                  <td>
                    {subcuenta.nombre ||
                      `Persona ${subcuenta.numero_persona}`}
                  </td>
                  <td>{moneda(subcuenta.total_asignado)}</td>
                  <td>{moneda(subcuenta.total_pagado)}</td>
                  <td>{moneda(subcuenta.total_credito)}</td>
                  <td>{moneda(subcuenta.saldo_por_cubrir)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

