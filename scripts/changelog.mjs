// Maintains the software change log workbook (docs/seguimiento/QR-Asist_Registro_de_Cambios_Software.xlsx).
//
// Usage:
//   node scripts/changelog.mjs pending
//       Lists commits merged to main that are not yet recorded in the workbook.
//   node scripts/changelog.mjs add --tipo "Corrección" --modulo "Asistencia" \
//       --desc "..." --ref "PR #42" [--fecha 2026-10-29] [--roles "..."] \
//       [--migraciones "035"] [--req "RF.."] [--estado "En producción"]
//       Appends one row to the workbook, keeping styles, validations and colors.
//   node scripts/changelog.mjs init [--force]
//       Rebuilds the workbook from scripts/changelog-backfill.json (the git history backfill).
//       Refuses to overwrite an existing workbook unless --force is passed.
//
// Every mode accepts --archivo <path> to work on an alternative workbook (useful for tests).
// Documentation-only commits (conventional type "docs") are intentionally never recorded.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import ExcelJS from 'exceljs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKBOOK_PATH = path.join(
  ROOT,
  'docs',
  'seguimiento',
  'QR-Asist_Registro_de_Cambios_Software.xlsx'
)
const BACKFILL_PATH = path.join(ROOT, 'scripts', 'changelog-backfill.json')
const BRANCH = 'main'
const IGNORED_COMMIT_TYPES = new Set(['docs'])

const LOG_SHEET = 'Registro de cambios'
const SUMMARY_SHEET = 'Resumen'
const GUIDE_SHEET = 'Guía'

const COLUMNS = [
  { key: 'id', header: 'ID', width: 9, center: true },
  { key: 'fecha', header: 'Fecha', width: 12, center: true },
  { key: 'tipo', header: 'Tipo', width: 18 },
  { key: 'modulo', header: 'Módulo', width: 26 },
  { key: 'descripcion', header: 'Descripción', width: 80 },
  { key: 'roles', header: 'Roles afectados', width: 24 },
  { key: 'ref', header: 'Referencia', width: 12, center: true },
  { key: 'migraciones', header: 'Migraciones BD', width: 16 },
  { key: 'req', header: 'Requisito o defecto', width: 22 },
  { key: 'estado', header: 'Estado', width: 16, center: true },
]
const COL = Object.fromEntries(COLUMNS.map((c, i) => [c.key, i + 1]))
const colLetter = (key) => String.fromCharCode(64 + COL[key])

const TIPOS = [
  'Funcionalidad',
  'Mejora',
  'Corrección',
  'Seguridad',
  'Rendimiento',
  'Base de datos',
  'Infraestructura y CI',
  'Pruebas',
  'Dependencias',
]
const MODULOS = [
  'Autenticación',
  'Sesión QR y escáner',
  'Asistencia',
  'Justificaciones',
  'Reportes',
  'Panel de coordinación',
  'Usuarios y roles',
  'Materias y matrículas',
  'Académico (carreras y períodos)',
  'Auditoría',
  'Portal del estudiante',
  'Portal del docente',
  'Interfaz',
  'Base de datos',
  'Infraestructura',
]
const ESTADOS = ['En producción', 'En revisión', 'En desarrollo']
const DEFAULT_ESTADO = 'En producción'

// Institutional dark navy (navy-900 in globals.css) and soft fills.
const NAVY = 'FF002849'
const ZEBRA = 'FFF3F6FA'
const BORDER = 'FFD0D7DE'
const TIPO_FILLS = {
  Corrección: 'FFFDE9B8',
  Seguridad: 'FFF8C9C9',
  Funcionalidad: 'FFCDEBD3',
  Mejora: 'FFCFE0F5',
  Rendimiento: 'FFE0D3F3',
}
const TIPO_FILL_DEFAULT = 'FFE3E5E8'

const DATE_FORMAT = 'dd/mm/yyyy'
// Validation ranges are pre-extended so rows typed by hand also get the drop-downs.
const VALIDATION_MIN_END_ROW = 1000

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

const validList = (list) => list.map((v) => `  - ${v}`).join('\n')

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''))
  if (!match) return null
  const [, y, m, d] = match.map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const valid =
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  return valid ? date : null
}

