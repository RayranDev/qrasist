import '@testing-library/jest-dom/vitest'

// pdfjs-dist (solo se usa en tests, para extraer texto de los PDF
// generados) requiere Node >= 22 por Promise.withResolvers. El CI corre
// con Node 20, asi que se agrega el polyfill estandar aca. Produccion no
// usa pdfjs-dist.
if (typeof Promise.withResolvers !== 'function') {
  Object.defineProperty(Promise, 'withResolvers', {
    configurable: true,
    writable: true,
    value: function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void
      let reject!: (reason?: unknown) => void
      const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    },
  })
}
