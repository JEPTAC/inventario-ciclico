# Análisis de mejoras V33 — Stickers completos, responsive automático y KPIs

## Objetivo

Corregir la ausencia visual del botón para imprimir todos los stickers, depurar la impresión para hoja carta con 16 etiquetas por página y reforzar el comportamiento responsive en pantallas pequeñas o de baja resolución.

## Cambios aplicados

### 1. Impresión de stickers

Se agregaron dos acciones funcionales y explícitas:

- **Imprimir 16 visibles**: imprime la cantidad configurada en `Cantidad a preparar`, por defecto 16.
- **Imprimir todos los stickers**: imprime todos los resultados del filtro actual, organizados automáticamente en páginas de 16.

La plantilla de impresión ahora arma páginas reales de 16 posiciones en matriz **4 x 4**. Si la última página no completa los 16 stickers, se agregan espacios vacíos invisibles para conservar la distribución de hoja.

Cada sticker mantiene:

- QR.
- Código de barras Code128.
- Código interno EI-REF / EI-UBI.
- Referencia o ubicación.
- Descripción visible.
- Unidad/ubicación cuando aplique.
- Campo físico **STOCK FÍSICO** para escribir con marcador.

### 2. Responsive automático

Se agregó detección automática de viewport:

- `auto-wide`: pantalla amplia.
- `auto-compact`: ancho menor o igual a 760 px, o altura menor o igual a 760 px.
- `auto-ultra-compact`: ancho menor o igual a 430 px, o altura menor o igual a 620 px.
- `auto-low-res`: pantalla de baja resolución o área útil reducida.

El modo compacto se recalcula en `resize` y `orientationchange`.

Ajustes visuales:

- Menor padding en tarjetas y KPIs.
- Topbar más baja.
- Botones táctiles más proporcionales.
- Conteo Express en una columna.
- Teclado de cantidad 4 x 2.
- Tablas y listas con scroll controlado por altura real de pantalla.
- Menú lateral abreviado cuando la altura es baja aunque el ancho sea mayor a 760 px.

### 3. KPIs adicionales

Se agregó función `inventoryHealthMetrics()` para calcular:

- Tasa de diferencias.
- Desviación sobre valor contado.
- Diferencia neta valorizada.
- Cumplimiento del plan diario.
- Productividad estimada en conteos por hora.
- Referencias con memoria mayor a 180 días.

Estos indicadores se integran en el módulo Indicadores y en el tablero gerencial.

## Criterio operativo aplicado

La app debe evitar botones decorativos. Los nuevos botones tienen listeners reales:

- `printQrLabelsBtn` → `printQrLabels()`.
- `printAllQrLabelsBtn` → `printAllQrLabels()`.
- `printQuickLabelBtn` → `printLabelQueue()`.

## Recomendación de uso en bodega

1. Filtrar por referencia o ubicación.
2. Usar `Cantidad a preparar = 16` para una hoja completa.
3. Presionar **Imprimir 16 visibles**.
4. Pegar etiquetas durante el conteo.
5. Escribir stock físico con marcador si se requiere validación rápida en campo.
6. Cuando ya esté todo filtrado por bodega o línea, usar **Imprimir todos los stickers**.
