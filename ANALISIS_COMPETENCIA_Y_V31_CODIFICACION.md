# V31 — Codificación durante el conteo + mejoras competitivas

## 1. Problema operativo identificado

En bodega no existe una codificación física completa con códigos de barras o QR. Por eso, pedir escaneo desde el inicio no resuelve el problema real: primero hay que permitir que el usuario cree la etiqueta mientras cuenta.

La V31 convierte el flujo en:

1. Buscar o escanear ubicación.
2. Buscar o escanear referencia.
3. Contar físicamente.
4. Crear etiqueta de referencia o ubicación si no existe.
5. Imprimir QR + Code128 + texto grande.
6. Continuar con “Guardar y siguiente”.

## 2. Investigación de mercado aplicada

### Sortly
Funcionalidades emuladas:
- QR y códigos de barras para inventario.
- Etiquetas imprimibles.
- Fotos por ítem.
- Campos personalizados.
- Alertas de stock bajo y alertas por fecha.
- Acceso offline y sincronización.

Aplicación en la APP:
- Generador de etiquetas por referencia y ubicación.
- Cola de etiquetas creada durante el conteo.
- Persistencia local y sincronización Firestore de códigos generados.

### Odoo Inventory / Barcode
Funcionalidades emuladas:
- Conteo por ubicación.
- Escaneo de ubicación y productos.
- Flujo tipo “Count Inventory”.

Aplicación en la APP:
- Conteo Express por ubicación + referencia.
- Escáner QR/código de barras.
- Lectura de códigos `LOC:`, `MAT:`, `EI|LOC|...`, `EI|MAT|...` y códigos internos `EI-UBI-*` / `EI-REF-*`.

### NetSuite Smart Count
Funcionalidades emuladas:
- Conteo durante operación normal.
- Tolerancias por cantidad, porcentaje y valor.
- Escalamiento por diferencia.

Aplicación en la APP:
- Semáforo de severidad.
- Evidencia obligatoria por diferencia crítica.
- Escalamiento a jefe, auditoría y gerencia.

### inFlow / Finale Inventory
Funcionalidades emuladas:
- Escaneo móvil.
- Generación de etiquetas para productos y bins/sublocaciones.
- Impresión en formatos simples.

Aplicación en la APP:
- Etiquetas de referencia y ubicación.
- Tamaño compacto, estándar y grande de bodega.
- QR + Code128 + texto legible.

### Katana / soluciones tipo manufactura
Funcionalidades emuladas:
- Trazabilidad por material.
- Movimientos y visibilidad por ubicación.
- Enfoque en operación de piso.

Aplicación en la APP:
- Historial por referencia.
- Causas, tiempos, mapa de calor y tablero gerencial.

## 3. Nuevo estándar de código interno

La V31 crea códigos simples y entendibles:

- Referencia/material: `EI-REF-REFERENCIA`
- Ubicación/estante: `EI-UBI-BODEGA-PASILLO-ESTANTE`

El QR conserva mayor información en texto estructurado:

- Material: `EI|MAT|EI-REF-105041|REF:105041|LOC:Bodega A|UM:und|DESC:...`
- Ubicación: `EI|LOC|EI-UBI-BODEGA-A-ESTANTE-2|LOC:Bodega A Estante 2`

Esto permite que el escaneo sea flexible:

- si lee QR, toma la referencia exacta;
- si lee código de barras, busca el código interno;
- si falla imagen, el usuario puede digitar el texto grande.

## 4. Mejoras integradas en V31

### 4.1 Codificación en Conteo Express

En la tarjeta principal de la tarea se agregó:

- Código interno sugerido.
- Botón “Etiqueta ref”.
- Botón “Etiqueta ubicación”.
- Botón “Imprimir ref”.

### 4.2 Codificación dentro del diálogo de conteo

Al abrir “Contar ahora”, la APP muestra:

- código sugerido de referencia;
- código sugerido de ubicación;
- botón para crear etiqueta de referencia;
- botón para crear etiqueta de ubicación;
- botón para imprimir referencia en tamaño grande.

Esto permite etiquetar el material físico mientras se está haciendo el inventario.

### 4.3 Generador manual de códigos

En el módulo “Etiquetas / Códigos” se agregó un panel para crear etiquetas aunque el material todavía no esté completamente codificado:

- clase: referencia o ubicación;
- referencia;
- nombre/descripción;
- ubicación;
- unidad;
- vista previa;
- cola de impresión.

### 4.4 Cola de codificación

La APP guarda localmente las etiquetas creadas y las mantiene disponibles para imprimir en lote.

También intenta registrar cada etiqueta en Firestore en `generatedLabels`, para que quede trazabilidad de qué códigos fueron creados, por quién y cuándo.

### 4.5 Impresión profesional

Cada etiqueta incluye:

- QR exacto;
- Code128;
- código interno grande;
- descripción;
- ubicación;
- unidad;
- tipo de etiqueta.

## 5. Recomendación operativa de implementación física

Para bodega se recomienda empezar así:

1. Primera semana: codificar ubicaciones grandes: bodega, pasillo, estante y nivel.
2. Segunda semana: codificar referencias A+ y A por valor.
3. Tercera semana: codificar cables y referencias con diferencias repetidas.
4. Cuarta semana: codificar referencias B y C.
5. Mantener referencias D/E bajo demanda: se etiquetan cuando aparezcan en conteo.

Este enfoque evita parar toda la bodega para codificar todo de una vez.

## 6. Próxima fase recomendada

Para una V32, las mejoras más potentes serían:

- Modo “Alta rápida de material no encontrado”.
- Foto obligatoria al crear código nuevo.
- Validación duplicada: impedir dos códigos para la misma referencia.
- Etiqueta por lote de ubicación: imprimir todos los materiales de un estante.
- Registro de movimiento: traslado de ubicación por escaneo origen → destino.
- Kanban de codificación: sin etiqueta, etiquetado, impreso, pegado, validado.
- Plantillas para impresora Zebra/Dymo si la empresa compra impresora térmica.
