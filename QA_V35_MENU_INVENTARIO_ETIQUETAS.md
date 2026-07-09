# QA V35 · Menú Inventario y Etiquetas

## Problema reportado
El rol de inventario no visualizaba los módulos **Conteo simple** ni **Etiquetas / Códigos**.

## Causa probable
Aunque `VIEW_ACCESS` permitía `inventario`, los perfiles existentes podían tener el rol guardado con otra palabra o variante, por ejemplo `inventory`, `auxiliar`, `auxiliar_inventario`, `operario`, `operador`, `bodega` o similares. En ese caso, la función de permisos no lo reconocía como `inventario` y ocultaba los botones.

## Corrección aplicada
Se agregó `normalizeRole(rawRole)` y la función `role()` ahora convierte variantes comunes al rol estándar interno:

- `inventory` → `inventario`
- `auxiliar` → `inventario`
- `auxiliar_inventario` → `inventario`
- `auxiliar_de_inventario` → `inventario`
- `operario` → `inventario`
- `operador` → `inventario`
- `bodega` → `inventario`
- `almacen` / `almacenista` → `inventario`

## Resultado esperado
El usuario de inventario debe ver en el menú lateral:

1. Conteo simple
2. Mis pendientes
3. Historial
4. Metraje cables, cuando aplique
5. Etiquetas diarias

No debe ver módulos administrativos como Usuarios, Drive/SIESA, Jefe logístico, Auditoría, Gerencia, Indicadores ni Configuración.

## Validaciones
- `app.js`: sintaxis válida.
- `service-worker.js`: sintaxis válida.
- `manifest.webmanifest`: JSON válido.
- `lineas_catalog.json`: JSON válido.
- HTML sin IDs duplicados.
- `expressView` permite `inventario`.
- `qrLabelsView` permite `inventario`.
- Service Worker actualizado a V35.
