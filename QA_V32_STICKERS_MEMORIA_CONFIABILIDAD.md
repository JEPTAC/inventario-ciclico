# QA V32 — Stickers, memoria histórica y confiabilidad

## Validaciones realizadas

### Sintaxis
- `app.js`: validado con `node --check`.
- `service-worker.js`: validado con `node --check`.
- `manifest.webmanifest`: JSON válido.
- `lineas_catalog.json`: JSON válido.

### HTML / JavaScript
- No se encontraron IDs duplicados en `index.html`.
- Todas las referencias tipo `$("#id")` usadas en `app.js` existen en el HTML.
- Los botones principales tienen evento directo, `data-*` funcional, acción de navegación o comportamiento submit.

### Etiquetas
- El formato de impresión se cambió a hoja carta.
- La impresión organiza 16 etiquetas por página: 4 columnas x 4 filas.
- Cada sticker incluye QR, Code128, código interno visible y espacio para stock físico escrito con marcador.
- La impresión en cola y la impresión individual usan el mismo formato operativo.

### Memoria histórica
- Se agregó `referenceMemory` al estado de la APP.
- `loadMaterials()` combina `materials` + `referenceMemory` al cargar.
- `processSiesaMaterials()` usa `referenceMemory` para no perder última contabilización al sincronizar un Excel nuevo.
- `saveCount()` actualiza `referenceMemory` en conteos de tarea y conteos de caso.
- La sincronización de conteos offline también actualiza `referenceMemory`.

### Indicadores
- Se agregó cálculo de confiabilidad operativa.
- El tablero gerencial muestra confiabilidad y cobertura de memoria.
- Indicadores muestra memoria de referencias y completitud de datos.

## Requisito posterior al despliegue
Después de subir archivos al repositorio, publicar `firestore.rules` actualizado. Luego hacer Ctrl + F5 para limpiar caché y tomar Service Worker V32.
