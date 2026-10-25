# AMAIZ --- Documento maestro de contexto y continuidad

**Fecha de corte:** 25 de octubre de 2026\
**Propósito:** Transferir el contexto a otra IA o retomar el proyecto
después de perder el hilo.\
**Estado:** Documento de trabajo basado en conversaciones, código y
pruebas compartidas; **no** es una auditoría exhaustiva del
repositorio.\
**Regla principal:** Distinguir entre *confirmado por prueba*, *código
observado*, *propuesto* y *pendiente de verificar*. Nunca presentar una
propuesta como ya implementada.

------------------------------------------------------------------------

## 1. Resumen ejecutivo

**AMAIZ** es un sistema personalizado de gestión para restaurante.
Utiliza un backend **Node.js / NestJS / TypeORM**, un frontend **React /
Vite**, **PostgreSQL** en Docker y autenticación JWT. Incluye trabajo en
usuarios, productos, categorías, mesas, órdenes, cocina, inventario,
caja, división de cuentas, pagos, créditos y actualizaciones en tiempo
real.

El desarrollo está en curso. Se ha compilado correctamente el frontend
con **56 módulos transformados** tras integrar el formulario
`RegistrarPagoSubcuenta.jsx` en `VistaCaja.jsx`, pero **NO se han
probado pagos ni créditos reales en el último tramo**. El formulario de
pagos actual **excluye CRÉDITO** por diseño temporal; el objetivo
inmediato es incorporarlo como cuarto método y asociarlo a clientes
existentes o nuevos.

**Punto exacto de interrupción:** se entregó el contenido completo de
`backend/src/clientes/clientes.service.ts` para crear el archivo (**paso
250-373**), pero el usuario **no confirmó haberlo creado**. Antes de
seguir, pidió un mapa del proyecto y este documento maestro. **No asumir
que `ClientesService` ya existe.** La siguiente acción recomendada es
una consolidación/backup de Git antes de modificar más archivos.

------------------------------------------------------------------------

## 2. Reglas de colaboración del usuario

1.  **Un solo paso por vez**; esperar respuesta o salida de comandos
    antes del siguiente.
2.  **Cuando haya que crear o reemplazar un archivo, entregar el archivo
    COMPLETO**, listo para copiar; no fragmentos parciales.
3.  **Pedir el contenido completo del archivo existente antes de
    reemplazarlo** si no se dispone de su versión actual. Evitar
    sobrescribir funcionalidades.
4.  **No volver a pedir datos ya proporcionados**, salvo que sea
    imprescindible comprobar cambios posteriores.
5.  No modificar otras órdenes, stock, pagos, créditos ni registros de
    PostgreSQL sin autorización explícita.
6.  Preferir comandos PowerShell compatibles con Windows, seguros y de
    solo lectura para diagnóstico.
7.  Compilar, probar de forma controlada, verificar PostgreSQL y crear
    un commit Git por hito.
8.  Distinguir claramente pruebas seguras de acciones que hacen `POST`,
    `INSERT`, `UPDATE` o `DELETE`.
9.  Si falla la descarga de un archivo, proporcionar **el contenido
    íntegro directamente en el chat**. En la conversación anterior hubo
    enlaces de descarga no funcionales.
10. Mantener la **restricción temporal del formulario de pagos a la
    orden `ORD-000011`** mientras duren las pruebas.

------------------------------------------------------------------------

## 3. Entorno técnico y rutas

  -------------------------------------------------------------------------------
  Elemento                            Valor conocido
  ----------------------------------- -------------------------------------------
  Proyecto                            AMAIZ

  Carpeta raíz Windows                `C:\proyectos\restaurante`

  Frontend                            `C:\proyectos\restaurante\frontend`

  Backend                             `C:\proyectos\restaurante\backend`

  Frontend local                      `http://localhost:5173` (Vite)

  API backend                         `http://localhost:3000/api`

  Socket / tiempo real                `http://localhost:3000`

  PostgreSQL Docker                   Contenedor `restaurante-db`

  Base de datos                       `restaurante`

  Usuario PostgreSQL                  `restaurante_admin`

  Repositorio remoto informado        `https://github.com/jolmos2021/AMAIZ.git`

  Sistema operativo de desarrollo     Windows, PowerShell
  -------------------------------------------------------------------------------

**Comandos de diagnóstico seguros:**

