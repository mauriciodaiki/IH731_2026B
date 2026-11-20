# Actividad 3.1. Persistencia de datos

**Materia:** Tendencias en diseño de servicios  
**Unidad 3:** Infraestructura de servicios

## Descripción

Esta aplicación consiste en un sistema sencillo de inventario de productos desarrollado con HTML, CSS, JavaScript y Node.js.

El proyecto implementa una API REST que permite consultar, registrar, modificar y eliminar productos mediante los métodos HTTP GET, POST, PUT y DELETE.

Para mantener la persistencia de los registros se utiliza SQLite3. La información se almacena en un archivo de base de datos, lo que permite conservar los cambios incluso después de detener y reiniciar el servidor.

## Requisitos

Para ejecutar el proyecto es necesario contar con:

- Node.js y npm instalados.
- Python 3 para servir la aplicación HTML.
- Un navegador web.
- Acceso a una terminal.

## Instalación

1. Clonar el repositorio:

   ```bash
   git clone <URL_DEL_REPOSITORIO>
   ```

2. Entrar a la carpeta del proyecto:

   ```bash
   cd IH731_2026B/actividad_3.1
   ```

3. Instalar las dependencias:

   ```bash
   npm install
   ```

   Si se incluye `package-lock.json`, también se puede utilizar `npm ci` para realizar una instalación limpia.

   Las dependencias principales del proyecto son Express, CORS y SQLite3.

## Ejecución

### Iniciar el servidor Node.js

Desde la carpeta `actividad_3.1`, ejecutar:

```bash
node servidor.js
```

El servicio estará disponible en:

http://localhost:8000

Para consultar los productos directamente en formato JSON:

http://localhost:8000/productos

Al iniciar el servidor, se abre la base de datos `inventario.db` y se crea la tabla `productos` si todavía no existe.

Cuando la tabla se encuentra vacía, se agregan tres productos iniciales como datos de ejemplo.

### Iniciar el cliente HTML

Sin detener Node.js, abrir una segunda terminal dentro de la misma carpeta y ejecutar:

```bash
python3 -m http.server 5500
```

Después abrir la aplicación en el navegador:

http://localhost:5500/index.html

Es necesario mantener ambos servidores ejecutándose mientras se utiliza la aplicación.

## Operaciones disponibles

| Operación | Método HTTP | Ruta |
|---|---|---|
| Consultar productos | GET | /productos |
| Consultar por ID | GET | /productos/:id |
| Registrar producto | POST | /productos |
| Modificar producto | PUT | /productos/:id |
| Eliminar producto | DELETE | /productos/:id |

Los productos contienen los siguientes campos:

- `id`: identificador único del producto.
- `nombre`: nombre del producto.
- `categoria`: categoría a la que pertenece.
- `precio`: precio del producto.
- `existencias`: cantidad disponible.

## Comprobación del funcionamiento

Para verificar el CRUD desde el cliente HTML:

1. **Consultar:** comprobar que aparecen los productos registrados.
2. **Crear:** agregar un producto mediante el formulario.
3. **Actualizar:** utilizar el botón Editar y guardar los cambios.
4. **Eliminar:** utilizar el botón Eliminar.
5. **Persistencia:** agregar o modificar un producto, detener el servidor Node.js y volver a iniciarlo.

Al actualizar la página después del reinicio, el producto y sus modificaciones deben conservarse.

También es posible consultar los registros directamente desde:

http://localhost:8000/productos

## Persistencia de datos

Los registros se guardan en el archivo `inventario.db` mediante instrucciones SQL `INSERT`, `SELECT`, `UPDATE` y `DELETE`.

La base de datos se crea automáticamente si no existe. Si ya existe, se reutiliza para conservar los registros anteriores.

**Nota:** Si el archivo `inventario.db` no está incluido en el repositorio, la primera ejecución creará una base de datos nueva con los productos de ejemplo. Las modificaciones realizadas posteriormente se conservarán en ese mismo archivo.

## Tecnologías utilizadas

- Node.js
- Express
- SQLite3
- JavaScript
- HTML5
- CSS3
- Fetch API

## Referencias

Orozco Núñez, J. (s. f.). *CRUD en Node.js manteniendo persistencia de los datos con SQLite*. Material del curso Tendencias en diseño de servicios, Universidad de Guadalajara.

Node.js. https://nodejs.org/

SQLite. https://www.sqlite.org/

Express. https://expressjs.com/
