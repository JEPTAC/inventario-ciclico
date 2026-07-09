# V32 — Stickers 16 por hoja, memoria histórica y confiabilidad operativa

## Objetivo
La V32 depura la V31 para evitar botones decorativos, fortalecer la impresión física de etiquetas y agregar memoria histórica de referencias. El propósito operativo es que bodega pueda codificar mientras cuenta, pegar etiquetas en campo y conservar el último conteo aunque el Excel SIESA cambie.

## Funcionalidades competitivas emuladas

### 1. Codificación práctica en campo
Apps como Sortly, inFlow Stockroom, Finale Inventory, Odoo Barcode y Zoho Inventory usan escaneo, QR/código de barras, etiquetas, ubicaciones/bins y conteo móvil como flujo central. La V32 adapta esa lógica al contexto de bodega sin exigir que todo esté previamente codificado.

### 2. Impresión física real
Se ajustó el módulo de etiquetas para imprimir en formato carta con 16 stickers por hoja:
- 4 columnas por 4 filas.
- Corte visual limpio.
- QR + código de barras + código interno visible.
- Texto manual para contingencia.
- Espacio de stock físico para escribir con marcador.

### 3. Memoria histórica de referencia
Se agregó colección `referenceMemory` para recordar:
- última fecha de conteo;
- cantidad del sistema;
- cantidad física;
- diferencia;
- valor de diferencia;
- severidad;
- causa;
- usuario que contó;
- duración del conteo;
- código interno sugerido.

Esta memoria se consulta al cargar materiales y se vuelve a combinar durante la sincronización con SIESA. Así, si el Excel cambia, la referencia conserva trazabilidad de su último conteo.

## KPIs y cálculos agregados

### Confiabilidad operativa
Indicador compuesto para lectura gerencial:

```text
Confiabilidad = exactitud por cantidad x 34%
              + exactitud por valor x 34%
              + completitud de datos x 12%
              + cobertura de memoria x 12%
              + base de estabilidad x 8 puntos
              - penalización por diferencias repetidas
              - penalización por casos abiertos
              - penalización por diferencias críticas
```

Clasificación:
- Alta: 95% o más.
- Buena: 85% a 94%.
- Media: 70% a 84%.
- Baja: menor a 70%.

### Exactitud por cantidad
```text
Exactitud = conteos exactos / conteos registrados
```

### Exactitud por valor
```text
Exactitud valor = 1 - valor absoluto de diferencias / valor contado
```

### Cobertura de memoria
```text
Cobertura memoria = referencias con último conteo guardado / materiales activos
```

### Completitud de datos
```text
Completitud = materiales con referencia + descripción + ubicación o línea / materiales activos
```

## Limpieza funcional
- Se dejaron únicamente botones con evento asociado.
- La impresión individual de referencia usa el mismo formato de sticker operativo.
- La selección de formato se simplificó a hoja carta de 16 stickers.
- Se conserva generación manual de código porque es necesaria cuando bodega encuentra materiales sin etiqueta.

## Reglas Firestore nuevas
Se agregó:

```text
/referenceMemory/{refId}
```

Lectura para usuarios activos y escritura para inventario, jefe logístico, auditoría y gerencia, porque el conteo de cualquiera de estos roles puede actualizar la última contabilización de una referencia.

## Resultado
La APP pasa de solo imprimir QR a operar como sistema de codificación progresiva: mientras se cuenta, se etiqueta; mientras se etiqueta, se crea memoria; y mientras se guarda memoria, los indicadores de confiabilidad mejoran con trazabilidad real.