``` powershell
# Desde C:\proyectos\restaurante\frontend
npm run build
Get-Content .\src\vistas\VistaCaja.jsx -Raw
Get-Content ..\backend\src\app.module.ts -Raw
git status
git log -5 --oneline

# Solo lectura de esquema PostgreSQL
docker exec restaurante-db psql -U restaurante_admin -d restaurante -c "\d clientes"
```

**Importante:** el estado de Git/GitHub **debe verificarse de nuevo**.
En un momento anterior el repositorio era local sin `origin`;
posteriormente se informó la URL de GitHub. No asumir que el código
actual ya está sincronizado con GitHub. Comprobar `git remote -v`,
`git status` y la rama activa antes de cualquier operación Git.

------------------------------------------------------------------------

## 4. Arquitectura general

``` text
AMAIZ
├── Frontend: React + Vite
│   ├── Login / sesión JWT
│   ├── Mesas y órdenes
│   ├── Vista de caja y cobros
│   ├── División de cuenta
│   ├── Detalle de subcuentas
│   └── Formulario de pagos (actualmente limitado a ORD-000011)
│
├── Backend: NestJS + TypeORM
│   ├── Auth / JWT / roles
│   ├── Usuarios
│   ├── Categorías
│   ├── Productos
│   ├── Mesas
│   ├── Órdenes y cocina
│   ├── Cajas
│   ├── Cobros / subcuentas / pagos / créditos / abonos
│   └── Realtime
│
└── PostgreSQL en Docker
    ├── ordenes, detalles / ítems
    ├── mesas, productos / inventario
    ├── cajas, pagos, metodos_pago
    ├── subcuentas, subcuenta_pagos
    ├── clientes, creditos_clientes
    └── otras tablas por verificar
```

La configuración TypeORM observada en `backend/src/app.module.ts` tiene
`synchronize: false`: **el esquema se gestiona con SQL y no debe
habilitarse la sincronización automática**.

### 4.1 Módulos confirmados por archivos compartidos

En `backend/src/app.module.ts` aparecen los imports de `UsuariosModule`,
`AuthModule`, `CategoriasModule`, `ProductosModule`, `MesasModule`,
`CajasModule`, `RealtimeModule` y `OrdenesModule`. `CobrosModule` está
importado al principio del archivo, **pero no directamente en el arreglo
`imports` de `AppModule`**.

Esto **no implica un error**: en `backend/src/ordenes/ordenes.module.ts`
se confirmó:

``` ts
@Module({
  imports: [TypeOrmModule.forFeature([Orden, DetalleOrden]), CobrosModule],
  controllers: [OrdenesController],
  providers: [OrdenesService],
  exports: [OrdenesService],
})
export class OrdenesModule {}
```

Y `backend/src/cobros/cobros.module.ts`:

``` ts
@Module({
  controllers: [CobrosController],
  providers: [CobrosService],
  exports: [CobrosService],
})
export class CobrosModule {}
```

**No modificar estos módulos por suposiciones.** Se verificó la cadena
de importación `AppModule → OrdenesModule → CobrosModule`.

------------------------------------------------------------------------

## 5. Inventario de funcionalidades e hitos

