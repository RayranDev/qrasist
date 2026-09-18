import React from 'react'

export function Skeleton({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`animate-pulse rounded-xl bg-gray-200/75 ${className}`} {...props} />
}
