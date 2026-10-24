BEGIN;

-- Usuario exclusivo de pruebas.
INSERT INTO usuarios
  (username, nombre, password_hash, rol, estado)
VALUES
  ('admin_test_amaiz', 'Administrador de Pruebas',
   NULL, 'ADMINISTRADOR', 'ACTIVO');

-- Cliente ficticio.
INSERT INTO clientes
  (nombre, telefono, tipo)
VALUES
  ('Cliente Prueba AMAIZ', NULL, 'NORMAL');

-- Caja vinculada al usuario de pruebas.
INSERT INTO cajas
  (usuario_id, monto_inicial, estado)
SELECT
  id, 100000, 'ABIERTA'
FROM usuarios
WHERE username = 'admin_test_amaiz';

COMMIT;
