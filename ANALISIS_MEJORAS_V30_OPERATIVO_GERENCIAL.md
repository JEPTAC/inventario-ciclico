# Inventario Cíclico SIESA — Mejoras V30 operativo-gerencial

## Objetivo de la V30

La V30 corrige la precisión del módulo Conteo Express y cierra las mejoras operativas solicitadas para que la APP funcione mejor en bodega, con soporte para conteo móvil, trazabilidad, decisiones gerenciales e impresión de etiquetas.

## 1. Conteo Express más preciso

Se agregó enriquecimiento automático de la tarea con información de `materials` y `lineas_catalog.json`. Ahora, cuando una tarea no trae descripción completa desde `countTasks`, la APP busca el nombre de la referencia en el catálogo de materiales o en el catálogo de líneas.

Mejoras visibles:

- La tarjeta principal muestra referencia, nombre/descripción, línea, ubicación, unidad, stock/metraje y valor.
- La lista rápida muestra el nombre de la referencia en negrilla.
- El diálogo de conteo muestra `referencia · nombre · ubicación`.
- La búsqueda del Conteo Express ahora filtra por referencia, nombre, línea, categoría y ubicación.

## 2. Etiquetas QR imprimibles

Se mejoró el generador de etiquetas QR:

- Etiquetas por referencia.
- Etiquetas por ubicación.
- Tamaño estándar, grande de bodega y compacto.
- Diseño de impresión con columnas adaptadas al tamaño.
- La etiqueta conserva el texto `MAT:<referencia>` o `LOC:<ubicación>` para digitación manual si no carga el QR.
- El QR incluye nombre y ubicación en el cuerpo visible de la etiqueta.

## 3. Modo offline avanzado

Además de la persistencia offline de Firestore, se agregó una cola local explícita en `localStorage`:

- La APP muestra si está en línea o sin conexión.
- Muestra cuántos conteos están pendientes por sincronizar.
- Permite guardar conteos sin foto cuando no hay conexión.
- Bloquea el guardado offline si la diferencia exige foto obligatoria.
- Al recuperar conexión, la APP intenta sincronizar los conteos pendientes.
- La sincronización crea el registro en `counts`, actualiza la tarea y genera reconteo o caso según corresponda.

## 4. Mapa de calor

Se agregó mapa de calor por ubicación en el tablero gerencial. La ubicación se ordena por valor de diferencia e incluye:

- cantidad de diferencias;
- valor asociado;
- barra visual de severidad.

## 5. Ranking de causas

Se agregó ranking gerencial de causas. Este ranking consolida las diferencias por causa y muestra:

- causa;
- número de repeticiones;
- valor asociado.

## 6. Tiempos por conteo

La APP ya registraba duración por conteo. En V30 ese dato se sube al tablero gerencial y al análisis de productividad:

- tiempo promedio por conteo;
- productividad por usuario en indicadores;
- alertas si el conteo promedio se vuelve lento.

## 7. Informe automático PDF por caso

El botón `Informe` ahora intenta generar un PDF real con jsPDF. El informe incluye:

- referencia;
- descripción;
- ubicación;
- estado;
- diferencia;
- porcentaje;
- impacto económico;
- severidad;
- último comentario;
- historial del caso;
- verificación del jefe logístico;
- contabilización de auditoría;
- conteos relacionados cargados en memoria.

Si jsPDF no está disponible, conserva el respaldo en HTML descargable.

## 8. Alertas inteligentes

Se agregó lectura automática para:

- casos pendientes de gerencia;
- referencias con diferencias repetidas;
- ubicaciones calientes;
- conteos lentos;
- conteos offline pendientes.

Estas alertas aparecen en el tablero gerencial y también alimentan las notificaciones del rol correspondiente.

## 9. Tablero ejecutivo gerencial

El módulo Gerencia ahora tiene una vista ejecutiva antes de la tabla de casos:

- exactitud por cantidad;
- exactitud por valor;
- valor total de diferencias;
- pendientes de gerencia;
- casos críticos;
- tiempo promedio de conteo;
- mapa de calor;
- ranking de causas;
- alertas inteligentes.

## Recomendación de prueba funcional

Después de subir esta versión, se recomienda probar en este orden:

1. Abrir `?view=express` y validar que las referencias muestren nombre.
2. Escanear o digitar `MAT:<referencia>`.
3. Guardar un conteo exacto.
4. Guardar un conteo con diferencia menor.
5. Validar que una diferencia crítica exija foto.
6. Probar modo offline sin foto.
7. Volver a conexión y validar la sincronización.
8. Abrir Gerencia y generar PDF de un caso.
9. Imprimir etiquetas QR en tamaño estándar y grande.