**Leyenda:** 🟢 prueba puntual satisfactoria; 🟡 código observado o
implementación parcial; ⚪ no verificado o pendiente. Un estado verde
**no** significa prueba integral.

  ----------------------------------------------------------------------------
  Área                    Estado                  Evidencia / pendiente
  ----------------------- ----------------------- ----------------------------
  Backend NestJS          🟡                      Módulos, controladores y
                                                  servicios observados;
                                                  compilación actual no
                                                  verificada en este corte

  Autenticación JWT /     🟡                      Login visible; guards
  roles                                           `JwtAuthGuard`,
                                                  `RolesGuard`; faltan pruebas
                                                  completas de permisos

  Categorías y productos  🟡                      Módulos presentes; CRUD y UI
                                                  no auditados

  Mesas                   🟡                      Módulo y UI previos; faltan
                                                  pruebas integrales de
                                                  ocupación/liberación

  Órdenes                 🟡                      Módulo, controller, service
                                                  y orden de prueba existentes

  Cocina / estados        🟡                      Máquina de estados
                                                  desarrollada en commit
                                                  anterior; interfaz y
                                                  regresión por verificar

  Inventario              🟡                      Lógica de stock y devolución
                                                  discutida; auditoría
                                                  completa pendiente

  Caja                    🟡                      Vista y servicio de caja;
                                                  cierre y arqueo pendientes
                                                  de prueba integral

  División en partes      🟢                      `ORD-000011` dividida en 2 ×
  iguales                                         \$6.740 y comprobada en
                                                  PostgreSQL

  Consulta de subcuentas  🟢                      Vista y totales comprobados
  y saldos                                        para orden de prueba

  Registro de pagos       🟡                      Endpoint y formulario
                                                  integrados; **sin prueba de
                                                  POST en este tramo**

  Créditos                🟡                      Endpoint y transacción
                                                  observados; **sin UI
                                                  integrada ni prueba de
                                                  POST**

  Clientes                ⚪                      Tabla vacía; servicio
                                                  propuesto, creación no
                                                  confirmada

  Abonos de créditos      🟡                      Endpoint existente; UI y
                                                  pruebas no verificadas

  Reportes                ⚪                      Alcance por definir

  Auditoría, respaldos,   ⚪                      Pendientes de
  despliegue                                      planificación/verificación
  ----------------------------------------------------------------------------

### 5.1 Hitos sugeridos

-   **H1 --- Base técnica y esquema:** parcialmente desarrollado;
    consolidar evidencia.
-   **H2 --- Autenticación y catálogos:** desarrollado parcialmente;
    probar.
-   **H3 --- Mesas, órdenes, cocina e inventario:** desarrollado
    parcialmente; pruebas de extremo a extremo.
-   **H4 --- Caja, subcuentas y pagos:** **hito activo**; división
    probada, pagos pendientes.
-   **H5 --- Clientes, créditos y abonos:** **próxima dependencia
    funcional**.
-   **H6 --- Reportes, seguridad, respaldo y despliegue:** pendiente.

------------------------------------------------------------------------

## 6. Punto de prueba controlada: ORD-000011

**Orden:** `ORD-000011`, `ordenes.id = 11`.\
**Tipo:** MOSTRADOR, sin mesa (`mesa_id = NULL`).\
**Estado observado:** `CREADA` (verificar nuevamente antes de usar).\
**Productos:** sopa cremosa de maíz \$5.990 y ensalada Amaiz \$7.490.\
**Total:** **\$13.480**.

**División comprobada en PostgreSQL:**

  ------------------------------------------------------------------------------------
  subcuenta.id      orden_id Persona   Modalidad         Total      Pagado       Saldo
                                                      asignado   observado   observado
  -------------- ----------- --------- ----------- ----------- ----------- -----------
  1                       11 Persona 1 IGUALES         \$6.740         \$0     \$6.740

  2                       11 Persona 2 IGUALES         \$6.740         \$0     \$6.740
  ------------------------------------------------------------------------------------

Total asignado: **\$13.480**. Ambas subcuentas tenían **0 pagos** al
verificar. La orden y sus ítems se describieron con
`maneja_inventario=false`, por lo que esta prueba no debía descontar
stock.

**Precaución:** son datos observados durante el desarrollo, no una
lectura en tiempo real. Consultar la base antes de operar. No registrar
un pago o crédito sin consentimiento; si se cubre todo el saldo, el
backend puede **cerrar automáticamente la orden**.

------------------------------------------------------------------------

## 7. API de cobros confirmada

`backend/src/cobros/cobros.controller.ts` tiene `@Controller('cobros')`
y guards JWT/roles; las rutas están habilitadas para `CAJERO` y
`ADMINISTRADOR`.

  Método   Ruta                                   Función
  -------- -------------------------------------- --------------------
  GET      `/cobros/metodos`                      Métodos de pago
  GET      `/cobros/orden/:id`                    Resumen de cobro
  GET      `/cobros/orden/:id/subcuentas`         Subcuentas
  POST     `/cobros/orden/:id/dividir`            División de cuenta
  POST     `/cobros/orden/:id/pagar`              Pago convencional
  POST     `/cobros/orden/:id/credito`            Venta a crédito
  POST     `/cobros/orden/:id/liquidar`           Liquidación
  POST     `/cobros/creditos/:creditoId/abonos`   Abonos de crédito

### 7.1 Métodos de pago

