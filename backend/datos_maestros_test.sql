BEGIN;

INSERT INTO categorias (nombre, descripcion)
VALUES
('Bebidas', 'Categoría de prueba'),
('Comidas', 'Categoría de prueba'),
('Postres', 'Categoría de prueba');

INSERT INTO productos
(nombre, precio, categoria_id, maneja_inventario,
 stock_actual, disponible_menu_dia)
VALUES
('Café de prueba', 3500,
 (SELECT id FROM categorias WHERE nombre = 'Bebidas'),
 FALSE, 0, TRUE),

('Jugo de prueba', 5000,
 (SELECT id FROM categorias WHERE nombre = 'Bebidas'),
 FALSE, 0, TRUE),

('Hamburguesa de prueba', 18000,
 (SELECT id FROM categorias WHERE nombre = 'Comidas'),
 FALSE, 0, TRUE),

('Pizza de prueba', 25000,
 (SELECT id FROM categorias WHERE nombre = 'Comidas'),
 FALSE, 0, TRUE),

('Helado de prueba', 7000,
 (SELECT id FROM categorias WHERE nombre = 'Postres'),
 FALSE, 0, TRUE);

INSERT INTO mesas
(numero, capacidad_maxima, coordenada_x, coordenada_y, estado)
VALUES
(1, 4, 100, 100, 'LIBRE'),
(2, 4, 250, 100, 'LIBRE'),
(3, 6, 100, 250, 'LIBRE'),
(4, 2, 250, 250, 'LIBRE');

INSERT INTO metodos_pago (nombre, activo)
VALUES
('EFECTIVO', TRUE),
('TARJETA', TRUE),
('TRANSFERENCIA', TRUE),
('CRÉDITO', TRUE);

COMMIT;
