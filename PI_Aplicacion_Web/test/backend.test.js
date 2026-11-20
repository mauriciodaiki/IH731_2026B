'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once, EventEmitter } = require('node:events');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { createApp } = require('../servidor');

// Credencial efímera de pruebas, independiente de .env.
const testKey = crypto.randomBytes(32).toString('hex');
const run = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
});
const get = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});

async function fixture(t, { observeRequests = false } = {}) {
  const db = new sqlite3.Database(':memory:');
  const app = await createApp({ db, apiKey: testKey, logger: { error() {} } });
  const arrivals = new EventEmitter();
  let handler = app;
  if (observeRequests) {
    // Barrera de pruebas: avisa después de que el cuerpo se haya procesado y la
    // ruta haya encolado su tarea. No depende de retardos ni modifica producción.
    handler = express();
    handler.use(express.json({ limit: '20kb' }));
    handler.use((req, res, next) => {
      next();
      if (req.get('x-test-id')) arrivals.emit(req.get('x-test-id'));
    });
    handler.use(app);
  }
  const server = http.createServer(handler);
  t.after(async () => {
    await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    });
    await new Promise((resolve, reject) => db.close(err => err ? reject(err) : resolve()));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(method, url, body, { key = testKey, raw = false, requestId } = {}) {
    const response = await fetch(base + url, {
      method,
      headers: {
        ...(key === null ? {} : { 'x-api-key': key }),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(requestId ? { 'x-test-id': requestId } : {})
      },
      ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) })
    });
    return { status: response.status, body: await response.json() };
  }
  async function seed() {
    const category = await request('POST', '/api/categorias', { nombre: 'Oficina' });
    assert.equal(category.status, 201);
    const product = await request('POST', '/api/productos', {
      nombre: 'Teclado', categoria_id: category.body.id, precio: 1200
    });
    assert.equal(product.status, 201);
    return { category: category.body, product: product.body };
  }
  return { db, request, seed, base, arrivals };
}