Valores observados en `metodos_pago`:

    ID Método          Activo
  ---- --------------- --------
     1 EFECTIVO        Sí
     2 TARJETA         Sí
     3 TRANSFERENCIA   Sí
     4 CRÉDITO         Sí

**Decisión funcional:** los **cuatro** deben mostrarse en el **mismo
formulario de cobros**. El backend usa dos operaciones distintas:

-   EFECTIVO, TARJETA, TRANSFERENCIA → `POST /cobros/orden/:id/pagar`.
-   CRÉDITO → `POST /cobros/orden/:id/credito`.

**No** basta con quitar el filtro `CRÉDITO` en React: `/pagar` lo
rechaza expresamente.

### 7.2 DTO de pago

`backend/src/cobros/dto/registrar-pago.dto.ts`:

``` ts
export class RegistrarPagoDto {
  @IsInt() @Min(1) subcuentaId: number;
  @IsInt() @Min(1) metodoPagoId: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) valor: number;
  @IsOptional() @IsString() @MaxLength(250) observacion?: string;
}
```

El servicio valida caja abierta, orden y subcuenta, método activo,
saldo, sobrepago, y ejecuta una transacción. Registra en `pagos` y
`subcuenta_pagos` e intenta liquidar la orden.

### 7.3 DTO y lógica de crédito

`backend/src/cobros/dto/registrar-credito.dto.ts` (confirmado):

``` ts
import { IsInt, Min } from 'class-validator';

export class RegistrarCreditoDto {
  @IsInt()
  @Min(1)
  subcuentaId: number;

  @IsInt()
  @Min(1)
  clienteId: number;
}
```

**No recibe `valor`**. En
`CobrosService.registrarCredito(ordenId, dto)`, líneas aproximadas
705--830 observadas:

1.  Bloquea la orden con `FOR UPDATE`; rechaza `CERRADA`/`ANULADA`.
2.  Bloquea la subcuenta; comprueba pertenencia a la orden.
3.  Comprueba existencia de `clienteId` en `clientes`.
4.  Rechaza un crédito previo de esa subcuenta.
5.  Suma pagos recibidos y calcula `saldo = total_asignado - pagado`.
6.  Si saldo \> 0, inserta en `creditos_clientes` con
    `valor_total = saldo_pendiente = saldo` y estado `PENDIENTE`.
7.  Actualiza `subcuentas.cliente_id`.
8.  Llama `intentarLiquidarOrden` en la misma transacción.

**Consecuencia:** el crédito cubre **todo el saldo restante** de la
subcuenta, no una cantidad parcial arbitraria. Es compatible con pago
parcial previo. El crédito representa **cuenta por cobrar, no dinero
ingresado a caja**.

**Pendiente de revisar:** el final completo del método y los detalles de
respuesta/errores, si son necesarios para UI. También verificar reglas
de caja y conciliación de crédito antes de habilitarlo ampliamente.

------------------------------------------------------------------------

## 8. Tabla de clientes y estado del módulo

Comando ya ejecutado:

``` powershell
docker exec restaurante-db psql -U restaurante_admin -d restaurante -c "\d clientes"
```

Estructura observada:

  Campo          Tipo                  Restricción
  -------------- --------------------- --------------------------------
  `id`           `bigint`              PK, identity generado siempre
  `nombre`       `varchar(150)`        NOT NULL
  `telefono`     `varchar(20)`         opcional
  `tipo`         enum `tipo_cliente`   NOT NULL, por defecto `NORMAL`
  `created_at`   `timestamptz`         NOT NULL, `now()`

Valores enum: **`NORMAL` y `VIP`**.

Relaciones FK: `creditos_clientes.cliente_id`, `ordenes.cliente_id`,
`subcuentas.cliente_id` → `clientes.id`.

La consulta:

``` sql
SELECT id, nombre, telefono, tipo FROM clientes ORDER BY id LIMIT 20;
```

devolvió **0 filas**. No había clientes registrados al momento de la
comprobación.

Búsquedas previas de archivos `*cliente*` y controladores de clientes
bajo `backend/src` no encontraron resultados. **No se ha confirmado API
de clientes existente**.

### 8.1 Servicio propuesto en el paso 250-373 --- NO confirmado como creado

Se entregó el archivo completo
`backend/src/clientes/clientes.service.ts` con `@InjectDataSource()`,
`buscar(termino)` y `crear(nombre, telefono?, tipo='NORMAL')`.

