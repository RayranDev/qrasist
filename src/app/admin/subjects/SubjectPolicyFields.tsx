'use client'

import { useId } from 'react'
import {
  LATE_AFTER_RANGE,
  LATES_PER_ABSENCE_RANGE,
  MAX_ABSENCE_COUNT_RANGE,
  MAX_ABSENCE_PERCENTAGE_RANGE,
  MAX_CHANGE_REASON_LENGTH,
  MIN_CHANGE_REASON_LENGTH,
  type AbsenceRuleType,
  type GlobalPolicy,
} from '@/lib/settings/globalPolicy'
import { buildGlobalPolicySummary } from '@/lib/admin/policySummary'

const inputClass =
  'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-navy-600 focus:ring-2 focus:ring-navy-100 transition-all shadow-sm'

export type PolicyMode = 'global' | 'custom'

/** Estado del formulario de política de una materia (todo como texto, como en los inputs). */
export interface PolicyFormValue {
  mode: PolicyMode
  /** Vacío = sin seguimiento de tardanzas. */
  lateAfter: string
  latesPerAbsence: string
  ruleType: AbsenceRuleType
  percentage: string
  count: string
  reason: string
}

export function policyFormFromPolicy(mode: PolicyMode, policy: GlobalPolicy): PolicyFormValue {
  return {
    mode,
    lateAfter: policy.lateAfterMinutes === null ? '' : String(policy.lateAfterMinutes),
    latesPerAbsence: policy.latesPerAbsence === null ? '' : String(policy.latesPerAbsence),
    ruleType: policy.absenceRuleType,
    percentage: String(policy.maxAbsencePercentage),
    count: policy.maxAbsenceCount === null ? '' : String(policy.maxAbsenceCount),
    reason: '',
  }
}

/**
 * Política de una materia: "usar la global" (por defecto, valores en solo
 * lectura) o "personalizada" (campos propios). Los inputs llevan `name` para
 * que el formulario de creación los lea con FormData; el de edición usa el estado.
 * El motivo solo se pide cuando `reasonRequired` (hay un cambio que auditar).
 */
