import { useEffect, useState } from 'react'
import type { RecordModel, RecordService } from 'pocketbase'

/**
 * Loads every record of a collection in a space and keeps it in sync via PocketBase realtime.
 * Re-fetches on reconnect so changes missed while offline are picked up.
 */
export function useLiveRecords<T extends RecordModel>(
  service: () => RecordService<T>,
  spaceId: string | undefined,
  sort = 'created',
) {
  const [records, setRecords] = useState<T[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!spaceId) return
    let alive = true
    const filter = `space = "${spaceId}"`
    const load = () =>
      service()
        .getFullList({ filter, sort })
        .then((r) => alive && setRecords(r))
        .finally(() => alive && setLoading(false))

    setLoading(true)
    setRecords([])
    load()
    const unsubscribe = service().subscribe(
      '*',
      (e) => {
        setRecords((prev) => {
          const rest = prev.filter((r) => r.id !== e.record.id)
          return e.action === 'delete' ? rest : [...rest, e.record]
        })
      },
      { filter },
    )
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', load)
    return () => {
      alive = false
      unsubscribe.then((u) => u())
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', load)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, sort])

  // Apply a change locally before the server echoes it back.
  const patch = (record: T) =>
    setRecords((prev) => (prev.some((r) => r.id === record.id) ? prev.map((r) => (r.id === record.id ? record : r)) : [...prev, record]))
  const remove = (id: string) => setRecords((prev) => prev.filter((r) => r.id !== id))

  return { records, loading, patch, remove }
}