function todayLocal() {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

const excelSerial = (date) => date.getTime() / 86400000 + 25569

// ---------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------

// Returns a list of problems in Spanish; an empty list means the row is valid.
function validateRow(row) {
  const problems = []
  if (!TIPOS.includes(row.tipo)) {
    problems.push(`Tipo no válido: "${row.tipo ?? ''}". Valores permitidos:\n${validList(TIPOS)}`)
  }
  if (!MODULOS.includes(row.modulo)) {
    problems.push(
      `Módulo no válido: "${row.modulo ?? ''}". Valores permitidos:\n${validList(MODULOS)}`
    )
  }
  if (!ESTADOS.includes(row.estado)) {
    problems.push(
      `Estado no válido: "${row.estado ?? ''}". Valores permitidos:\n${validList(ESTADOS)}`
    )
  }
  if (!String(row.descripcion ?? '').trim()) problems.push('La descripción es obligatoria.')
  if (!String(row.ref ?? '').trim()) problems.push('La referencia es obligatoria (PR #NN o hash).')
  if (!(row.fecha instanceof Date)) problems.push('La fecha debe tener el formato AAAA-MM-DD.')
  return problems
}

// ---------------------------------------------------------------------------
// Workbook styling
// ---------------------------------------------------------------------------

const thinBorder = { style: 'thin', color: { argb: BORDER } }
const allBorders = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder }
const solidFill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

function styleHeaderCell(cell) {
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
  cell.fill = solidFill(NAVY)
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  cell.border = allBorders
}

// Static styling shared by `init` and `add`: zebra rows plus the soft color of the Tipo cell.
function styleDataRow(row, rowNumber) {
  const zebra = rowNumber % 2 === 1
  COLUMNS.forEach((column, i) => {
    const cell = row.getCell(i + 1)
    cell.font = { name: 'Calibri', size: 10 }
    cell.alignment = {
      vertical: 'top',
      horizontal: column.center ? 'center' : 'left',
      wrapText: true,
    }
    cell.border = allBorders
    if (zebra) cell.fill = solidFill(ZEBRA)
  })
  const tipoCell = row.getCell(COL.tipo)
  tipoCell.fill = solidFill(TIPO_FILLS[tipoCell.text] ?? TIPO_FILL_DEFAULT)
  row.getCell(COL.fecha).numFmt = DATE_FORMAT
  row.getCell(COL.migraciones).numFmt = '@'
}

function writeDataRow(ws, rowNumber, row) {
  const target = ws.getRow(rowNumber)
  for (const column of COLUMNS) {
    const value = row[column.key]
    target.getCell(COL[column.key]).value = value === '' || value === undefined ? null : value
  }
  styleDataRow(target, rowNumber)
  target.commit()
}

function applyValidations(ws, lastRow) {
  const endRow = Math.max(VALIDATION_MIN_END_ROW, lastRow + 500)
  const lists = [
    ['tipo', TIPOS, 'Tipo'],
    ['modulo', MODULOS, 'Módulo'],
    ['estado', ESTADOS, 'Estado'],
  ]
  // Drop any previous entry for these columns (exceljs expands ranges into one entry per cell
  // when loading a file) so overlapping validations never reach the saved workbook.
  for (const key of Object.keys(ws.dataValidations.model)) {
    if (lists.some(([col]) => new RegExp(`^${colLetter(col)}\\d+(:|$)`).test(key))) {
      delete ws.dataValidations.model[key]
    }
  }
  for (const [col, list, label] of lists) {
    const inline = list.join(',')
    // Excel limits an inline list to 255 characters.
    if (inline.length > 255) throw new Error(`La lista de ${label} supera los 255 caracteres.`)
    ws.dataValidations.add(`${colLetter(col)}2:${colLetter(col)}${endRow}`, {
      type: 'list',
      allowBlank: true,
      formulae: [`"${inline}"`],
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: `${label} no válido`,
      error: `Elige un valor de la lista desplegable de ${label}.`,
    })
  }
}

function setAutoFilter(ws, lastRow) {
  ws.autoFilter = `A1:${colLetter('estado')}${lastRow}`
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

function buildLogSheet(wb, rows) {
  const ws = wb.addWorksheet(LOG_SHEET, {
    views: [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }],
  })
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }))
  const header = ws.getRow(1)
  header.height = 30
  header.eachCell(styleHeaderCell)
  rows.forEach((row, i) => writeDataRow(ws, i + 2, row))
  setAutoFilter(ws, rows.length + 1)
  applyValidations(ws, rows.length + 1)
  return ws
}