Diseño propuesto:

-   `buscar`:
    `SELECT id::text, nombre, telefono, tipo FROM clientes WHERE ... ILIKE ... LIMIT 50`.
-   `crear`: validar longitud de nombre ≤150, teléfono ≤20, enum
    NORMAL/VIP; `INSERT INTO clientes (...) RETURNING id::text, ...`.
-   SQL parametrizado, sin cambiar esquema.
-   El servicio devuelve `id` como **string** por tratarse de `bigint`;
    al enviar `clienteId` al DTO de crédito debe validarse/conversión
    segura a número entero dentro del rango seguro de JavaScript, o
    establecer un contrato consistente.

**No se ha confirmado la creación de la carpeta ni del archivo, ni
compilación del backend.** Si se retoma, comprobar primero si existe. Se
planificó crear después controlador, DTOs, módulo, registrar
`ClientesModule`, endpoints, interfaz de búsqueda/alta, y finalmente
integrar crédito.

**Recomendación técnica:** no exponer una API pública sin autenticación;
usar JWT y roles CAJERO/ADMINISTRADOR, DTOs validados y límites de
búsqueda. Prevenir duplicados accidentales de clientes y validar números
telefónicos según reglas de negocio.

------------------------------------------------------------------------

## 9. Frontend: archivos y contrato conocidos

### 9.1 `frontend/src/api.js`

Se actualizó y se compiló con éxito en un paso anterior. Exportaciones
relevantes:

``` js
obtenerCajaActual(token)
obtenerDetalleCobro(token, ordenId)
obtenerSubcuentasOrden(token, ordenId)
dividirCuentaIguales(token, ordenId, nombres)
obtenerMetodosPago(token)
registrarPagoSubcuenta(token, ordenId, subcuentaId, metodoPagoId, valor)
obtenerSaldoOrden(token, ordenId)
```

`obtenerSaldoOrden` obtiene en paralelo detalle y subcuentas; devuelve
`totalCobrable`, `saldoPorCubrir` y `cantidadSubcuentas`. Sin
subcuentas, usa total como saldo. Con subcuentas, suma
`saldo_por_cubrir`.

**Pendiente:** añadir `registrarCreditoSubcuenta(...)` cuando exista UI
de clientes y se verifique contrato; no reemplazar `api.js` sin revisar
versión actual.

### 9.2 `frontend/src/vistas/DetalleSubcuentas.jsx`

Componente existente con props:

``` jsx
<DetalleSubcuentas
  token={sesion.accessToken}
  ordenId={ordenSeleccionada.id}
  versionActualizacion={versionActualizacion}
/>
```

Consulta `obtenerSubcuentasOrden`, muestra persona, total asignado,
pagado, crédito y saldo por cubrir. Se actualiza con
`versionActualizacion`.

### 9.3 `frontend/src/vistas/DividirCuentaIguales.jsx`

Componente existente que divide una orden en subcuentas iguales. El
callback `onDivisionRegistrada(ordenId)` incrementa
`versionActualizacion` y refresca el saldo de la orden.

### 9.4 `frontend/src/vistas/RegistrarPagoSubcuenta.jsx`

Archivo entregado para creación y el usuario respondió **«listo»**, por
lo que se considera creado según su confirmación. El componente:

-   Recibe `{token, ordenId, versionActualizacion=0, onPagoRegistrado}`.
-   Carga métodos y subcuentas.
-   **Filtra explícitamente `CRÉDITO`** (pendiente de corregir).
-   Permite elegir subcuenta, método y valor; valida saldo; pide
    confirmación antes del POST.
-   Reconsulta saldo antes de enviar para reducir riesgo de sobrepago.
-   Se restringe internamente a `Number(ordenId) === 11`.
-   Tras el POST intenta refrescar y llama `onPagoRegistrado`.

**Precaución conocida:** si el POST se ejecuta correctamente pero falla
la consulta posterior de refresco, la interfaz puede mostrar error
ambiguo; evitar que el cajero repita el cobro creyendo que no se
registró. Separar «registro confirmado» de «error al actualizar
pantalla».

### 9.5 `frontend/src/vistas/VistaCaja.jsx`

El usuario compartió el archivo completo y luego reemplazó el archivo
por una versión que integra `RegistrarPagoSubcuenta`. Funciones
presentes:

