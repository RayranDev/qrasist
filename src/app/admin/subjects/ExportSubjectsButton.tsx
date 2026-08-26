'use client'

import { format } from 'date-fns'

interface SubjectRow {
  code: string
  name: string
  professorName: string
  isActive: boolean
  studentCount: number
}

export default function ExportSubjectsButton({ subjects }: { subjects: SubjectRow[] }) {
  const handleExport = async () => {
    const { downloadWorkbook } = await import('@/lib/excel/exportWorkbook')
    await downloadWorkbook(`materias_${format(new Date(), 'dd-MM-yyyy')}`, [
      {
        name: 'Materias',
        columns: [
          { header: 'Código', key: 'code', width: 14 },
          { header: 'Nombre', key: 'name', width: 30 },
          { header: 'Profesor', key: 'professorName', width: 26 },
          { header: 'Estado', key: 'status', width: 14 },
          { header: 'Estudiantes Inscritos', key: 'studentCount', width: 18 },
        ],
        rows: subjects.map((s) => ({
          code: s.code,
          name: s.name,
          professorName: s.professorName,
          status: s.isActive ? 'Activa' : 'Archivada',
          studentCount: s.studentCount,
        })),
      },
    ])
  }

  return (
    <button
      onClick={handleExport}
      className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-bold text-sm rounded-xl transition"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
        />
      </svg>
      Exportar Materias
    </button>
  )
}