// Writes (or rewrites in place) the summary sheet. Counts are COUNTIF formulas over whole
// columns, so they stay correct when rows are appended; cached results are filled in as well
// for viewers that do not recalculate.
function fillSummarySheet(ws, rows) {
  const logRef = (key) => `'${LOG_SHEET}'!${colLetter(key)}:${colLetter(key)}`
  ws.getColumn(1).width = 38
  ws.getColumn(2).width = 16
  ws.getColumn(3).width = 16

  const title = ws.getCell('A1')
  title.value = 'Resumen del registro de cambios de software'
  title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: NAVY } }

  const label = (cell, text) => {
    cell.value = text
    cell.font = { name: 'Calibri', size: 11, bold: true }
  }
  label(ws.getCell('A3'), 'Total de cambios registrados')
  ws.getCell('B3').value = {
    formula: `COUNTA(${logRef('id')})-1`,
    result: rows.length,
  }
  label(ws.getCell('A4'), 'Última fecha registrada')
  const dates = rows.map((r) => r.fecha.getTime())
  ws.getCell('B4').value = {
    formula: `MAX(${logRef('fecha')})`,
    result: dates.length ? excelSerial(new Date(Math.max(...dates))) : 0,
  }
  ws.getCell('B4').numFmt = DATE_FORMAT
  for (const addr of ['B3', 'B4']) {
    ws.getCell(addr).font = { name: 'Calibri', size: 11 }
    ws.getCell(addr).alignment = { horizontal: 'right' }
  }

  let r = 6
  const section = (heading, key, values) => {
    ;['A', 'B', 'C'].forEach((letter, i) => {
      const cell = ws.getCell(`${letter}${r}`)
      cell.value = [heading, 'Cantidad', '% del total'][i]
      styleHeaderCell(cell)
    })
    r += 1
    for (const value of values) {
      const count = rows.filter((row) => row[key] === value).length
      ws.getCell(`A${r}`).value = value
      ws.getCell(`B${r}`).value = {
        formula: `COUNTIF(${logRef(key)},A${r})`,
        result: count,
      }
      ws.getCell(`C${r}`).value = {
        formula: `IF($B$3=0,0,B${r}/$B$3)`,
        result: rows.length ? count / rows.length : 0,
      }
      ws.getCell(`C${r}`).numFmt = '0.0%'
      ;['A', 'B', 'C'].forEach((letter) => {
        const cell = ws.getCell(`${letter}${r}`)
        cell.font = { name: 'Calibri', size: 10 }
        cell.border = allBorders
        if (letter !== 'A') cell.alignment = { horizontal: 'right' }
        if (r % 2 === 0) cell.fill = solidFill(ZEBRA)
      })
      r += 1
    }
    r += 1
  }
  section('Por tipo', 'tipo', TIPOS)
  section('Por módulo', 'modulo', MODULOS)
  section('Por estado', 'estado', ESTADOS)
}