test('los 11 endpoints conservan contratos y reglas del cliente', async t => {
  const { request, seed } = await fixture(t);
  const { category, product } = await seed();
  assert.deepEqual(category, { id: 1, nombre: 'Oficina', descripcion: '' });
  assert.deepEqual(product, { id: 1, categoria_id: 1, nombre: 'Teclado', precio: 1200, stock: 0, activo: 1 });

  assert.deepEqual((await request('GET', '/api/categorias')).body, [category]);
  const editedCategory = await request('PUT', '/api/categorias/1', {
    nombre: 'Accesorios', descripcion: 'Artículos de oficina'
  });
  assert.equal(editedCategory.status, 200);
  assert.equal(editedCategory.body.descripcion, 'Artículos de oficina');
  assert.equal((await request('POST', '/api/categorias', { nombre: 'Accesorios' })).status, 409);

  const editedProduct = await request('PUT', '/api/productos/1', {
    nombre: 'Teclado USB', categoria_id: 1, precio: 19.99, stock: 999, activo: 0
  });
  assert.equal(editedProduct.status, 200);
  assert.equal(editedProduct.body.precio, 19.99);
  assert.equal(editedProduct.body.stock, 0);
  assert.equal(editedProduct.body.activo, 1);
  assert.deepEqual((await request('GET', '/api/productos/1')).body, editedProduct.body);
  const list = await request('GET', '/api/productos?q=Accesorios');
  assert.deepEqual(list.body, [{ ...editedProduct.body, categoria: 'Accesorios' }]);
  assert.deepEqual((await request('GET', '/api/productos?q=inexistente')).body, []);

  const entry = await request('POST', '/api/movimientos', {
    producto_id: 1, tipo: 'ENTRADA', cantidad: 5, nota: 'Compra inicial'
  });
  assert.equal(entry.status, 201);
  assert.equal(entry.body.stock, 5);
  assert.deepEqual(Object.keys(entry.body).sort(), ['movimiento', 'stock']);
  assert.deepEqual(Object.keys(entry.body.movimiento).sort(), ['cantidad', 'fecha', 'id', 'nota', 'producto_id', 'tipo']);
  assert.match(entry.body.movimiento.fecha, /^\d{4}-\d{2}-\d{2}T.*Z$/);
  const exit = await request('POST', '/api/movimientos', {
    producto_id: 1, tipo: 'SALIDA', cantidad: 2
  });
  assert.equal(exit.status, 201);
  assert.equal(exit.body.stock, 3);
  const history = await request('GET', '/api/movimientos?producto_id=1');
  assert.deepEqual(history.body, [exit.body.movimiento, entry.body.movimiento].map(m => ({ ...m, producto: 'Teclado USB' })));

  assert.deepEqual(await request('DELETE', '/api/productos/1'), {
    status: 200, body: { mensaje: 'Producto desactivado' }
  });
  assert.equal((await request('GET', '/api/productos')).body[0].activo, 0);
  assert.equal((await request('GET', '/api/productos/1')).body.stock, 3);
  assert.equal((await request('PUT', '/api/productos/1', { nombre: 'Otro', categoria_id: 1, precio: 1 })).status, 404);
  assert.equal((await request('POST', '/api/movimientos', { producto_id: 1, tipo: 'ENTRADA', cantidad: 1 })).status, 404);
  assert.equal((await request('DELETE', '/api/categorias/1')).status, 409);
  assert.equal((await request('PUT', '/api/movimientos/1', { cantidad: 9 })).status, 404);
  assert.equal((await request('DELETE', '/api/movimientos/1')).status, 404);
  assert.deepEqual((await request('GET', '/api/movimientos')).body, history.body);

  const empty = await request('POST', '/api/categorias', { nombre: 'Vacía' });
  assert.deepEqual(await request('DELETE', `/api/categorias/${empty.body.id}`), {
    status: 200, body: { mensaje: 'Categoría eliminada' }
  });
  for (const [method, url, body] of [
    ['DELETE', '/api/categorias/999'], ['PUT', '/api/categorias/999', { nombre: 'No existe' }],
    ['GET', '/api/productos/999'], ['DELETE', '/api/productos/999'],
    ['PUT', '/api/productos/999', { nombre: 'No existe', categoria_id: 1, precio: 1 }]
  ]) assert.equal((await request(method, url, body)).status, 404);
});

test('API Key, JSON, límite del cuerpo y archivos del cliente', async t => {
  const { request, base } = await fixture(t);
  for (const key of [null, 'incorrecta', 'x'.repeat(testKey.length)]) {
    assert.deepEqual(await request('GET', '/api/categorias', undefined, { key }), {
      status: 401, body: { error: 'Clave de API ausente o inválida' }
    });
  }
  assert.equal((await request('GET', '/api/desconocida')).status, 404);
  assert.deepEqual(await request('POST', '/api/categorias', '{', { raw: true }), {
    status: 400, body: { error: 'JSON inválido' }
  });
  assert.equal((await request('POST', '/api/categorias', { nombre: 'x'.repeat(21000) })).status, 413);
  assert.equal((await request('POST', '/api/categorias')).status, 400);
  for (const [url, file] of [['/', 'index.html'], ['/app.js', 'app.js'], ['/styles.css', 'styles.css']]) {
    const response = await fetch(base + url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.equal(await response.text(), await fs.readFile(path.join(__dirname, '../public', file), 'utf8'));
  }
  const db = new sqlite3.Database(':memory:');
  try {
    for (const apiKey of [undefined, '', 'corta', 'reemplaza-esta-clave-por-una-aleatoria-larga']) {
      await assert.rejects(createApp({ db, apiKey }), /Configura API_KEY/);
    }
  } finally {
    await new Promise(resolve => db.close(resolve));
  }
});

test('identificadores estrictos mantienen números y cadenas decimales', async t => {
  const { request, seed } = await fixture(t);
  await seed();
  for (const categoria_id of [true, false, null, [], [1], {}, '', '1e0', '0x1', '1.0', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await request('POST', '/api/productos', { nombre: 'Inválido', categoria_id, precio: 1 })).status, 400, JSON.stringify(categoria_id));
    assert.equal((await request('POST', '/api/movimientos', { producto_id: categoria_id, tipo: 'ENTRADA', cantidad: 1 })).status, 400);
  }
  for (const id of ['0', '-1', '1e0', '0x1', '1.0', '9007199254740992']) {
    assert.equal((await request('GET', `/api/productos/${id}`)).status, 400);
    assert.equal((await request('GET', `/api/movimientos?producto_id=${id}`)).status, 400);
    assert.equal((await request('DELETE', `/api/categorias/${id}`)).status, 400);
  }
  assert.equal((await request('GET', '/api/movimientos?producto_id=1&producto_id=1')).status, 400);
  assert.equal((await request('POST', '/api/productos', { nombre: 'Válido', categoria_id: '1', precio: 0 })).status, 201);
  assert.equal((await request('POST', '/api/productos', { nombre: 'Sin categoría', categoria_id: 999, precio: 1 })).status, 400);
});

