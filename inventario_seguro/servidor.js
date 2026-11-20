'use strict';
require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const app = express();
const PORT = Number(process.env.PORT || 8000);
const KEY = process.env.API_KEY;
if (!KEY || KEY.length < 24 || KEY === 'reemplaza-esta-clave-por-una-aleatoria-larga') {
  console.error('Configura API_KEY con al menos 24 caracteres en .env'); process.exit(1);
}
fs.mkdirSync(path.join(__dirname, 'db'), {recursive:true});
const db = new sqlite3.Database(path.join(__dirname, 'db', 'inventario.db'));
const run = (sql, params=[]) => new Promise((resolve,reject)=>db.run(sql,params,function(err){err?reject(err):resolve({id:this.lastID,changes:this.changes});}));
const get = (sql, params=[]) => new Promise((resolve,reject)=>db.get(sql,params,(err,row)=>err?reject(err):resolve(row)));
const all = (sql, params=[]) => new Promise((resolve,reject)=>db.all(sql,params,(err,rows)=>err?reject(err):resolve(rows)));
const error = (status,message) => Object.assign(new Error(message),{status});
const idVal = v => Number.isSafeInteger(Number(v)) && Number(v)>0 ? Number(v):null;
const str = (v,max=120) => typeof v==='string' && v.trim().length>0 && v.trim().length<=max ? v.trim():null;
const price = v => typeof v==='number' && Number.isFinite(v) && v>=0 && v<=1e9;
const count = v => Number.isSafeInteger(v) && v>=0;
const route = fn => (req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
app.disable('x-powered-by');
app.use(express.json({limit:'20kb'}));
app.use(express.static(path.join(__dirname,'public')));
app.use('/api', (req,res,next)=>{
  const supplied=req.get('x-api-key')||'';
  const a=Buffer.from(supplied), b=Buffer.from(KEY);
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return res.status(401).json({error:'Clave de API ausente o inválida'});
  next();
});
app.get('/api/categorias',route(async(req,res)=>res.json(await all('SELECT * FROM categorias ORDER BY nombre'))));
app.post('/api/categorias',route(async(req,res)=>{
 const nombre=str(req.body.nombre), descripcion=typeof req.body.descripcion==='string'?req.body.descripcion.trim().slice(0,300):'';
 if(!nombre) throw error(400,'Nombre de categoría inválido');
 const r=await run('INSERT INTO categorias(nombre,descripcion) VALUES (?,?)',[nombre,descripcion]); res.status(201).json(await get('SELECT * FROM categorias WHERE id=?',[r.id]));
}));
app.put('/api/categorias/:id',route(async(req,res)=>{
 const id=idVal(req.params.id),nombre=str(req.body.nombre),descripcion=typeof req.body.descripcion==='string'?req.body.descripcion.trim().slice(0,300):'';
 if(!id||!nombre) throw error(400,'Datos inválidos');
 const r=await run('UPDATE categorias SET nombre=?,descripcion=? WHERE id=?',[nombre,descripcion,id]);
 if(!r.changes) throw error(404,'Categoría no encontrada'); res.json(await get('SELECT * FROM categorias WHERE id=?',[id]));
}));
app.delete('/api/categorias/:id',route(async(req,res)=>{
 const id=idVal(req.params.id); if(!id) throw error(400,'ID inválido');
 if((await get('SELECT COUNT(*) AS n FROM productos WHERE categoria_id=?',[id])).n) throw error(409,'La categoría tiene productos');
 const r=await run('DELETE FROM categorias WHERE id=?',[id]); if(!r.changes) throw error(404,'Categoría no encontrada'); res.json({mensaje:'Categoría eliminada'});
}));
app.get('/api/productos',route(async(req,res)=>{
 const q=typeof req.query.q==='string'?req.query.q.trim().slice(0,100):'';
 res.json(await all(`SELECT p.*,c.nombre AS categoria FROM productos p JOIN categorias c ON c.id=p.categoria_id WHERE (?='' OR p.nombre LIKE ? OR c.nombre LIKE ?) ORDER BY p.id DESC`,[q,`%${q}%`,`%${q}%`]));
}));
app.get('/api/productos/:id',route(async(req,res)=>{
 const id=idVal(req.params.id);if(!id) throw error(400,'ID inválido');
 const row=await get('SELECT * FROM productos WHERE id=?',[id]);if(!row) throw error(404,'Producto no encontrado');res.json(row);
}));
app.post('/api/productos',route(async(req,res)=>{
 const nombre=str(req.body.nombre),categoria=idVal(req.body.categoria_id),precio=req.body.precio;
 if(!nombre||!categoria||!price(precio)) throw error(400,'Datos del producto inválidos');
 if(!await get('SELECT id FROM categorias WHERE id=?',[categoria])) throw error(400,'Categoría inexistente');
 const r=await run('INSERT INTO productos(categoria_id,nombre,precio,stock,activo) VALUES (?,?,?,0,1)',[categoria,nombre,precio]);
 res.status(201).json(await get('SELECT * FROM productos WHERE id=?',[r.id]));
}));
app.put('/api/productos/:id',route(async(req,res)=>{
 const id=idVal(req.params.id),nombre=str(req.body.nombre),categoria=idVal(req.body.categoria_id),precio=req.body.precio;
 if(!id||!nombre||!categoria||!price(precio)) throw error(400,'Datos inválidos');
 if(!await get('SELECT id FROM categorias WHERE id=?',[categoria])) throw error(400,'Categoría inexistente');
 const r=await run('UPDATE productos SET nombre=?,categoria_id=?,precio=? WHERE id=? AND activo=1',[nombre,categoria,precio,id]);
 if(!r.changes) throw error(404,'Producto activo no encontrado');res.json(await get('SELECT * FROM productos WHERE id=?',[id]));
}));
app.delete('/api/productos/:id',route(async(req,res)=>{
 const id=idVal(req.params.id);if(!id) throw error(400,'ID inválido');
 const r=await run('UPDATE productos SET activo=0 WHERE id=? AND activo=1',[id]);if(!r.changes) throw error(404,'Producto activo no encontrado');res.json({mensaje:'Producto desactivado'});
}));
app.get('/api/movimientos',route(async(req,res)=>{
 const id=req.query.producto_id===undefined?null:idVal(req.query.producto_id);
 if(req.query.producto_id!==undefined&&!id) throw error(400,'Producto inválido');
 res.json(await all('SELECT m.*,p.nombre AS producto FROM movimientos m JOIN productos p ON p.id=m.producto_id WHERE (? IS NULL OR m.producto_id=?) ORDER BY m.id DESC',[id,id]));
}));
// Se serializan las escrituras de movimientos mediante BEGIN IMMEDIATE y COMMIT.
let queue=Promise.resolve();
function serialized(task){const next=queue.then(task);queue=next.catch(()=>{});return next;}
app.post('/api/movimientos',route(async(req,res)=>serialized(async()=>{
 const producto=idVal(req.body.producto_id),tipo=req.body.tipo,cantidad=req.body.cantidad;
 const nota=req.body.nota===undefined?'':(typeof req.body.nota==='string'?req.body.nota.trim():null);
 if(!producto||!['ENTRADA','SALIDA'].includes(tipo)||!Number.isSafeInteger(cantidad)||cantidad<=0||nota===null||nota.length>300) throw error(400,'Movimiento inválido');
 await run('BEGIN IMMEDIATE');
 try{
  const p=await get('SELECT * FROM productos WHERE id=?',[producto]);
  if(!p||!p.activo) throw error(404,'Producto activo no encontrado');
  const nuevo=p.stock+(tipo==='ENTRADA'?cantidad:-cantidad);
  if(!count(nuevo)) throw error(409,'Existencias insuficientes o fuera de rango');
  await run('UPDATE productos SET stock=? WHERE id=?',[nuevo,producto]);
  const r=await run("INSERT INTO movimientos(producto_id,tipo,cantidad,fecha,nota) VALUES (?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?)",[producto,tipo,cantidad,nota]);
  await run('COMMIT');res.status(201).json({movimiento:await get('SELECT * FROM movimientos WHERE id=?',[r.id]),stock:nuevo});
 }catch(e){await run('ROLLBACK');throw e;}
})));
app.use('/api',(req,res)=>res.status(404).json({error:'Ruta no encontrada'}));
app.use((err,req,res,next)=>{
 if(err.type==='entity.parse.failed') return res.status(400).json({error:'JSON inválido'});
 if(err.code==='SQLITE_CONSTRAINT') return res.status(409).json({error:'Conflicto con las restricciones de la base de datos'});
 console.error(err);res.status(err.status||500).json({error:err.status?err.message:'Error interno del servidor'});
});
(async()=>{
 await run('PRAGMA foreign_keys=ON');
 await run(`CREATE TABLE IF NOT EXISTS categorias(id INTEGER PRIMARY KEY,nombre TEXT NOT NULL UNIQUE,descripcion TEXT NOT NULL DEFAULT '')`);
 await run(`CREATE TABLE IF NOT EXISTS productos(id INTEGER PRIMARY KEY,categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,nombre TEXT NOT NULL,precio REAL NOT NULL CHECK(precio>=0),stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0),activo INTEGER NOT NULL DEFAULT 1 CHECK(activo IN (0,1)))`);
 await run(`CREATE TABLE IF NOT EXISTS movimientos(id INTEGER PRIMARY KEY,producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,tipo TEXT NOT NULL CHECK(tipo IN ('ENTRADA','SALIDA')),cantidad INTEGER NOT NULL CHECK(cantidad>0),fecha TEXT NOT NULL,nota TEXT NOT NULL DEFAULT '')`);
 app.listen(PORT,'127.0.0.1',()=>console.log(`Servidor: http://127.0.0.1:${PORT}`));
})().catch(e=>{console.error(e);process.exit(1)});