function buildGuideSheet(wb) {
  const ws = wb.addWorksheet(GUIDE_SHEET)
  ws.getColumn(1).width = 28
  ws.getColumn(2).width = 110

  const blocks = [
    ['title', 'Guía de uso del registro de cambios de software de QR-Asist'],
    ['section', 'Qué es esta hoja de cálculo'],
    [
      '',
      'Registra todos los cambios de software hechos a QR-Asist que ya están integrados en la rama main: funcionalidades, mejoras, correcciones, seguridad, rendimiento, migraciones de base de datos, infraestructura y CI, pruebas y actualizaciones de dependencias. Cada fila es un cambio (normalmente un pull request o un commit).',
    ],
    ['section', 'Qué no incluye'],
    [
      '',
      'Los cambios exclusivamente de documentación (manuales, presentaciones, informes y commits de tipo docs) no se registran aquí.',
    ],
    ['section', 'Significado de las columnas'],
    [
      'ID',
      'Identificador consecutivo del cambio (CH-001, CH-002, ...), del más antiguo al más reciente.',
    ],
    ['Fecha', 'Fecha en que el cambio quedó integrado en la rama main (formato dd/mm/aaaa).'],
    ['Tipo', 'Naturaleza del cambio. Debe elegirse de la lista de valores permitidos.'],
    [
      'Módulo',
      'Parte del sistema que se ve afectada. Debe elegirse de la lista de valores permitidos.',
    ],
    [
      'Descripción',
      'Explicación breve de qué cambió y por qué importa, escrita para el responsable del proyecto.',
    ],
    [
      'Roles afectados',
      'Quiénes notan el cambio: Estudiante, Docente, Coordinación, Todos o Sistema (cambio interno sin efecto visible).',
    ],
    [
      'Referencia',
      'Número del pull request (por ejemplo, PR #40) o hash corto del commit cuando no tiene pull request.',
    ],
    [
      'Migraciones BD',
      'Números de las migraciones de base de datos incluidas en el cambio (por ejemplo, 033, 034). Vacío si no hay.',
    ],
    [
      'Requisito o defecto',
      'Requisito funcional (RF..) o defecto de QA (DEF-QA-..) que el cambio atiende. Vacío si no aplica.',
    ],
    ['Estado', 'En producción, En revisión o En desarrollo.'],
    ['section', 'Valores permitidos'],
    ['Tipo', TIPOS.join(', ')],
    ['Módulo', MODULOS.join(', ')],
    ['Estado', ESTADOS.join(', ')],
    ['section', 'Cómo mantener actualizado el registro'],
    [
      '1. Ver pendientes',
      'Ejecutar npm run changelog:pending. Lista los commits integrados en main que todavía no están registrados (fecha, referencia y asunto). Ignora los de documentación.',
    ],
    [
      '2. Registrar un cambio',
      'Ejecutar npm run changelog:add -- --tipo "Corrección" --modulo "Asistencia" --desc "Texto en español" --ref "PR #42" [--fecha 2026-10-29] [--roles "Docente"] [--migraciones "035"] [--req "RF.."] [--estado "En producción"]. La fecha por defecto es hoy y el estado por defecto es En producción.',
    ],
    [
      '3. Cerrar Excel',
      'El libro debe estar cerrado en Excel al ejecutar el comando; de lo contrario el sistema no podrá guardarlo y lo avisará.',
    ],
    [
      '4. Reconstruir',
      'Si el archivo se perdiera, node scripts/changelog.mjs init lo reconstruye desde scripts/changelog-backfill.json (solo el histórico inicial; use --force para sobrescribir uno existente).',
    ],
  ]

  blocks.forEach(([kind, text], i) => {
    const row = ws.getRow(i + 1)
    const a = row.getCell(1)
    const b = row.getCell(2)
    if (kind === 'title') {
      a.value = text
      a.font = { name: 'Calibri', size: 14, bold: true, color: { argb: NAVY } }
      return
    }
    if (kind === 'section') {
      a.value = text
      ;[a, b].forEach((cell) => {
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = solidFill(NAVY)
      })
      return
    }
    a.value = kind || null
    b.value = text
    a.font = { name: 'Calibri', size: 10, bold: true }
    b.font = { name: 'Calibri', size: 10 }
    ;[a, b].forEach((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true }
    })
  })
  return ws
}

// ---------------------------------------------------------------------------
// Workbook I/O
// ---------------------------------------------------------------------------

async function saveWorkbook(wb, file) {
  wb.calcProperties = { fullCalcOnLoad: true }
  const tmp = `${file}.tmp`
  try {
    await wb.xlsx.writeFile(tmp)
    renameSync(tmp, file)
  } catch (err) {
    rmSync(tmp, { force: true })
    if (['EBUSY', 'EPERM', 'EACCES'].includes(err.code)) {
      fail(
        `No se pudo guardar "${file}". Probablemente el archivo está abierto en Excel: ciérralo e inténtalo de nuevo.`
      )
    }
    throw err
  }
}

async function loadWorkbook(file) {
  if (!existsSync(file)) {
    fail(
      `No existe el libro de cambios: ${file}\n` +
        'Puedes regenerarlo con: node scripts/changelog.mjs init'
    )
  }
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.readFile(file)
  } catch (err) {
    if (['EBUSY', 'EPERM', 'EACCES'].includes(err.code)) {
      fail(`No se pudo leer "${file}": está bloqueado por otro programa (¿abierto en Excel?).`)
    }
    throw err
  }
  const ws = wb.getWorksheet(LOG_SHEET)
  if (!ws) fail(`El libro no contiene la hoja "${LOG_SHEET}".`)
  return { wb, ws }
}