-   Estado de caja y cajero.
-   Tabla de órdenes activas, total cobrable, saldo por cubrir.
-   Detalle de orden y productos.
-   `DetalleSubcuentas`.
-   `DividirCuentaIguales`.
-   `RegistrarPagoSubcuenta` **solo cuando**
    `ordenSeleccionada.id === 11`, sin error de cobro y saldo \> 0.
-   Callback de pago que incrementa `versionActualizacion` y llama
    `actualizarSaldoOrden`.

**Prueba confirmada:**

``` text
PS C:\proyectos\restaurante\frontend> npm run build
vite v8.3.4 building client environment for production...
✓ 56 modules transformed.
✓ built in 218ms
```

Esto prueba **compilación**, no ejecución de pagos. El usuario detectó
que CRÉDITO no figuraba entre los métodos; esa observación motivó el
desarrollo de Clientes.

------------------------------------------------------------------------

## 10. Antecedentes de Git y frontend (contexto histórico)

En octubre se había identificado el commit backend estable:

``` text
75b0d13
Fase 3.3: flujo de cocina – máquina de estados item/orden con recálculo
automático, anulaciones con devolución de stock y liberación de mesa
(fix corrección endpoint entregar)
```

Archivos asociados al commit:
`backend/src/ordenes/dto/cambiar-estado-item.dto.ts`,
`ordenes.controller.ts`, `ordenes.service.ts`, `test-cocina-v2.html`.

En una etapa anterior existieron errores de frontend:

-   Importación de `anularItem` no exportada por `src/api.js`.
-   `VistaOrdenes.jsx:75 ReferenceError: usuario is not defined`.
-   Pantalla blanca después del login.

Esos errores son **históricos**; no afirmar que continúan ni que se
corrigieron por completo sin comprobar estado actual. La compilación
posterior del frontend fue satisfactoria, pero no reemplaza pruebas de
interfaz.

------------------------------------------------------------------------

## 11. Orden de construcción recomendado desde este punto

### Fase A --- Consolidación y punto de recuperación (**primera acción**)

1.  Ejecutar `git status`, `git branch --show-current`, `git remote -v`,
    `git log -5 --oneline` desde la raíz.
2.  Revisar archivos sin seguimiento, `.gitignore` y si el trabajo
    actual está respaldado.
3.  Crear un commit/etiqueta de checkpoint **solo después de revisar
    cambios y con aprobación**.
4.  Ejecutar compilaciones backend y frontend.
5.  Documentar qué endpoints responden y qué datos de prueba existen.

**Salida:** punto de recuperación reproducible y lista de fallos
actuales.

### Fase B --- Clientes y crédito

1.  Confirmar si `backend/src/clientes/clientes.service.ts` ya existe.
2.  Completar y validar servicio de clientes.
3.  Crear DTO(s) de clientes y controlador con autenticación/roles.
4.  Crear `ClientesModule` y registrarlo en `AppModule`.
5.  Compilar backend y probar búsqueda/alta de forma controlada.
6.  Agregar funciones API frontend y selección/registro de cliente.
7.  Mostrar CRÉDITO junto a EFECTIVO, TARJETA y TRANSFERENCIA.
8.  Al seleccionar CRÉDITO, mostrar cliente y **saldo total restante a
    financiar**.
9.  Enviar `POST /cobros/orden/:id/credito` con
    `{subcuentaId, clienteId}`.
10. Confirmar transacción, actualizar subcuentas y saldo, evitar
    duplicados.
11. Integrar consulta de créditos y abonos; probar el ciclo de deuda.

**Salida:** crédito operable sin confundirse con dinero recibido.

### Fase C --- Caja y pagos completos

1.  Prueba controlada de pago parcial, sobrepago y pago combinado.
2.  Validar crédito posterior a pago parcial.
3.  Verificar cierre automático de orden y conciliación.
4.  Verificar caja abierta/cerrada, apertura, cierre y arqueo.
5.  Retirar restricción `ordenId === 11` **solo tras pruebas y
    autorización**.

### Fase D --- Ciclo integral del restaurante

Probar: login → mesa o mostrador → comanda → cocina → entrega →
cobro/crédito → cierre → liberación de mesa; anulaciones, inventario y
actualizaciones en tiempo real.

### Fase E --- Reportes, calidad y producción

