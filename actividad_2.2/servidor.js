
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 8080;

// Permitir comunicación con el cliente HTML
app.use(cors());

// Permitir recibir información JSON
app.use(express.json());

// Base de datos temporal en memoria
let productos = [
    {
        id: 1,
        nombre: "Teclado mecánico",
        categoria: "Accesorios",
        precio: 1200,
        stock: 10
    },
    {
        id: 2,
        nombre: "Mouse inalámbrico",
        categoria: "Accesorios",
        precio: 650,
        stock: 15
    },
    {
        id: 3,
        nombre: "Monitor 24 pulgadas",
        categoria: "Monitores",
        precio: 3200,
        stock: 5
    }
];

// ==========================================
// READ - Consultar todos los productos
// GET /productos
// ==========================================

app.get("/productos", (req, res) => {
    res.status(200).json(productos);
});

// ==========================================
// READ - Consultar producto por ID
// GET /productos/:id
// ==========================================

app.get("/productos/:id", (req, res) => {

    const id = Number(req.params.id);

    const producto = productos.find(
        producto => producto.id === id
    );

    if (!producto) {
        return res.status(404).json({
            mensaje: "Producto no encontrado"
        });
    }

    res.status(200).json(producto);
});

// ==========================================
// CREATE - Agregar producto
// POST /productos
// ==========================================

app.post("/productos", (req, res) => {

    const { nombre, categoria, precio, stock } = req.body;

    if (
        typeof nombre !== "string" ||
        !nombre.trim() ||
        typeof categoria !== "string" ||
        !categoria.trim() ||
        typeof precio !== "number" ||
        !Number.isFinite(precio) ||
        precio < 0 ||
        typeof stock !== "number" ||
        !Number.isInteger(stock) ||
        stock < 0
    ) {
        return res.status(400).json({
            mensaje: "Datos del producto inválidos"
        });
    }

    const nuevoId = productos.length > 0
        ? Math.max(...productos.map(p => p.id)) + 1
        : 1;

    const nuevoProducto = {
        id: nuevoId,
        nombre: nombre.trim(),
        categoria: categoria.trim(),
        precio,
        stock
    };

    productos.push(nuevoProducto);

    res.status(201).json({
        mensaje: "Producto agregado correctamente",
        producto: nuevoProducto
    });
});

// ==========================================
// UPDATE - Actualizar producto
// PUT /productos/:id
// ==========================================

app.put("/productos/:id", (req, res) => {

    const id = Number(req.params.id);

    const indice = productos.findIndex(
        producto => producto.id === id
    );

    if (indice === -1) {
        return res.status(404).json({
            mensaje: "Producto no encontrado"
        });
    }

    const actual = productos[indice];

    const actualizado = {
        id,
        nombre: req.body.nombre ?? actual.nombre,
        categoria: req.body.categoria ?? actual.categoria,
        precio: req.body.precio ?? actual.precio,
        stock: req.body.stock ?? actual.stock
    };

    if (
        typeof actualizado.nombre !== "string" ||
        !actualizado.nombre.trim() ||
        typeof actualizado.categoria !== "string" ||
        !actualizado.categoria.trim() ||
        typeof actualizado.precio !== "number" ||
        !Number.isFinite(actualizado.precio) ||
        actualizado.precio < 0 ||
        typeof actualizado.stock !== "number" ||
        !Number.isInteger(actualizado.stock) ||
        actualizado.stock < 0
    ) {
        return res.status(400).json({
            mensaje: "Datos de actualización inválidos"
        });
    }

    actualizado.nombre = actualizado.nombre.trim();
    actualizado.categoria = actualizado.categoria.trim();

    productos[indice] = actualizado;

    res.status(200).json({
        mensaje: "Producto actualizado correctamente",
        producto: actualizado
    });
});

// ==========================================
// DELETE - Eliminar producto
// DELETE /productos/:id
// ==========================================

app.delete("/productos/:id", (req, res) => {

    const id = Number(req.params.id);

    const indice = productos.findIndex(
        producto => producto.id === id
    );

    if (indice === -1) {
        return res.status(404).json({
            mensaje: "Producto no encontrado"
        });
    }

    const productoEliminado = productos.splice(indice, 1)[0];

    res.status(200).json({
        mensaje: "Producto eliminado correctamente",
        producto: productoEliminado
    });
});

// ==========================================
// Ruta no encontrada
// ==========================================

app.use((req, res) => {
    res.status(404).json({
        mensaje: "Servicio no encontrado"
    });
});

// ==========================================
// Iniciar servidor
// ==========================================

app.listen(PORT, () => {
    console.log(
        `Servidor funcionando en http://localhost:${PORT}`
    );
});
