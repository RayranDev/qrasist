import { describe, it, expect } from 'vitest'
import { resolveReviewableSubjects } from './authGuards'
import { makeFakeDb } from '@/lib/enrollmentRequests/fakeDb'

const subjects = [
  { id: 's1', professor_id: 'prof-1' },
  { id: 's2', professor_id: 'prof-1' },
  { id: 's3', professor_id: 'prof-2' },
]

describe('resolveReviewableSubjects', () => {
  it('gives an active admin every subject without querying subjects', async () => {
    const { supabase, calls } = makeFakeDb({ caller: { role: 'ADMIN', is_active: true }, subjects })

    const result = await resolveReviewableSubjects(supabase, 'admin-1', ['s1', 's3', 's1'])

    expect([...result].sort()).toEqual(['s1', 's3'])
    expect(calls.some((c) => c.table === 'subjects')).toBe(false)
  })

  it('gives a professor only the subjects they teach, in one subjects query', async () => {
    const { supabase, calls } = makeFakeDb({
      caller: { role: 'PROFESSOR', is_active: true },
      subjects,
    })

    const result = await resolveReviewableSubjects(supabase, 'prof-1', ['s1', 's2', 's3'])

    expect([...result].sort()).toEqual(['s1', 's2'])
    expect(calls.filter((c) => c.table === 'subjects')).toHaveLength(1)
  })

  it('gives nothing to a deactivated account, even an admin', async () => {
    for (const role of ['ADMIN', 'PROFESSOR']) {
      const { supabase } = makeFakeDb({ caller: { role, is_active: false }, subjects })

      expect((await resolveReviewableSubjects(supabase, 'prof-1', ['s1'])).size).toBe(0)
    }
  })

  it('gives nothing when the caller has no profile', async () => {
    const { supabase } = makeFakeDb({ caller: null, subjects })

    expect((await resolveReviewableSubjects(supabase, 'ghost', ['s1'])).size).toBe(0)
  })

  it('does not query at all for an empty list', async () => {
    const { supabase, calls } = makeFakeDb({ subjects })

    expect((await resolveReviewableSubjects(supabase, 'admin-1', [])).size).toBe(0)
    expect(calls).toHaveLength(0)
  })
})