test('nombres, descripciones y notas se validan sin truncar ni convertir tipos', async t => {
  const { request, seed } = await fixture(t);
  await seed();
  for (const nombre of ['', '  ', true, 123, null, [], 'x'.repeat(121)]) {
    assert.equal((await request('POST', '/api/categorias', { nombre })).status, 400);
    assert.equal((await request('POST', '/api/productos', { nombre, categoria_id: 1, precio: 1 })).status, 400);
  }
  const maxName = 'n'.repeat(120);
  assert.equal((await request('POST', '/api/categorias', { nombre: maxName })).status, 201);
  for (const value of [null, 123, true, [], {}, 'x'.repeat(301)]) {
    assert.equal((await request('POST', '/api/categorias', { nombre: 'Inválida', descripcion: value })).status, 400);
    assert.equal((await request('PUT', '/api/categorias/1', { nombre: 'Oficina', descripcion: value })).status, 400);
    assert.equal((await request('POST', '/api/movimientos', { producto_id: 1, tipo: 'ENTRADA', cantidad: 1, nota: value })).status, 400);
  }
  const text = 'x'.repeat(300);
  const category = await request('PUT', '/api/categorias/1', { nombre: ' Oficina ', descripcion: ` ${text} ` });
  assert.equal(category.status, 200);
  assert.equal(category.body.nombre, 'Oficina');
  assert.equal(category.body.descripcion, text);
  assert.equal((await request('POST', '/api/movimientos', { producto_id: 1, tipo: 'ENTRADA', cantidad: 1, nota: text })).body.movimiento.nota, text);
});

test('precios monetarios de hasta dos decimales, incluidos ceros y errores binarios', async t => {
  const { request, seed } = await fixture(t);
  await seed();
  for (const precio of [0, 1, 0.29, 19.99, 0.1 + 0.2, 999999999.99, 1e9]) {
    const response = await request('POST', '/api/productos', { nombre: 'Válido', categoria_id: 1, precio });
    assert.equal(response.status, 201, String(precio));
    assert.equal(response.body.precio, Math.round(precio * 100) / 100);
  }
  for (const precio of ['1.00', true, null, [], {}, -1, 1e9 + 0.01, 1.001, 1.005, 0.001, 1e-20, Number.MIN_VALUE, 999999999.999]) {
    const body = { nombre: 'Inválido', categoria_id: 1, precio };
    assert.equal((await request('POST', '/api/productos', body)).status, 400, JSON.stringify(precio));
    assert.equal((await request('PUT', '/api/productos/1', body)).status, 400);
  }
  assert.equal((await request('POST', '/api/productos', { nombre: 'Sin precio', categoria_id: 1 })).status, 400);
  assert.equal((await request('POST', '/api/productos', '{"nombre":"Infinito","categoria_id":1,"precio":1e400}', { raw: true })).status, 400);
});

