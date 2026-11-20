'use strict';

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');

const error = (status, message) => Object.assign(new Error(message), { status });

function idVal(value) {
  if (typeof value !== 'number' &&
      !(typeof value === 'string' && /^\d+$/.test(value.trim()))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function str(value, max = 120) {
  return typeof value === 'string' && value.trim().length > 0 &&
    value.trim().length <= max ? value.trim() : null;
}

function optionalText(value, max = 300) {
  if (value === undefined) return '';
  return typeof value === 'string' && value.trim().length <= max ? value.trim() : null;
}

function price(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e9) {
    return null;
  }
  const cents = value * 100;
  // Tolera únicamente el error de representación binaria (por ejemplo, 0.29 * 100).
  const tolerance = Number.EPSILON * Math.abs(cents) * 2;
  return Math.abs(cents - Math.round(cents)) <= tolerance ? Math.round(cents) / 100 : null;
}

function validKey(key) {
  return typeof key === 'string' && key.length >= 24 &&
    key !== 'reemplaza-esta-clave-por-una-aleatoria-larga';
}

// Recibe una conexión propia: las pruebas usan :memory: y nunca abren la base real.
async function createApp({ db, apiKey, logger = console }) {
  if (!validKey(apiKey)) throw new Error('Configura API_KEY con al menos 24 caracteres en .env');

  const app = express();
  const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
  const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
  const all = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });

  // La unidad de exclusión es la operación completa, no cada sentencia SQL.
  // Todas las rutas, incluidas las lecturas, esperan COMMIT o ROLLBACK antes de
  // acceder a esta conexión. Un rechazo no bloquea las operaciones siguientes.
  let queue = Promise.resolve();
  let connectionFailure = null;
  function serialized(task) {
    const next = queue.then(() => {
      if (connectionFailure) throw connectionFailure;
      return task();
    });
    queue = next.catch(() => {});
    return next;
  }
  const route = fn => (req, res, next) => serialized(() => fn(req, res)).catch(next);

  async function transaction(task) {
    await run('BEGIN IMMEDIATE');
    try {
      const result = await task();
      await run('COMMIT');
      return result;
    } catch (err) {
      try {
        await run('ROLLBACK');
      } catch (rollbackError) {
        // Si no se pudo revertir, ninguna petición debe reutilizar una conexión
        // que podría seguir dentro de la transacción fallida.
        connectionFailure = new Error('La conexión SQLite requiere reiniciar el servidor');
        logger.error(rollbackError);
      }
      throw err;
    }
  }

  await run('PRAGMA foreign_keys=ON');
  await run(`CREATE TABLE IF NOT EXISTS categorias(id INTEGER PRIMARY KEY,nombre TEXT NOT NULL UNIQUE,descripcion TEXT NOT NULL DEFAULT '')`);
  await run(`CREATE TABLE IF NOT EXISTS productos(id INTEGER PRIMARY KEY,categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,nombre TEXT NOT NULL,precio REAL NOT NULL CHECK(precio>=0),stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0),activo INTEGER NOT NULL DEFAULT 1 CHECK(activo IN (0,1)))`);
  await run(`CREATE TABLE IF NOT EXISTS movimientos(id INTEGER PRIMARY KEY,producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,tipo TEXT NOT NULL CHECK(tipo IN ('ENTRADA','SALIDA')),cantidad INTEGER NOT NULL CHECK(cantidad>0),fecha TEXT NOT NULL,nota TEXT NOT NULL DEFAULT '')`);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '20kb' }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/api', (req, res, next) => {
    const supplied = Buffer.from(req.get('x-api-key') || '');
    const expected = Buffer.from(apiKey);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      return res.status(401).json({ error: 'Clave de API ausente o inválida' });
    }
    next();
  });

  app.get('/api/categorias', route(async (req, res) => {
    res.json(await all('SELECT * FROM categorias ORDER BY nombre'));
  }));

  app.post('/api/categorias', route(async (req, res) => {
    const nombre = str(req.body.nombre);
    const descripcion = optionalText(req.body.descripcion);
    if (!nombre) throw error(400, 'Nombre de categoría inválido');
    if (descripcion === null) throw error(400, 'Descripción de categoría inválida');
    const r = await run('INSERT INTO categorias(nombre,descripcion) VALUES (?,?)', [nombre, descripcion]);
    res.status(201).json(await get('SELECT * FROM categorias WHERE id=?', [r.id]));
  }));

  app.put('/api/categorias/:id', route(async (req, res) => {
    const id = idVal(req.params.id);
    const nombre = str(req.body.nombre);
    const descripcion = optionalText(req.body.descripcion);
    if (!id || !nombre) throw error(400, 'Datos inválidos');
    if (descripcion === null) throw error(400, 'Descripción de categoría inválida');
    const r = await run('UPDATE categorias SET nombre=?,descripcion=? WHERE id=?', [nombre, descripcion, id]);
    if (!r.changes) throw error(404, 'Categoría no encontrada');
    res.json(await get('SELECT * FROM categorias WHERE id=?', [id]));
  }));

  app.delete('/api/categorias/:id', route(async (req, res) => {
    const id = idVal(req.params.id);
    if (!id) throw error(400, 'ID inválido');
    if ((await get('SELECT COUNT(*) AS n FROM productos WHERE categoria_id=?', [id])).n) {
      throw error(409, 'La categoría tiene productos');
    }
    const r = await run('DELETE FROM categorias WHERE id=?', [id]);
    if (!r.changes) throw error(404, 'Categoría no encontrada');
    res.json({ mensaje: 'Categoría eliminada' });
  }));

  app.get('/api/productos', route(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    res.json(await all(`SELECT p.*,c.nombre AS categoria FROM productos p JOIN categorias c ON c.id=p.categoria_id WHERE (?='' OR p.nombre LIKE ? OR c.nombre LIKE ?) ORDER BY p.id DESC`, [q, `%${q}%`, `%${q}%`]));
  }));

  app.get('/api/productos/:id', route(async (req, res) => {
    const id = idVal(req.params.id);
    if (!id) throw error(400, 'ID inválido');
    const row = await get('SELECT * FROM productos WHERE id=?', [id]);
    if (!row) throw error(404, 'Producto no encontrado');
    res.json(row);
  }));

  app.post('/api/productos', route(async (req, res) => {
    const nombre = str(req.body.nombre);
    const categoria = idVal(req.body.categoria_id);
    const precio = price(req.body.precio);
    if (!nombre || !categoria || precio === null) throw error(400, 'Datos del producto inválidos');
    if (!await get('SELECT id FROM categorias WHERE id=?', [categoria])) throw error(400, 'Categoría inexistente');
    const r = await run('INSERT INTO productos(categoria_id,nombre,precio,stock,activo) VALUES (?,?,?,0,1)', [categoria, nombre, precio]);
    res.status(201).json(await get('SELECT * FROM productos WHERE id=?', [r.id]));
  }));

  app.put('/api/productos/:id', route(async (req, res) => {
    const id = idVal(req.params.id);
    const nombre = str(req.body.nombre);
    const categoria = idVal(req.body.categoria_id);
    const precio = price(req.body.precio);
    if (!id || !nombre || !categoria || precio === null) throw error(400, 'Datos inválidos');
    if (!await get('SELECT id FROM categorias WHERE id=?', [categoria])) throw error(400, 'Categoría inexistente');
    const r = await run('UPDATE productos SET nombre=?,categoria_id=?,precio=? WHERE id=? AND activo=1', [nombre, categoria, precio, id]);
    if (!r.changes) throw error(404, 'Producto activo no encontrado');
    res.json(await get('SELECT * FROM productos WHERE id=?', [id]));
  }));

  app.delete('/api/productos/:id', route(async (req, res) => {
    const id = idVal(req.params.id);
    if (!id) throw error(400, 'ID inválido');
    const r = await run('UPDATE productos SET activo=0 WHERE id=? AND activo=1', [id]);
    if (!r.changes) throw error(404, 'Producto activo no encontrado');
    res.json({ mensaje: 'Producto desactivado' });
  }));

  app.get('/api/movimientos', route(async (req, res) => {
    const id = req.query.producto_id === undefined ? null : idVal(req.query.producto_id);
    if (req.query.producto_id !== undefined && !id) throw error(400, 'Producto inválido');
    res.json(await all('SELECT m.*,p.nombre AS producto FROM movimientos m JOIN productos p ON p.id=m.producto_id WHERE (? IS NULL OR m.producto_id=?) ORDER BY m.id DESC', [id, id]));
  }));

  app.post('/api/movimientos', route(async (req, res) => {
    const producto = idVal(req.body.producto_id);
    const tipo = req.body.tipo;
    const cantidad = req.body.cantidad;
    const nota = optionalText(req.body.nota);
    if (!producto || !['ENTRADA', 'SALIDA'].includes(tipo) ||
        !Number.isSafeInteger(cantidad) || cantidad <= 0 || nota === null) {
      throw error(400, 'Movimiento inválido');
    }
    const result = await transaction(async () => {
      const p = await get('SELECT * FROM productos WHERE id=?', [producto]);
      if (!p || !p.activo) throw error(404, 'Producto activo no encontrado');
      const nuevo = p.stock + (tipo === 'ENTRADA' ? cantidad : -cantidad);
      if (!Number.isSafeInteger(nuevo) || nuevo < 0) throw error(409, 'Existencias insuficientes o fuera de rango');
      await run('UPDATE productos SET stock=? WHERE id=?', [nuevo, producto]);
      const r = await run("INSERT INTO movimientos(producto_id,tipo,cantidad,fecha,nota) VALUES (?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?)", [producto, tipo, cantidad, nota]);
      return { movimiento: await get('SELECT * FROM movimientos WHERE id=?', [r.id]), stock: nuevo };
    });
    res.status(201).json(result);
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
    if (err.code === 'SQLITE_CONSTRAINT') {
      return res.status(409).json({ error: 'Conflicto con las restricciones de la base de datos' });
    }
    if (!err.status || err.status >= 500) logger.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Error interno del servidor' });
  });

  return app;
}

async function start() {
  require('dotenv').config();
  if (!validKey(process.env.API_KEY)) {
    throw new Error('Configura API_KEY con al menos 24 caracteres en .env');
  }
  fs.mkdirSync(path.join(__dirname, 'db'), { recursive: true });
  const db = new sqlite3.Database(path.join(__dirname, 'db', 'inventario.db'));
  try {
    const app = await createApp({ db, apiKey: process.env.API_KEY });
    const port = Number(process.env.PORT || 8000);
    const server = app.listen(port, '127.0.0.1', () => console.log(`Servidor: http://127.0.0.1:${port}`));
    server.on('error', err => {
      console.error(err);
      db.close();
      process.exitCode = 1;
    });
  } catch (err) {
    db.close();
    throw err;
  }
}

if (require.main === module) {
  start().catch(err => { console.error(err); process.exitCode = 1; });
}

module.exports = { createApp };
