# Análisis V35 · Menú por rol Inventario

La V35 corrige el acceso del rol operativo. El objetivo es que el auxiliar tenga una navegación mínima, pero completa para su trabajo diario.

## Regla operativa
El auxiliar no debe analizar ni decidir diferencias. Su flujo debe ser:

**Conteo simple → registrar cantidad física → guardar y siguiente**

La impresión de códigos no debe estar dentro del conteo, pero sí debe estar disponible en un módulo separado:

**Etiquetas diarias → cargar pendientes de hoy → imprimir stickers → pegar mientras se cuenta**

## Ajuste técnico
Se mantuvo el rol estándar interno `inventario`, pero se agregó normalización para aceptar perfiles existentes que puedan venir escritos con variantes. Esto evita que usuarios ya creados queden sin menú por diferencias de nomenclatura.

## Módulos habilitados para auxiliar
- Conteo simple
- Mis pendientes
- Historial
- Metraje cables
- Etiquetas diarias

## Módulos restringidos
- Usuarios
- Drive / SIESA
- Jefe logístico
- Auditoría
- Gerencia
- Materiales
- Líneas / Cables
- Indicadores
- Configuración
