# Actividad integradora 3 — Inventario seguro

## Requisitos
Node.js LTS y npm. Aplicación local; no exponer directamente a Internet.

## Instalación
```bash
npm install
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```
Reemplaza `API_KEY` en `.env` con la clave aleatoria generada. Ejecuta `npm start` y abre http://127.0.0.1:8000. Introduce la clave en el formulario.

## Pruebas de API
```bash
export API_KEY='la-clave-configurada-en-env'
curl -i http://127.0.0.1:8000/api/categorias
curl -i -H "x-api-key: $API_KEY" http://127.0.0.1:8000/api/categorias
curl -i -X POST -H "x-api-key: $API_KEY" -H 'Content-Type: application/json' -d '{"nombre":"Accesorios","descripcion":"Artículos de oficina"}' http://127.0.0.1:8000/api/categorias
curl -i -X POST -H "x-api-key: $API_KEY" -H 'Content-Type: application/json' -d '{"nombre":"Teclado","categoria_id":1,"precio":1200}' http://127.0.0.1:8000/api/productos
curl -i -X POST -H "x-api-key: $API_KEY" -H 'Content-Type: application/json' -d '{"producto_id":1,"tipo":"ENTRADA","cantidad":5,"nota":"Compra inicial"}' http://127.0.0.1:8000/api/movimientos
curl -i -X POST -H "x-api-key: $API_KEY" -H 'Content-Type: application/json' -d '{"producto_id":1,"tipo":"SALIDA","cantidad":2,"nota":"Entrega"}' http://127.0.0.1:8000/api/movimientos
```
Reinicia el servidor y consulta nuevamente para comprobar persistencia.

## Seguridad y límites
Todas las rutas `/api` requieren `x-api-key`; clave almacenada en `.env` (excluida de Git); comparación con `timingSafeEqual`; validación de campos; sentencias SQL parametrizadas; llaves foráneas y transacciones; escucha solo en 127.0.0.1. La clave escrita en el navegador no se guarda en localStorage, pero sigue siendo visible al usuario y en herramientas de desarrollo. No hay roles ni autenticación individual; para producción se requerirían HTTPS, gestión de usuarios/sesiones, controles de acceso, límites de peticiones y monitoreo.

## Estructura
`servidor.js`: API y base de datos; `public/`: cliente; `db/inventario.db`: datos generados al ejecutar.

## Aislamiento de operaciones
Las 11 operaciones REST mantienen sus rutas, métodos y respuestas JSON. Todas las
rutas que consultan SQLite pasan por una única cola de operaciones completas,
incluidas las lecturas. Un movimiento conserva la exclusión desde `BEGIN IMMEDIATE`
hasta `COMMIT` o `ROLLBACK`; categorías y productos esperan su turno y no pueden
participar en su transacción. Un rechazo normal no bloquea la cola.

El stock y el registro del movimiento se guardan atómicamente. La respuesta se
prepara dentro de la transacción y solo se envía después de confirmar. Si falla
el propio `ROLLBACK`, las siguientes operaciones de base de datos devuelven un
error interno hasta reiniciar el servidor, para no reutilizar una conexión cuyo
estado ya no es seguro.

La estrategia está pensada para esta aplicación local, con una instancia y una
conexión administrada exclusivamente por el servidor. Serializa también las
lecturas y limita el rendimiento concurrente; no es una cola compartida entre
procesos. No deben agregarse consultas fuera de este mecanismo ni compartir la
conexión con otra instancia de la aplicación.

## Validaciones y compatibilidad
- Los identificadores admiten enteros seguros positivos y cadenas de dígitos
  decimales. Se rechazan booleanos, arreglos, objetos y cadenas en notación
  exponencial o hexadecimal.
- Los nombres siguen admitiendo hasta 120 caracteres después de quitar espacios
  exteriores. Descripción y nota son opcionales; si se envían, deben ser texto de
  hasta 300 caracteres. Un valor inválido produce `400`, sin truncarlo.
- Los precios deben ser números finitos entre cero y mil millones, con precisión
  de centavos. Se tolera el error binario de JavaScript y se normalizan a centavos;
  se rechazan fracciones adicionales significativas. Las cantidades siguen siendo
  enteros seguros positivos.
- Se conservan las tres tablas y sus restricciones. No se migran ni redondean los
  precios existentes. El cliente actual envía los tipos compatibles y no requiere
  cambios. La columna de precio continúa siendo `REAL`.

## Pruebas automatizadas
Ejecuta `npm test` con una versión LTS de Node.js que incluya `node:test` y `fetch`.
No se necesitan dependencias adicionales. Cada prueba de API utiliza SQLite en
memoria y un puerto temporal en `127.0.0.1`; no carga `.env` ni abre la base real.
Los entornos restringidos deben permitir esos puertos locales.

Las pruebas cubren los 11 endpoints, la clave de pruebas, validaciones, stock,
desactivación lógica, historial inmutable, llaves foráneas, conservación de
registros al inicializar y entrega de los archivos originales del cliente.
La regresión pausa un movimiento después de actualizar stock, recibe escrituras
y una lectura concurrentes y fuerza el fallo del movimiento con un trigger
temporal. Verifica que el rollback no borre las escrituras ajenas ni exponga
existencias sin confirmar. También comprueba el bloqueo de la conexión si falla
el propio rollback. No sustituye una prueba visual en navegador.

## Respaldo previo a los cambios
Se creó un respaldo consistente mediante `sqlite3.Connection.backup` de Python,
con la base de origen abierta en modo de solo lectura. Se conserva en
`db/backups/inventario-20261120T022912444946Z.db`, junto con
`db/backups/verification.json`. Se verificaron integridad, llaves foráneas,
igualdad del esquema y todos los registros. La base original se conserva.

`db/backups/` está excluido de Git porque contiene datos. Conserva una copia en un
destino seguro según tus necesidades; este respaldo local no es un sistema de
respaldos periódicos. Para restaurar, detén primero el servidor y verifica el
respaldo antes de reemplazar cualquier archivo; nunca copies una base activa
como sustituto de un respaldo consistente.
