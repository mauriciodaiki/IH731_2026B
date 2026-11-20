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
