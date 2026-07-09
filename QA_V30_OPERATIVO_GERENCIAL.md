# QA V30 — Inventario Cíclico SIESA

## Revisión estática ejecutada

| Elemento | Resultado |
|---|---|
| `app.js` | Sintaxis validada con `node --check` |
| `service-worker.js` | Sintaxis validada con `node --check` |
| `manifest.webmanifest` | JSON válido |
| IDs HTML duplicados | Sin duplicados |
| Referencias JS a IDs HTML | Sin IDs faltantes |
| Service Worker | Caché actualizado a V30 |
| PDF por caso | Implementado con jsPDF y fallback HTML |
| QR imprimible | Tamaños estándar, grande y compacto |
| Offline avanzado | Cola local + estado visual + sincronización al volver conexión |
| Tablero gerencial | KPIs, mapa de calor, ranking y alertas |

## Correcciones sobre V29

1. Conteo Express ahora enriquece las tareas con nombre real de referencia.
2. Se corrigió el problema visual donde solo se veía el código de referencia.
3. Se agregó barra/estado de conexión y cantidad de conteos pendientes offline.
4. Se amplió el módulo Gerencia para evitar depender únicamente de una tabla.
5. El informe por caso ahora sale como PDF cuando la librería está disponible.
6. Las etiquetas QR ahora tienen formato de impresión más útil para bodega.

## Validaciones funcionales sugeridas

- Ingresar como inventario y abrir Conteo Express.
- Confirmar que cada tarjeta muestre referencia + descripción.
- Usar filtros por ubicación, referencia y nombre del material.
- Crear conteo con diferencia menor y verificar que se cree reconteo.
- Crear diferencia persistente y validar paso a jefe logístico.
- Enviar caso a auditoría y luego gerencia.
- Generar PDF del caso.
- Probar impresión de QR en los tres tamaños.
- Desconectar internet, registrar conteo sin foto y volver a conectar.

## Limitaciones conocidas

- En modo offline no se permite subir foto a Drive, porque Drive requiere conexión.
- Si la diferencia es crítica o de cable y exige foto, el conteo debe guardarse con conexión.
- El QR automático depende de un servicio externo para dibujar la imagen; si no carga, la etiqueta conserva el código en texto.
- Las notificaciones web dependen del permiso del navegador y del soporte del sistema operativo.
