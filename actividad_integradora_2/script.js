"use strict";

const API = "http://localhost:8080";

const formulario = document.getElementById("form-producto");
const nombre = document.getElementById("nombre");
const categoria = document.getElementById("categoria");
const precio = document.getElementById("precio");
const stock = document.getElementById("stock");
const tabla = document.getElementById("tabla-productos");
const mensaje = document.getElementById("mensaje");
const contador = document.getElementById("contador");
const buscador = document.getElementById("buscar");
const tituloFormulario = document.getElementById("titulo-formulario");
const botonGuardar = document.getElementById("btn-guardar");
const botonCancelar = document.getElementById("btn-cancelar");
const botonActualizar = document.getElementById("btn-actualizar");

let productos = [];
let idEnEdicion = null;

function notificar(texto, tipo = "exito") {
  mensaje.textContent = texto;
  mensaje.className = `mensaje mensaje-${tipo}`;
}

function filaMensaje(texto) {
  tabla.replaceChildren();
  const fila = document.createElement("tr");
  const celda = document.createElement("td");
  celda.colSpan = 6;
  celda.textContent = texto;
  fila.appendChild(celda);
  tabla.appendChild(fila);
}

async function solicitar(ruta, opciones = {}) {
  const respuesta = await fetch(`${API}${ruta}`, opciones);
  const contenido = await respuesta.text();
  let datos;
  try {
    datos = contenido ? JSON.parse(contenido) : null;
  } catch {
    throw new Error("La respuesta del servidor no es JSON válido.");
  }
  if (!respuesta.ok) {
    throw new Error(datos?.mensaje || `Error HTTP ${respuesta.status}`);
  }
  return datos;
}

function crearBoton(texto, clase, accion) {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = `boton ${clase}`;
  boton.textContent = texto;
  boton.addEventListener("click", accion);
  return boton;
}

function mostrarProductos() {
  const filtro = buscador.value.trim().toLocaleLowerCase("es");
  const visibles = productos.filter(producto =>
    [producto.id, producto.nombre, producto.categoria]
      .some(valor => String(valor ?? "").toLocaleLowerCase("es").includes(filtro))
  );

  contador.textContent = `${visibles.length} producto(s) mostrado(s) de ${productos.length}`;
  tabla.replaceChildren();
  if (visibles.length === 0) {
    filaMensaje(filtro ? "No hay productos que coincidan con la búsqueda." : "No hay productos registrados.");
    return;
  }

  const moneda = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
  for (const producto of visibles) {
    const fila = document.createElement("tr");
    for (const valor of [
      producto.id,
      producto.nombre,
      producto.categoria,
      moneda.format(producto.precio),
      producto.stock
    ]) {
      const celda = document.createElement("td");
      celda.textContent = String(valor);
      fila.appendChild(celda);
    }
    const celdaAcciones = document.createElement("td");
    const acciones = document.createElement("div");
    acciones.className = "acciones";
    acciones.append(
      crearBoton("Editar", "boton-editar", () => editarProducto(producto.id)),
      crearBoton("Eliminar", "boton-eliminar", () => eliminarProducto(producto.id))
    );
    celdaAcciones.appendChild(acciones);
    fila.appendChild(celdaAcciones);
    tabla.appendChild(fila);
  }
}

async function cargarProductos() {
  botonActualizar.disabled = true;
  contador.textContent = "Consultando registros...";
  filaMensaje("Cargando productos...");
  try {
    const datos = await solicitar("/productos");
    if (!Array.isArray(datos)) throw new Error("El servidor no devolvió una lista de productos.");
    productos = datos;
    mostrarProductos();
  } catch (error) {
    contador.textContent = "No se pudo consultar el inventario";
    filaMensaje("No fue posible cargar los productos.");
    notificar(`Error al consultar: ${error.message}`, "error");
  } finally {
    botonActualizar.disabled = false;
  }
}

function leerFormulario() {
  const producto = {
    nombre: nombre.value.trim(),
    categoria: categoria.value.trim(),
    precio: Number(precio.value),
    stock: Number(stock.value)
  };
  if (!producto.nombre || !producto.categoria ||
      precio.value.trim() === "" || stock.value.trim() === "" ||
      !Number.isFinite(producto.precio) || producto.precio < 0 ||
      !Number.isInteger(producto.stock) || producto.stock < 0) {
    throw new Error("Completa los campos con un precio válido y un stock entero no negativo.");
  }
  return producto;
}

function cancelarEdicion() {
  idEnEdicion = null;
  formulario.reset();
  tituloFormulario.textContent = "Agregar producto";
  botonGuardar.textContent = "Agregar producto";
  botonCancelar.classList.add("oculto");
}

async function editarProducto(id) {
  try {
    const producto = await solicitar(`/productos/${id}`);
    idEnEdicion = producto.id;
    nombre.value = producto.nombre;
    categoria.value = producto.categoria;
    precio.value = producto.precio;
    stock.value = producto.stock;
    tituloFormulario.textContent = `Editar producto #${producto.id}`;
    botonGuardar.textContent = "Guardar cambios";
    botonCancelar.classList.remove("oculto");
    nombre.focus();
    formulario.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    notificar(`No se pudo obtener el producto: ${error.message}`, "error");
  }
}

formulario.addEventListener("submit", async evento => {
  evento.preventDefault();
  let producto;
  try {
    producto = leerFormulario();
  } catch (error) {
    notificar(error.message, "error");
    return;
  }

  const editando = idEnEdicion !== null;
  const ruta = editando ? `/productos/${idEnEdicion}` : "/productos";
  const metodo = editando ? "PUT" : "POST";
  botonGuardar.disabled = true;
  try {
    const resultado = await solicitar(ruta, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(producto)
    });
    cancelarEdicion();
    await cargarProductos();
    notificar(resultado?.mensaje || (editando ? "Producto actualizado." : "Producto creado."));
  } catch (error) {
    notificar(`No fue posible guardar el producto: ${error.message}`, "error");
  } finally {
    botonGuardar.disabled = false;
  }
});

async function eliminarProducto(id) {
  const producto = productos.find(item => item.id === id);
  if (!window.confirm(`¿Eliminar el producto «${producto?.nombre ?? id}»?`)) return;
  try {
    const resultado = await solicitar(`/productos/${id}`, { method: "DELETE" });
    if (idEnEdicion === id) cancelarEdicion();
    await cargarProductos();
    notificar(resultado?.mensaje || "Producto eliminado.");
  } catch (error) {
    notificar(`No fue posible eliminar el producto: ${error.message}`, "error");
  }
}

botonCancelar.addEventListener("click", cancelarEdicion);
botonActualizar.addEventListener("click", cargarProductos);
buscador.addEventListener("input", mostrarProductos);

cargarProductos();
