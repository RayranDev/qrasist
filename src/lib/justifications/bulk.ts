// Tope por llamada de la aprobación masiva. Vive aparte de las server
// actions porque un archivo 'use server' solo puede exportar funciones
// async, y la UI también lo necesita para limitar la selección. Coincide con
// el máximo de selección de otros diálogos masivos (SubjectPickerDialog) y
// cubre de sobra la página de 25 del admin.
export const MAX_BULK_APPROVE = 50
