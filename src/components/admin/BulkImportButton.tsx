'use client'

import { useRef, useState } from 'react'
import Modal from '@/components/Modal'
import { useToast } from '@/components/toast/ToastProvider'
import { IMPORT_CONFIG, type ImportType, type ImportResult } from '@/lib/excel/importConfig'
import { countOf } from '@/lib/utils/plural'
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS } from '@/lib/excel/importSchemas'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export default function BulkImportButton({ types }: { types: ImportType[] }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<ImportType>(types[0])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const showToast = useToast()

  const config = IMPORT_CONFIG[active]

  const close = () => {
    setOpen(false)
    setResult(null)
  }

  // La plantilla se genera en el servidor al descargar, con las carreras
  // (y períodos) activos de la base como listas desplegables.
  const handleDownloadTemplate = async () => {
    setDownloading(true)
    try {
      const response = await fetch(`/admin/import-template?type=${active}`)
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || 'No se pudo descargar la plantilla.')
      }
      // Con la sesión vencida el proxy redirige a /login y fetch recibe un HTML con 200:
      // guardarlo como .xlsx entregaría un archivo corrupto.
      if (response.redirected || !response.headers.get('content-type')?.includes(XLSX_MIME)) {
        throw new Error('Tu sesión expiró. Inicia sesión de nuevo.')
      }
      const { downloadBlob } = await import('@/lib/excel/exportWorkbook')
      downloadBlob(`plantilla_${config.label.toLowerCase()}`, await response.blob())
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'No se pudo descargar la plantilla.',
        'error'
      )
    } finally {
      setDownloading(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const resetInput = () => {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      showToast('El archivo debe ser un .xlsx (Excel).', 'error')
      resetInput()
      return
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      showToast(
        `El archivo supera los ${Math.round(MAX_IMPORT_FILE_BYTES / 1024)} KB. Divídelo en archivos de máximo ${MAX_IMPORT_ROWS} filas.`,
        'error'
      )
      resetInput()
      return
    }

    setLoading(true)
    setResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await config.action(formData)
      if (response.success) {
        setResult(response)
        if (response.errors.length === 0) {
          showToast(
            `${countOf(response.successCount, 'registro importado', 'registros importados')} correctamente.`,
            'success'
          )
        } else {
          showToast(
            `${countOf(response.successCount, 'importado')}, ${countOf(response.errors.length, 'error', 'errores')}.`,
            response.successCount > 0 ? 'success' : 'error'
          )
        }
      } else {
        showToast(response.error, 'error')
      }
    } catch {
      // Tiempo agotado, caída de red o error del servidor: la acción no
      // devolvió un resultado, así que parte del archivo pudo procesarse.
      showToast(
        'No se pudo completar la importación. Revisa los registros ya creados antes de volver a subir el archivo.',
        'error'
      )
    } finally {
      setLoading(false)
      resetInput()
    }
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
                  disabled={loading}
                  onClick={() => {
                    setActive(type)
                    setResult(null)
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition ${
                    active === type
                      ? 'bg-navy-800 text-white shadow-sm'
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {IMPORT_CONFIG[type].label}
                </button>
              ))}
            </div>
          )}

          <p className="text-sm text-gray-500 mb-2">
            Columnas esperadas:{' '}
            {config.columns
              .map((c) => (c.required ? c.header : `${c.header} (opcional)`))
              .join(', ')}
            .
          </p>
          <p className="text-sm text-gray-500 mb-5">
            Máximo {MAX_IMPORT_ROWS} filas por archivo. Descarga la plantilla para usar las listas
            desplegables con los datos activos del sistema.
          </p>

          <div className="flex flex-wrap gap-3 items-center mb-6">
            <button
              onClick={handleDownloadTemplate}
              disabled={downloading}
              className="px-4 py-2.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-100 transition"
            >
              {downloading ? 'Generando...' : 'Descargar plantilla'}
            </button>

            <label className="px-4 py-2.5 bg-navy-800 text-white rounded-xl text-sm font-bold hover:bg-navy-900 transition cursor-pointer">
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
                  {countOf(result.successCount, 'exitoso')}
                </span>
                {result.errors.length > 0 && (
                  <span className="px-3 py-1.5 bg-red-50 text-red-600 text-sm font-bold rounded-lg">
                    {countOf(result.errors.length, 'error', 'errores')}
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
