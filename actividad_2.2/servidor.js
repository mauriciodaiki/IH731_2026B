const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 8000;

// Permitir solicitudes desde otros orígenes
app.use(cors());

// Permitir recibir datos JSON
app.use(express.json());

// Datos almacenados temporalmente en memoria RAM
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
// READ - Obtener todos los productos
// GET /productos
// ==========================================

app.get("/productos", (req, res) => {
    res.status(200).json(productos);
});


// ==========================================
// READ - Obtener un producto por ID
// GET /productos/:id
// ==========================================

app.get("/productos/:id", (req, res) => {

    const id = parseInt(req.params.id);

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
// CREATE - Crear un producto
// POST /productos
// ==========================================

app.post("/productos", (req, res) => {

    const {
        nombre,
        categoria,
        precio,
        stock
    } = req.body;

    // Validar información
    if (!nombre || !categoria || precio === undefined || stock === undefined) {
        return res.status(400).json({
            mensaje: "Faltan datos del producto"
        });
    }

    // Crear nuevo ID
    const nuevoId =
        productos.length > 0
            ? Math.max(...productos.map(producto => producto.id)) + 1
            : 1;

    const nuevoProducto = {
        id: nuevoId,
        nombre,
        categoria,
        precio,
        stock
    };

    productos.push(nuevoProducto);

    res.status(201).json({
        mensaje: "Producto creado correctamente",
        producto: nuevoProducto
    });
});


// ==========================================
// UPDATE - Actualizar un producto
// PUT /productos/:id
// ==========================================

app.put("/productos/:id", (req, res) => {

    const id = parseInt(req.params.id);

    const indice = productos.findIndex(
        producto => producto.id === id
    );

    if (indice === -1) {
        return res.status(404).json({
            mensaje: "Producto no encontrado"
        });
    }

    const {
        nombre,
        categoria,
        precio,
        stock
    } = req.body;

    // Actualizar producto
    productos[indice] = {
        id: id,
        nombre: nombre ?? productos[indice].nombre,
        categoria: categoria ?? productos[indice].categoria,
        precio: precio ?? productos[indice].precio,
        stock: stock ?? productos[indice].stock
    };

    res.status(200).json({
        mensaje: "Producto actualizado correctamente",
        producto: productos[indice]
    });
});


// ==========================================
// DELETE - Eliminar un producto
// DELETE /productos/:id
// ==========================================

app.delete("/productos/:id", (req, res) => {

    const id = parseInt(req.params.id);

    const indice = productos.findIndex(
        producto => producto.id === id
    );

    if (indice === -1) {
        return res.status(404).json({
            mensaje: "Producto no encontrado"
        });
    }

    const productoEliminado = productos[indice];

    productos.splice(indice, 1);

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