test('movimientos concurrentes, stock no negativo y cola recuperable tras rechazos', async t => {
  const { db, request, seed } = await fixture(t);
  await seed();
  await request('POST', '/api/movimientos', { producto_id: 1, tipo: 'ENTRADA', cantidad: 3 });
  const exits = await Promise.all([1, 2].map(() => request('POST', '/api/movimientos', {
    producto_id: 1, tipo: 'SALIDA', cantidad: 2
  })));
  assert.deepEqual(exits.map(r => r.status).sort(), [201, 409]);
  assert.equal((await request('GET', '/api/productos/1')).body.stock, 1);
  for (const cantidad of [0, -1, 1.5, '1', true, null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await request('POST', '/api/movimientos', { producto_id: 1, tipo: 'ENTRADA', cantidad })).status, 400);
  }
  assert.equal((await request('POST', '/api/movimientos', { producto_id: 1, tipo: 'entrada', cantidad: 1 })).status, 400);
  assert.equal((await request('POST', '/api/movimientos', { producto_id: 1, tipo: 'ENTRADA', cantidad: Number.MAX_SAFE_INTEGER })).status, 409);
  const entries = await Promise.all(Array.from({ length: 10 }, () => request('POST', '/api/movimientos', {
    producto_id: 1, tipo: 'ENTRADA', cantidad: 1
  })));
  assert.ok(entries.every(r => r.status === 201));
  const balance = await get(db, "SELECT SUM(CASE WHEN tipo='ENTRADA' THEN cantidad ELSE -cantidad END) AS stock FROM movimientos");
  assert.equal(balance.stock, 11);
  assert.equal((await request('GET', '/api/productos/1')).body.stock, balance.stock);
});

test('regresión: un rollback no elimina categorías ni productos ajenos ni expone stock sin confirmar', async t => {
  const { db, request, seed, arrivals } = await fixture(t, { observeRequests: true });
  await seed();
  await run(db, `CREATE TEMP TRIGGER fallo_movimiento BEFORE INSERT ON movimientos
    WHEN NEW.nota='fallo-controlado' BEGIN SELECT RAISE(ABORT, 'Fallo de prueba'); END`);

  let release, reached;
  const gate = new Promise(resolve => { release = resolve; });
  const atInsert = new Promise(resolve => { reached = resolve; });
  const originalRun = db.run;
  db.run = function (sql, ...args) {
    if (sql.startsWith('INSERT INTO movimientos') && args[0][3] === 'fallo-controlado') {
      reached();
      gate.then(() => originalRun.call(this, sql, ...args));
      return this;
    }
    return originalRun.call(this, sql, ...args);
  };
  t.after(() => { release(); db.run = originalRun; });

  const movement = request('POST', '/api/movimientos', {
    producto_id: 1, tipo: 'ENTRADA', cantidad: 9, nota: 'fallo-controlado'
  });
  await atInsert; // BEGIN y UPDATE de stock ya se ejecutaron; COMMIT aún no.

  const pending = [];
  for (const [requestId, method, url, body] of [
    ['category', 'POST', '/api/categorias', { nombre: 'Debe persistir' }],
    ['product', 'POST', '/api/productos', { nombre: 'También persiste', categoria_id: 1, precio: 0.29 }],
    ['read', 'GET', '/api/productos/1']
  ]) {
    const arrived = once(arrivals, requestId);
    pending.push(request(method, url, body, { requestId }));
    await arrived; // Confirma la concurrencia sin pausas temporizadas.
  }
  release();
  assert.equal((await movement).status, 409);
  const [category, product, read] = await Promise.all(pending);
  assert.equal(category.status, 201);
  assert.equal(product.status, 201);
  assert.equal(read.status, 200);
  assert.equal(read.body.stock, 0);
  assert.equal((await get(db, 'SELECT nombre FROM categorias WHERE id=?', [category.body.id])).nombre, 'Debe persistir');
  assert.equal((await get(db, 'SELECT nombre FROM productos WHERE id=?', [product.body.id])).nombre, 'También persiste');
  assert.equal((await get(db, 'SELECT count(*) AS n FROM movimientos')).n, 0);
  assert.equal((await get(db, 'SELECT stock FROM productos WHERE id=1')).stock, 0);
  assert.equal((await request('POST', '/api/movimientos', { producto_id: 1, tipo: 'ENTRADA', cantidad: 1 })).status, 201);
});