Reportes de ventas, métodos, créditos, inventario y caja; pruebas de
seguridad/permisos, auditoría, backups y restauración, despliegue,
documentación operativa.

------------------------------------------------------------------------

## 12. Riesgos y decisiones que deben preservarse

-   **CRÉDITO no es un pago en efectivo.** Debe crear cuenta por cobrar
    y usar su endpoint propio.
-   El backend actual **financia el saldo completo restante** de una
    subcuenta; no admite monto de crédito parcial en el DTO.
-   No usar un `clienteId` inventado: `clientes` estaba vacía.
-   No activar `synchronize: true` en TypeORM.
-   No hacer POST de pago/crédito sin permiso; el sistema puede cerrar
    automáticamente una orden al cubrir el saldo.
-   No quitar la restricción de orden de prueba antes de validar.
-   No duplicar `CobrosModule` innecesariamente: ya está importado en
    `OrdenesModule`.
-   No reemplazar archivos existentes basándose en versiones antiguas
    sin leerlos.
-   Los cambios Git y los datos de PostgreSQL pueden haber evolucionado:
    verificar estado actual.
-   Considerar carreras de peticiones y errores de red tras un POST
    exitoso para evitar pagos duplicados.
-   Para créditos, verificar políticas de autorización, identificación
    de cliente y conciliación de caja.

------------------------------------------------------------------------

## 13. Registro de los últimos pasos

  -----------------------------------------------------------------------
  Paso                                Resultado
  ----------------------------------- -----------------------------------
  250-357                             Se entregó
                                      `RegistrarPagoSubcuenta.jsx`;
                                      usuario confirmó creación

  250-358                             Se integró en `VistaCaja.jsx`;
                                      frontend compiló con 56 módulos

  250-359                             Prueba visual solicitada; usuario
                                      observó ausencia de CRÉDITO

  250-360--362                        Se revisaron controlador, DTO y
                                      servicio de créditos

  250-363--364                        No se localizaron
                                      archivos/controladores de clientes
                                      existentes

  250-365                             Se verificó estructura SQL de
                                      `clientes`

  250-366                             Se verificó que `clientes` estaba
                                      vacía

  250-367                             Enum `tipo_cliente`: NORMAL, VIP

  250-368--370                        Se verificó registro indirecto de
                                      CobrosModule vía OrdenesModule

  250-371                             Se revisó `cobros.module.ts`

  250-372                             Se revisó patrón de `CajasService`
                                      con `DataSource`

  250-373                             Se entregó `clientes.service.ts`
                                      completo; **creación no
                                      confirmada**

  Pausa                               Usuario solicitó mapa del proyecto
                                      y documento maestro
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 14. Instrucciones listas para entregar a otra IA

> Estoy desarrollando AMAIZ, un sistema de restaurante con
> NestJS/TypeORM, React/Vite y PostgreSQL en Docker. Lee este documento
> como contexto principal. Respeta los estados
> confirmado/propuesto/pendiente y **no asumas que un archivo sugerido
> fue creado**. Trabajaremos **un solo paso a la vez**, esperando mi
> respuesta. Cuando modifiquemos un archivo, entrégame su **contenido
> completo** y revisa primero su versión actual para no borrar
> funcionalidades. No registres pagos, créditos ni modifiques datos
> reales sin mi autorización. El formulario de pruebas está restringido
> a `ORD-000011`. El objetivo inmediato es completar clientes y hacer
> que CRÉDITO sea la cuarta opción del mismo formulario de cobros,
> usando `/cobros/orden/:id/credito` con `subcuentaId` y `clienteId`.
> **Antes de programar más, ayúdame a consolidar el estado de Git y
> crear un punto de recuperación seguro.** Evita repetir preguntas ya
> resueltas.

------------------------------------------------------------------------

## 15. Próxima acción concreta

**Recomendación:** empezar por la fase A. Desde
`C:\proyectos\restaurante` ejecutar **solo comandos de lectura** para
conocer el estado actual:

``` powershell
git status
git branch --show-current
git remote -v
git log -5 --oneline
```

Compartir los resultados con la IA y decidir el siguiente paso. **No
ejecutar `git reset --hard`, `git clean -fd`, force push ni migraciones
destructivas.**

------------------------------------------------------------------------

**Fin del documento maestro.** Actualizar fecha, decisiones, archivos
modificados, pruebas y commit al cerrar cada hito.
