const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Base de datos
const db = new sqlite3.Database("./inventario.db", (error) => {
    if (error) {
        console.error("Error al abrir la base de datos:", error.message);
        return;
    }

    console.log("Conexión con SQLite establecida.");

    crearTabla();
});

// Crear tabla si todavía no existe
function crearTabla() {
    const sql = `
        CREATE TABLE IF NOT EXISTS productos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            categoria TEXT NOT NULL,
            precio REAL NOT NULL,
            existencias INTEGER NOT NULL
        )
    `;

    db.run(sql, (error) => {
        if (error) {
            console.error("Error al crear la tabla:", error.message);
        } else {
            console.log("Tabla productos disponible.");
            insertarDatosIniciales();
        }
    });
}

// Insertar los productos iniciales únicamente si la tabla está vacía
function insertarDatosIniciales() {
    const sqlConteo = "SELECT COUNT(*) AS total FROM productos";

    db.get(sqlConteo, [], (error, fila) => {
        if (error) {
            console.error("Error al verificar productos:", error.message);
            return;
        }

        if (fila.total === 0) {
            const sqlInsertar = `
                INSERT INTO productos
                (nombre, categoria, precio, existencias)
                VALUES (?, ?, ?, ?)
            `;

            const productosIniciales = [
                ["Teclado mecánico", "Accesorios", 1200, 10],
                ["Mouse inalámbrico", "Accesorios", 650, 15],
                ["Monitor 24 pulgadas", "Monitores", 3200, 5]
            ];

            productosIniciales.forEach((producto) => {
                db.run(sqlInsertar, producto);
            });

            console.log("Productos iniciales insertados.");
        }
    });
}

// READ - Consultar todos los productos
app.get("/productos", (req, res) => {

    const sql = `
        SELECT id, nombre, categoria, precio, existencias
        FROM productos
        ORDER BY id
    `;

    db.all(sql, [], (error, productos) => {

        if (error) {
            return res.status(500).json({
                error: "No fue posible consultar los productos"
            });
        }

        res.json(productos);
    });
});

// READ - Consultar un producto por ID
app.get("/productos/:id", (req, res) => {

    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            error: "ID de producto inválido"
        });
    }

    const sql = `
        SELECT id, nombre, categoria, precio, existencias
        FROM productos
        WHERE id = ?
    `;

    db.get(sql, [id], (error, producto) => {

        if (error) {
            return res.status(500).json({
                error: "Error al consultar el producto"
            });
        }

        if (!producto) {
            return res.status(404).json({
                error: "Producto no encontrado"
            });
        }

        res.json(producto);
    });
});

// CREATE - Agregar producto
app.post("/productos", (req, res) => {

    const {
        nombre,
        categoria,
        precio,
        existencias
    } = req.body;

    if (
        !nombre ||
        !categoria ||
        precio === undefined ||
        existencias === undefined
    ) {
        return res.status(400).json({
            error: "Faltan datos del producto"
        });
    }

    const sql = `
        INSERT INTO productos
        (nombre, categoria, precio, existencias)
        VALUES (?, ?, ?, ?)
    `;

    db.run(
        sql,
        [
            nombre,
            categoria,
            Number(precio),
            Number(existencias)
        ],
        function (error) {

            if (error) {
                return res.status(500).json({
                    error: "No fue posible agregar el producto"
                });
            }

            res.status(201).json({
                mensaje: "Producto agregado correctamente",
                producto: {
                    id: this.lastID,
                    nombre,
                    categoria,
                    precio: Number(precio),
                    existencias: Number(existencias)
                }
            });
        }
    );
});

// UPDATE - Editar producto
app.put("/productos/:id", (req, res) => {

    const id = req.params.id;

    const {
        nombre,
        categoria,
        precio,
        existencias
    } = req.body;

    if (
        !nombre ||
        !categoria ||
        precio === undefined ||
        existencias === undefined
    ) {
        return res.status(400).json({
            error: "Faltan datos del producto"
        });
    }

    const sql = `
        UPDATE productos
        SET nombre = ?,
            categoria = ?,
            precio = ?,
            existencias = ?
        WHERE id = ?
    `;

    db.run(
        sql,
        [
            nombre,
            categoria,
            Number(precio),
            Number(existencias),
            id
        ],
        function (error) {

            if (error) {
                return res.status(500).json({
                    error: "No fue posible actualizar el producto"
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    error: "Producto no encontrado"
                });
            }

            res.json({
                mensaje: "Producto actualizado correctamente"
            });
        }
    );
});

// DELETE - Eliminar producto
app.delete("/productos/:id", (req, res) => {

    const id = req.params.id;

    const sql = `
        DELETE FROM productos
        WHERE id = ?
    `;

    db.run(sql, [id], function (error) {

        if (error) {
            return res.status(500).json({
                error: "No fue posible eliminar el producto"
            });
        }

        if (this.changes === 0) {
            return res.status(404).json({
                error: "Producto no encontrado"
            });
        }

        res.json({
            mensaje: "Producto eliminado correctamente"
        });
    });
});

app.listen(PORT, () => {
    console.log(
        `Servidor funcionando en http://localhost:${PORT}`
    );
});