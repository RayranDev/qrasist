'use client'

import React from 'react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = '',
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2'

    const variantStyles = {
      primary:
        'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm border border-emerald-700/20 focus-visible:ring-emerald-500',
      secondary:
        'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50/80 shadow-xs focus-visible:ring-gray-300',
      outline:
        'bg-transparent text-gray-700 border border-gray-200 hover:bg-gray-50 focus-visible:ring-gray-300',
      danger:
        'bg-red-600 text-white hover:bg-red-700 shadow-sm border border-red-700/20 focus-visible:ring-red-500',
      ghost:
        'bg-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100/70 border border-transparent focus-visible:ring-gray-300',
    }

    const sizeStyles = {
      sm: 'text-xs px-3 py-1.5 min-h-[36px] gap-1.5',
      md: 'text-sm px-4 py-2 min-h-[44px] gap-2',
      lg: 'text-base px-5 py-2.5 min-h-[48px] gap-2.5',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    )
  }
)

Button.displayName = 'Button'