test('si ROLLBACK falla, la conexión no admite operaciones ajenas', async t => {
  const { db, request, seed } = await fixture(t);
  await seed();
  const originalRun = db.run;
  db.run = function (sql, ...args) {
    if (sql.startsWith('INSERT INTO movimientos') || sql === 'ROLLBACK') {
      queueMicrotask(() => args.at(-1).call({}, new Error('Fallo interno simulado')));
      return this;
    }
    return originalRun.call(this, sql, ...args);
  };
  try {
    assert.deepEqual(await request('POST', '/api/movimientos', {
      producto_id: 1, tipo: 'ENTRADA', cantidad: 1
    }), { status: 500, body: { error: 'Error interno del servidor' } });
    assert.deepEqual(await request('POST', '/api/categorias', { nombre: 'No debe entrar' }), {
      status: 500, body: { error: 'Error interno del servidor' }
    });
    assert.equal((await get(db, "SELECT count(*) AS n FROM categorias WHERE nombre='No debe entrar'")).n, 0);
  } finally {
    db.run = originalRun;
    await run(db, 'ROLLBACK');
  }
});

test('reinicializar la aplicación conserva esquema, IDs, precios previos e historial', async () => {
  const db = new sqlite3.Database(':memory:');
  try {
    await createApp({ db, apiKey: testKey });
    await run(db, "INSERT INTO categorias(id,nombre,descripcion) VALUES (42,'Existente','Descripción')");
    await run(db, "INSERT INTO productos(id,categoria_id,nombre,precio,stock,activo) VALUES (81,42,'Anterior',1.234,5,0)");
    await run(db, "INSERT INTO movimientos(id,producto_id,tipo,cantidad,fecha,nota) VALUES (99,81,'ENTRADA',5,'2026-01-01T00:00:00.000Z','Histórico')");
    const before = await get(db, 'SELECT * FROM productos WHERE id=81');
    await createApp({ db, apiKey: testKey });
    assert.deepEqual(await get(db, 'SELECT * FROM productos WHERE id=81'), before);
    assert.equal((await get(db, 'SELECT id FROM categorias')).id, 42);
    assert.equal((await get(db, 'SELECT id FROM movimientos')).id, 99);
    assert.equal((await get(db, 'PRAGMA foreign_keys')).foreign_keys, 1);
    await assert.rejects(run(db, 'DELETE FROM categorias WHERE id=42'), { code: 'SQLITE_CONSTRAINT' });
    await assert.rejects(run(db, 'DELETE FROM productos WHERE id=81'), { code: 'SQLITE_CONSTRAINT' });
    await assert.rejects(run(db, 'UPDATE productos SET stock=-1 WHERE id=81'), { code: 'SQLITE_CONSTRAINT' });
    assert.equal((await get(db, 'PRAGMA integrity_check')).integrity_check, 'ok');
    assert.equal(await get(db, 'PRAGMA foreign_key_check'), undefined);
  } finally {
    await new Promise((resolve, reject) => db.close(err => err ? reject(err) : resolve()));
  }
});