export function SubjectPolicyFields({
  value,
  onChange,
  globalPolicy,
  reasonRequired,
}: {
  value: PolicyFormValue
  onChange: (patch: Partial<PolicyFormValue>) => void
  globalPolicy: GlobalPolicy
  reasonRequired: boolean
}) {
  const custom = value.mode === 'custom'
  const uid = useId()

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Política de asistencia" className="space-y-2">
        <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
          <input
            type="radio"
            name="policy_mode"
            value="global"
            checked={!custom}
            onChange={() => onChange({ mode: 'global' })}
            className="mt-0.5 text-navy-700 focus:ring-navy-600"
          />
          <span>
            <span className="font-semibold text-gray-900">Usar política global</span> (recomendado):
            la materia sigue los cambios que coordinación haga a la política global.
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
          <input
            type="radio"
            name="policy_mode"
            value="custom"
            checked={custom}
            onChange={() => onChange({ mode: 'custom' })}
            className="mt-0.5 text-navy-700 focus:ring-navy-600"
          />
          <span>
            <span className="font-semibold text-gray-900">Política personalizada</span>: la materia
            usa sus propios valores y no cambia cuando cambia la global.
          </span>
        </label>
      </div>

      {!custom && (
        <p
          data-testid="inherited-policy"
          className="px-3 py-2 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-xl"
        >
          {buildGlobalPolicySummary(globalPolicy)}
        </p>
      )}

      {custom && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={`${uid}-rule`}
                className="block text-[11px] font-semibold text-gray-600 mb-1 ml-1"
              >
                Regla de faltas
              </label>
              <select
                id={`${uid}-rule`}
                name="absence_rule_type"
                value={value.ruleType}
                onChange={(e) => onChange({ ruleType: e.target.value as AbsenceRuleType })}
                className={`${inputClass} appearance-none cursor-pointer text-xs`}
              >
                <option value="PERCENTAGE">Porcentaje (%)</option>
                <option value="FIXED_COUNT">Cantidad fija de faltas</option>
              </select>
            </div>
            <div>
              <label
                htmlFor={`${uid}-limit`}
                className="block text-[11px] font-semibold text-gray-600 mb-1 ml-1"
              >
                {value.ruleType === 'PERCENTAGE'
                  ? 'Límite de faltas (%)'
                  : 'Límite de faltas (cantidad)'}
              </label>
              {value.ruleType === 'PERCENTAGE' ? (
                <input
                  id={`${uid}-limit`}
                  name="max_absence_percentage"
                  type="number"
                  value={value.percentage}
                  onChange={(e) => onChange({ percentage: e.target.value })}
                  min={MAX_ABSENCE_PERCENTAGE_RANGE.min}
                  max={MAX_ABSENCE_PERCENTAGE_RANGE.max}
                  className={`${inputClass} text-xs`}
                />
              ) : (
                <input
                  id={`${uid}-limit`}
                  name="max_absence_count"
                  type="number"
                  value={value.count}
                  onChange={(e) => onChange({ count: e.target.value })}
                  min={MAX_ABSENCE_COUNT_RANGE.min}
                  max={MAX_ABSENCE_COUNT_RANGE.max}
                  placeholder="Ej. 4"
                  className={`${inputClass} text-xs`}
                />
              )}
            </div>
            <div>
              <label
                htmlFor={`${uid}-late`}
                className="block text-[11px] font-semibold text-gray-600 mb-1 ml-1"
              >
                Tolerancia de tardanza (min)
              </label>
              <input
                id={`${uid}-late`}
                name="late_after_minutes"
                type="number"
                value={value.lateAfter}
                onChange={(e) => onChange({ lateAfter: e.target.value })}
                min={LATE_AFTER_RANGE.min}
                max={LATE_AFTER_RANGE.max}
                placeholder="Vacío = sin seguimiento"
                title="Minutos desde el inicio de la clase a partir de los cuales el escaneo cuenta como tarde. Vacío desactiva el seguimiento de tardanzas."
                className={`${inputClass} text-xs`}
              />
            </div>
            <div>
              <label
                htmlFor={`${uid}-lates`}
                className="block text-[11px] font-semibold text-gray-600 mb-1 ml-1"
              >
                Tardanzas por falta
              </label>
              <input
                id={`${uid}-lates`}
                name="lates_per_absence"
                type="number"
                value={value.latesPerAbsence}
                onChange={(e) => onChange({ latesPerAbsence: e.target.value })}
                min={LATES_PER_ABSENCE_RANGE.min}
                max={LATES_PER_ABSENCE_RANGE.max}
                placeholder="Ej. 3 (opcional)"
                title="Cada cuántas tardanzas se suma una inasistencia. Vacío = las tardanzas nunca se convierten en falta."
                className={`${inputClass} text-xs`}
              />
            </div>
          </div>
          {/* Con la regla por porcentaje el límite en cantidad no aplica y viceversa;
              se conserva el valor oculto para no perderlo al alternar la regla. */}
          {value.ruleType === 'PERCENTAGE' ? (
            <input type="hidden" name="max_absence_count" value={value.count} />
          ) : (
            <input type="hidden" name="max_absence_percentage" value={value.percentage} />
          )}
        </div>
      )}

      {reasonRequired && (
        <div className="space-y-1">
          <label
            htmlFor={`${uid}-reason`}
            className="block text-[11px] font-semibold text-gray-600 ml-1"
          >
            Motivo del cambio de política
          </label>
          <textarea
            id={`${uid}-reason`}
            name="policy_reason"
            value={value.reason}
            onChange={(e) => onChange({ reason: e.target.value })}
            rows={2}
            maxLength={MAX_CHANGE_REASON_LENGTH}
            placeholder="Ej. Acuerdo de la reunión de coordinación"
            className={`${inputClass} text-xs resize-none`}
          />
          <p className="text-[11px] text-gray-500 ml-1">
            Obligatorio (mínimo {MIN_CHANGE_REASON_LENGTH} caracteres). Queda registrado en la
            auditoría.
          </p>
        </div>
      )}
    </div>
  )
}