// Highest row that holds an ID (validation-only cells never count as data).
function lastDataRow(ws) {
  let last = 1
  for (let r = 2; r <= ws.rowCount; r += 1) {
    if (ws.getCell(r, COL.id).text.trim()) last = r
  }
  return last
}

function readRows(ws) {
  const rows = []
  for (let r = 2; r <= lastDataRow(ws); r += 1) {
    const fecha = ws.getCell(r, COL.fecha).value
    rows.push({
      id: ws.getCell(r, COL.id).text,
      fecha: fecha instanceof Date ? fecha : new Date(0),
      tipo: ws.getCell(r, COL.tipo).text,
      modulo: ws.getCell(r, COL.modulo).text,
      estado: ws.getCell(r, COL.estado).text,
    })
  }
  return rows
}

const formatId = (n) => `CH-${String(n).padStart(3, '0')}`

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

function readCommits() {
  let output
  try {
    output = execFileSync(
      'git',
      [
        '-C',
        ROOT,
        'log',
        BRANCH,
        '--no-merges',
        '--abbrev=7',
        '--format=%h|%ad|%s',
        '--date=short',
      ],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
    )
  } catch (err) {
    fail(`No se pudo leer el historial de git de la rama ${BRANCH}: ${err.message}`)
  }
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const first = line.indexOf('|')
      const second = line.indexOf('|', first + 1)
      const hash = line.slice(0, first)
      const subject = line.slice(second + 1)
      const prMatch = /\(#(\d+)\)\s*$/.exec(subject)
      const type = /^([a-z]+)(?:\([^)]*\))?!?:/i.exec(subject)?.[1]?.toLowerCase() ?? ''
      return {
        hash,
        date: line.slice(first + 1, second),
        subject,
        type,
        ref: prMatch ? `PR #${prMatch[1]}` : hash,
      }
    })
}

