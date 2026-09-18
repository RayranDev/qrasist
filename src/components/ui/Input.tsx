'use client'

import React from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  leftElement?: React.ReactNode
  rightElement?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, helperText, leftElement, rightElement, id, ...props }, ref) => {
    const generatedId = React.useId()
    const inputId = id || generatedId

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-gray-700 tracking-wide"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftElement && (
            <div className="absolute left-3.5 flex items-center pointer-events-none text-gray-400">
              {leftElement}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm font-medium text-gray-900 placeholder:text-gray-400 transition-all duration-150 focus:outline-none min-h-[44px] ${
              leftElement ? 'pl-10' : ''
            } ${rightElement ? 'pr-10' : ''} ${
              error
                ? 'border-red-300 bg-red-50/20 text-red-900 focus:border-red-500 focus:ring-2 focus:ring-red-200'
                : 'border-gray-200 hover:border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100'
            } disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed ${className}`}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3.5 flex items-center text-gray-400">{rightElement}</div>
          )}
        </div>
        {error ? (
          <p className="text-xs font-medium text-red-600 animate-in fade-in duration-150">
            {error}
          </p>
        ) : helperText ? (
          <p className="text-xs text-gray-500">{helperText}</p>
        ) : null}
      </div>
    )
  }
)

Input.displayName = 'Input'
