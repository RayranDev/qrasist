# Documentación de QR-Asist

Cada carpeta responde a una pregunta distinta. Antes de agregar un archivo, elige la carpeta por lo que es, no por cuándo se creó.

| Carpeta | Qué contiene | ¿Se actualiza? |
| --- | --- | --- |
| `entregables/` | Los cuatro documentos del proyecto en Word: manual de usuario, documentación de la aplicación, casos de uso y documentación del proyecto. | Sí, cuando cambia el software. |
| `seguimiento/` | `QR-Asist_Registro_de_Cambios_Software.xlsx`: registro de cada cambio de software (funcionalidades, mejoras, correcciones, migraciones). | Sí, con cada cambio. Ver su hoja «Guía». |
| `tecnica/` | Guías técnicas vigentes: propuesta de modo sin conexión, configuración de Supabase Auth y verificación autónoma con el entorno local. | Sí, cuando cambia lo que describen. |
| `referencia/` | Documentos de origen que no son nuestros, como el levantamiento de requisitos del otro equipo. | No. Solo se cita. |
| `presentaciones/` | Presentaciones de sustentación e informe técnico. | No, salvo para una nueva sustentación. |
| `archivo/` | Material histórico o superado, conservado hasta decidir su retiro. | No. No lo uses como fuente. |

## Reglas para mantenerla ordenada

- Los entregables `.docx` y el libro `.xlsx` no se versionan en git hoy; viven en su carpeta y se respaldan fuera del repositorio.
- Una guía técnica nueva va en `tecnica/`; si queda obsoleta, se mueve a `archivo/` en vez de dejarla donde estaba.
- Los documentos del otro equipo van en `referencia/` sin modificarlos.
- Un archivo de `archivo/` que nadie consulta durante un tiempo razonable se propone para retiro; no se borra sin aprobación.