// Collects every PR number and commit hash already written in the Referencia column.
function recordedReferences(ws) {
  const prs = new Set()
  const hashes = new Set()
  for (let r = 2; r <= lastDataRow(ws); r += 1) {
    const text = ws.getCell(r, COL.ref).text
    for (const m of text.matchAll(/#(\d+)/g)) prs.add(`PR #${m[1]}`)
    for (const m of text.matchAll(/\b[0-9a-f]{7,40}\b/gi)) hashes.add(m[0].toLowerCase())
  }
  return { prs, hashes }
}

const isRecorded = (commit, { prs, hashes }) =>
  commit.ref.startsWith('PR #')
    ? prs.has(commit.ref)
    : [...hashes].some((h) => h.startsWith(commit.hash) || commit.hash.startsWith(h))

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

async function runPending(file) {
  const { ws } = await loadWorkbook(file)
  const recorded = recordedReferences(ws)
  const missing = readCommits()
    .filter((c) => !IGNORED_COMMIT_TYPES.has(c.type))
    .filter((c) => !isRecorded(c, recorded))
    .reverse()

  if (missing.length === 0) {
    console.log('Todo está registrado.')
    return
  }
  console.log(`Cambios integrados en ${BRANCH} sin registrar (${missing.length}):\n`)
  for (const c of missing) console.log(`  ${c.date}  ${c.ref.padEnd(9)}  ${c.subject}`)
  console.log(
    '\nRegístralos con: npm run changelog:add -- --tipo "..." --modulo "..." --desc "..." --ref "..."'
  )
}

async function runAdd(file, values) {
  const { wb, ws } = await loadWorkbook(file)

  let fecha = todayLocal()
  if (values.fecha !== undefined) {
    fecha = parseIsoDate(values.fecha)
    if (!fecha) fail(`Fecha no válida: "${values.fecha}". Usa el formato AAAA-MM-DD.`)
  }
  const row = {
    fecha,
    tipo: values.tipo,
    modulo: values.modulo,
    descripcion: values.desc?.trim(),
    roles: values.roles ?? '',
    ref: values.ref?.trim(),
    migraciones: values.migraciones ?? '',
    req: values.req ?? '',
    estado: values.estado ?? DEFAULT_ESTADO,
  }
  const problems = validateRow(row)
  if (problems.length > 0) fail(`No se registró el cambio:\n\n${problems.join('\n\n')}`)

  const last = lastDataRow(ws)
  let lastNumber = 0
  for (let r = 2; r <= last; r += 1) {
    const match = /^CH-(\d+)$/.exec(ws.getCell(r, COL.id).text.trim())
    if (match) lastNumber = Math.max(lastNumber, Number(match[1]))
  }
  row.id = formatId(lastNumber + 1)

  if (isRecorded({ ref: row.ref, hash: row.ref.toLowerCase() }, recordedReferences(ws))) {
    console.warn(`Aviso: la referencia "${row.ref}" ya estaba registrada en otra fila.`)
  }

  const next = last + 1
  writeDataRow(ws, next, row)
  setAutoFilter(ws, next)
  applyValidations(ws, next)
  const summary = wb.getWorksheet(SUMMARY_SHEET)
  if (summary) fillSummarySheet(summary, readRows(ws))
  await saveWorkbook(wb, file)
  console.log(`Registrado ${row.id} (${row.tipo} / ${row.modulo}) en la fila ${next}.`)
}

async function runInit(file, force) {
  if (existsSync(file) && !force) {
    fail(
      `Ya existe un libro en ${file}.\n` +
        'Para reconstruirlo desde cero usa --force (se perderán las filas agregadas con "add" que no estén en scripts/changelog-backfill.json).'
    )
  }
  if (!existsSync(BACKFILL_PATH)) fail(`No se encontró ${BACKFILL_PATH}.`)

  const rows = JSON.parse(readFileSync(BACKFILL_PATH, 'utf8')).map((raw, i) => ({
    ...raw,
    fecha: parseIsoDate(raw.fecha),
    estado: raw.estado || DEFAULT_ESTADO,
    roles: raw.roles ?? '',
    migraciones: raw.migraciones ?? '',
    req: raw.req ?? '',
    index: i,
  }))
  rows.forEach((row) => {
    const problems = validateRow({ ...row, ref: row.ref })
    if (problems.length > 0) {
      fail(`Fila ${row.index + 1} del archivo de histórico (${row.ref}):\n${problems.join('\n')}`)
    }
  })
  // Array.prototype.sort is stable, so rows of the same day keep their git order.
  rows.sort((a, b) => a.fecha - b.fecha)
  rows.forEach((row, i) => {
    row.id = formatId(i + 1)
  })

  const wb = new ExcelJS.Workbook()
  wb.creator = 'QR-Asist'
  wb.created = new Date()
  buildLogSheet(wb, rows)
  fillSummarySheet(wb.addWorksheet(SUMMARY_SHEET), rows)
  buildGuideSheet(wb)
  await saveWorkbook(wb, file)
  console.log(`Libro creado con ${rows.length} cambios: ${file}`)
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `Uso:
  node scripts/changelog.mjs pending
  node scripts/changelog.mjs add --tipo <tipo> --modulo <módulo> --desc <texto> --ref <ref> [opciones]
  node scripts/changelog.mjs init [--force]

Opciones de add: --fecha AAAA-MM-DD, --roles, --migraciones, --req, --estado
Opción común: --archivo <ruta> (libro alternativo, útil para pruebas)`

const mode = process.argv[2]
if (!['pending', 'add', 'init'].includes(mode)) fail(USAGE)

let values
try {
  ;({ values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      archivo: { type: 'string' },
      tipo: { type: 'string' },
      modulo: { type: 'string' },
      desc: { type: 'string' },
      ref: { type: 'string' },
      fecha: { type: 'string' },
      roles: { type: 'string' },
      migraciones: { type: 'string' },
      req: { type: 'string' },
      estado: { type: 'string' },
      force: { type: 'boolean' },
    },
    allowPositionals: false,
  }))
} catch (err) {
  fail(`Argumentos no válidos: ${err.message}\n\n${USAGE}`)
}

const file = values.archivo ? path.resolve(values.archivo) : WORKBOOK_PATH

if (mode === 'pending') await runPending(file)
else if (mode === 'add') await runAdd(file, values)
else await runInit(file, Boolean(values.force))
