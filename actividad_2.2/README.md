## Nombre: Mauricio Daiki Rascón Yamamoto
## Materia: TENDENCIAS DE DISEÑO DE SERVICIOS
## Asesor/a: OSCAR GREGORIO SILVA MARES

# Actividad 2.2. Manipulación de datos a través de servicios
En esta actividad desarrollé un conjunto de servicios REST con Node.js, Express y Cors. Para representar la información utilicé un arreglo de productos almacenado temporalmente en memoria. Cada producto contiene un identificador, nombre, categoría, precio y cantidad disponible.
Implementé las cuatro operaciones principales de un CRUD. Para consultar información utilicé el método GET; para agregar nuevos productos utilicé POST; para modificar productos existentes utilicé PUT; y para eliminarlos utilicé DELETE. Cada servicio responde utilizando información en formato JSON y códigos HTTP correspondientes al resultado de la petición.
Debido a que en esta actividad no se requiere persistencia, los datos se almacenan únicamente mientras el servidor está en ejecución. Esto permitió concentrarme en comprender el funcionamiento de las rutas, los métodos HTTP y la manipulación de la información mediante una API REST.
