import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AdminError from './error'

describe('AdminError', () => {
  it('logs the error, explains the failure and retries on click', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const retry = vi.fn()
    const error = new Error('boom')

    render(<AdminError error={error} retry={retry} />)

    expect(screen.getByRole('alert').textContent).toMatch(/No pudimos cargar esta página/)
    expect(spy).toHaveBeenCalledWith(expect.any(String), error)

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(retry).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})
