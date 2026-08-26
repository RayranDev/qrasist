'use client'

import { useRef, useState } from 'react'
import Modal from '@/components/Modal'
import { useToast } from '@/components/toast/ToastProvider'
import { IMPORT_CONFIG, type ImportType, type ImportResult } from '@/lib/excel/importConfig'

export default function BulkImportButton({ types }: { types: ImportType[] }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<ImportType>(types[0])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const showToast = useToast()

  const config = IMPORT_CONFIG[active]

  const close = () => {
    setOpen(false)
    setResult(null)
  }

  const handleDownloadTemplate = async () => {
    const { downloadWorkbook } = await import('@/lib/excel/exportWorkbook')
    await downloadWorkbook(`plantilla_${config.label.toLowerCase()}`, [
      { name: config.label, columns: config.columns, rows: [config.exampleRow] },
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
    <>
      <button
        type="button"
        onClick={() => {
          setActive(types[0])
          setOpen(true)
        }}
        className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-50 transition"
      >
        Importar Excel
      </button>

      {open && (
        <Modal title="Carga Masiva" onClose={close} maxWidth="max-w-2xl">
          {types.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {types.map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    setActive(type)
                    setResult(null)
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition ${
                    active === type
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {IMPORT_CONFIG[type].label}
                </button>
              ))}
            </div>
          )}

          <p className="text-sm text-gray-500 mb-5">
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
                <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-100">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50/80 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 font-bold text-gray-500 text-xs uppercase">
                          Fila
                        </th>
                        <th className="px-4 py-2 font-bold text-gray-500 text-xs uppercase">
                          Error
                        </th>
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
        </Modal>
      )}
    </>
  )
}
