# QA V29 — Inventario Cíclico SIESA

## Resultado general

La versión V29 queda lista para prueba funcional en navegador con Firebase.

## Validaciones realizadas

| Revisión | Resultado |
|---|---|
| Sintaxis JavaScript `app.js` | Correcta |
| JSON `manifest.webmanifest` | Correcto |
| JSON `lineas_catalog.json` | Correcto |
| IDs HTML usados por JavaScript | Sin faltantes |
| Botones `data-view` contra secciones `.view` | Sin faltantes |
| Service Worker | Caché actualizado a V29 |
| ZIP final | Validado |

## Puntos funcionales que deben probarse con sesión real

1. Ingresar con rol `inventario` y verificar que abre en Conteo Express.
2. Generar tareas desde jefe logístico o super admin.
3. Filtrar por ubicación.
4. Escanear o digitar referencia.
5. Registrar conteo exacto.
6. Registrar diferencia menor, media y crítica.
7. Verificar que diferencia crítica pida foto.
8. Verificar que diferencia en metraje de cable pida foto.
9. Usar `Guardar y siguiente`.
10. Revisar historial de conteos.
11. Imprimir etiquetas QR.
12. Revisar indicadores: causa, ubicación, referencias repetidas y productividad.

## Nota técnica

La lectura automática de QR/código de barras depende del soporte del navegador para `BarcodeDetector`. En navegadores no compatibles queda disponible el ingreso manual del código.

