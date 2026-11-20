const $=id=>document.getElementById(id);
const key=()=> $('key').value;
async function api(path,method='GET',body){
 const response=await fetch('/api'+path,{method,headers:{'x-api-key':key(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Error HTTP '+response.status);return data;
}
function message(t){$('message').textContent=t;}
function table(target,headers,rows){const t=document.createElement('table'),head=t.createTHead().insertRow();headers.forEach(h=>{const th=document.createElement('th');th.textContent=h;head.append(th)});const body=t.createTBody();rows.forEach(cells=>{const row=body.insertRow();cells.forEach(value=>{const td=row.insertCell();if(value instanceof Node)td.append(value);else td.textContent=String(value??'')})});target.replaceChildren(t);}
function button(text,fn,cls=''){const b=document.createElement('button');b.textContent=text;b.type='button';b.className=cls;b.addEventListener('click',()=>fn().catch(e=>message(e.message)));return b;}
let categories=[],products=[];
async function load(){categories=await api('/categorias');products=await api('/productos');const moves=await api('/movimientos');
 const cs=$('cat-select'),ps=$('prod-select');cs.replaceChildren();ps.replaceChildren();
 categories.forEach(c=>{const o=new Option(c.nombre,c.id);cs.add(o)});
 products.filter(p=>p.activo).forEach(p=>ps.add(new Option(p.nombre+' (stock '+p.stock+')',p.id)));
 table($('categories'),['ID','Nombre','Descripción','Acción'],categories.map(c=>[c.id,c.nombre,c.descripcion,button('Editar',async()=>{const nombre=prompt('Nuevo nombre',c.nombre);if(nombre===null)return;await api('/categorias/'+c.id,'PUT',{nombre,descripcion:c.descripcion});await load();})]));
 table($('products'),['ID','Nombre','Categoría','Precio','Stock','Estado','Acciones'],products.map(p=>[p.id,p.nombre,p.categoria,p.precio,p.stock,p.activo?'Activo':'Inactivo',p.activo?(()=>{const wrap=document.createElement('span');wrap.append(button('Editar',async()=>{const nombre=prompt('Nombre',p.nombre);if(nombre===null)return;const precio=prompt('Precio',p.precio);if(precio===null)return;await api('/productos/'+p.id,'PUT',{nombre,precio:Number(precio),categoria_id:p.categoria_id});await load();}),document.createTextNode(' '),button('Desactivar',async()=>{if(confirm('¿Desactivar producto?')){await api('/productos/'+p.id,'DELETE');await load();}},'danger'));return wrap})():'—']));
 table($('movements'),['ID','Producto','Tipo','Cantidad','Fecha','Nota'],moves.map(m=>[m.id,m.producto,m.tipo,m.cantidad,m.fecha,m.nota]));
 message('Datos actualizados');}
$('load').addEventListener('click',()=>load().catch(e=>message(e.message)));
$('category').addEventListener('submit',async e=>{e.preventDefault();try{const f=new FormData(e.target);await api('/categorias','POST',{nombre:f.get('nombre'),descripcion:f.get('descripcion')});e.target.reset();await load()}catch(err){message(err.message)}});
$('product').addEventListener('submit',async e=>{e.preventDefault();try{const f=new FormData(e.target);await api('/productos','POST',{nombre:f.get('nombre'),categoria_id:Number(f.get('categoria_id')),precio:Number(f.get('precio'))});e.target.reset();await load()}catch(err){message(err.message)}});
$('movement').addEventListener('submit',async e=>{e.preventDefault();try{const f=new FormData(e.target);await api('/movimientos','POST',{producto_id:Number(f.get('producto_id')),tipo:f.get('tipo'),cantidad:Number(f.get('cantidad')),nota:f.get('nota')});e.target.reset();await load()}catch(err){message(err.message)}});
