'use client'

import { useRef, useState } from 'react'
import {
  bulkImportStudents,
  bulkImportProfessors,
  bulkImportSubjects,
  bulkImportEnrollments,
} from '@/lib/actions/bulkImport'
import { useToast } from '@/components/toast/ToastProvider'

type ImportType = 'STUDENT' | 'PROFESSOR' | 'SUBJECT' | 'ENROLLMENT'

interface ImportResult {
  success: true
  successCount: number
  errors: { row: number; message: string }[]
}

const CONFIG: Record<
  ImportType,
  {
    label: string
    columns: { header: string; key: string; width?: number }[]
    exampleRow: Record<string, string>
    action: (formData: FormData) => Promise<ImportResult | { success: false; error: string }>
  }
> = {
  STUDENT: {
    label: 'Estudiantes',
    columns: [
      { header: 'Nombres', key: 'nombres', width: 20 },
      { header: 'Apellidos', key: 'apellidos', width: 20 },
      { header: 'Correo', key: 'correo', width: 32 },
      { header: 'Contraseña', key: 'password', width: 16 },
      { header: 'Código', key: 'codigo', width: 16 },
    ],
    exampleRow: {
      nombres: 'Juan',
      apellidos: 'Pérez',
      correo: 'juan.perez@urepublicana.edu.co',
      password: 'CambiarClave123',
      codigo: '202512345678',
    },
    action: bulkImportStudents,
  },
  PROFESSOR: {
    label: 'Docentes',
    columns: [
      { header: 'Nombres', key: 'nombres', width: 20 },
      { header: 'Apellidos', key: 'apellidos', width: 20 },
      { header: 'Correo', key: 'correo', width: 32 },
      { header: 'Contraseña', key: 'password', width: 16 },
      { header: 'Código', key: 'codigo', width: 16 },
    ],
    exampleRow: {
      nombres: 'María',
      apellidos: 'Gómez',
      correo: 'maria.gomez@urepublicana.edu.co',
      password: 'CambiarClave123',
      codigo: '1122334455',
    },
    action: bulkImportProfessors,
  },
  SUBJECT: {
    label: 'Materias',
    columns: [
      { header: 'Nombre', key: 'nombre', width: 28 },
      { header: 'Código', key: 'codigo', width: 16 },
      { header: 'Correo Profesor', key: 'correoProfesor', width: 32 },
      { header: 'Período', key: 'periodo', width: 14 },
    ],
    exampleRow: {
      nombre: 'Cálculo I',
      codigo: 'CALC-101',
      correoProfesor: 'maria.gomez@urepublicana.edu.co',
      periodo: '2026-1',
    },
    action: bulkImportSubjects,
  },
  ENROLLMENT: {
    label: 'Inscripciones',
    columns: [
      { header: 'Código Materia', key: 'codigoMateria', width: 18 },
      { header: 'Código Estudiante', key: 'codigoEstudiante', width: 20 },
    ],
    exampleRow: {
      codigoMateria: 'CALC-101',
      codigoEstudiante: '202512345678',
    },
    action: bulkImportEnrollments,
  },
}

export default function ImportPanel() {
  const [active, setActive] = useState<ImportType>('STUDENT')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const showToast = useToast()

  const config = CONFIG[active]

  const handleDownloadTemplate = async () => {
    const { downloadWorkbook } = await import('@/lib/excel/exportWorkbook')
    await downloadWorkbook(`plantilla_${config.label.toLowerCase()}`, [
      {
        name: config.label,
        columns: config.columns,
        rows: [config.exampleRow],
      },
    ])
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setResult(null)
    const formData = new FormData()
    formData.append('file', file)

    const response = await config.action(formData)
    if (response.success) {
      setResult(response)
      if (response.errors.length === 0) {
        showToast(`${response.successCount} registro(s) importado(s) correctamente.`, 'success')
      } else {
        showToast(
          `${response.successCount} importado(s), ${response.errors.length} con errores.`,
          response.successCount > 0 ? 'success' : 'error'
        )
      }
    } else {
      showToast(response.error, 'error')
    }

    setLoading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(CONFIG) as ImportType[]).map((type) => (
          <button
            key={type}
            onClick={() => {
              setActive(type)
              setResult(null)
            }}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition ${
              active === type
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {CONFIG[type].label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:p-8">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Importar {config.label}</h3>
        <p className="text-sm text-gray-500 mb-6">
          Columnas esperadas: {config.columns.map((c) => c.header).join(', ')}.
        </p>

        <div className="flex flex-wrap gap-3 items-center mb-6">
          <button
            onClick={handleDownloadTemplate}
            className="px-4 py-2.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-100 transition"
          >
            Descargar plantilla
          </button>

          <label className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition cursor-pointer">
            {loading ? 'Importando...' : 'Subir archivo .xlsx'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleUpload}
              disabled={loading}
              className="hidden"
            />
          </label>
        </div>

        {result && (
          <div className="border-t border-gray-100 pt-5">
            <div className="flex items-center gap-4 mb-4">
              <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-sm font-bold rounded-lg">
                {result.successCount} exitoso{result.successCount !== 1 ? 's' : ''}
              </span>
              {result.errors.length > 0 && (
                <span className="px-3 py-1.5 bg-red-50 text-red-600 text-sm font-bold rounded-lg">
                  {result.errors.length} con error{result.errors.length !== 1 ? 'es' : ''}
                </span>
              )}
            </div>

            {result.errors.length > 0 && (
              <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50/80 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 font-bold text-gray-500 text-xs uppercase">Fila</th>
                      <th className="px-4 py-2 font-bold text-gray-500 text-xs uppercase">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {result.errors.map((err, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 font-mono text-gray-600">{err.row}</td>
                        <td className="px-4 py-2 text-red-600">{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
