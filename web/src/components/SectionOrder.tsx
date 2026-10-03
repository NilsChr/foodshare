import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Link2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { categoryIcon, categoryName, groupMembers, sectionTitle } from '../lib/categories'
import { t, tn } from '../lib/i18n'
import { col, type Category } from '../lib/pb'

/** Sections that head their own block in the list (not shown under another one). */
function leadersOf(categories: Category[]) {
  return categories.filter((c) => !(c.group_with && categories.some((x) => x.id === c.group_with)))
}

/**
 * Drag-to-reorder store sections. Sections shown together move as one block.
 * With onEdit, each section (and grouped member) is tappable; without it, rows show the combined list header.
 */
export default function SectionOrder({ categories, onEdit }: { categories: Category[]; onEdit?: (c: Category) => void }) {
  const leaders = leadersOf(categories)
  const ids = leaders.map((c) => c.id)
  // Local order while the save round-trips, so the row doesn't jump back.
  const [pending, setPending] = useState<string[] | null>(null)
  const order = pending && pending.length === ids.length && pending.every((id) => ids.includes(id)) ? pending : ids

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)))
    setPending(next)
    // Renumber everything: each leader, then its members, so sort values stay unique.
    const sequence = next.flatMap((id) => {
      const leader = categories.find((c) => c.id === id)!
      return [leader, ...groupMembers(leader, categories)]
    })
    await Promise.all(sequence.map((c, i) => (c.sort === i ? null : col.categories().update(c.id, { sort: i }))))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="divide-y divide-line overflow-hidden rounded-3xl bg-card ring-1 ring-line">
          {order.map((id) => {
            const leader = categories.find((c) => c.id === id)
            if (!leader) return null
            const members = groupMembers(leader, categories)
            return (
              <SortableRow key={id} id={id}>
                {onEdit ? (
                  <div className="min-w-0 flex-1">
                    <SectionButton category={leader} onEdit={onEdit} grouped={members.length > 0} />
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center gap-1 pl-4">
                        <Link2 className="size-3.5 shrink-0 text-muted" aria-hidden />
                        <SectionButton category={m} onEdit={onEdit} grouped />
                      </div>
                    ))}
                  </div>
                ) : (
                  <SectionLabel category={leader} title={sectionTitle(leader, categories)} />
                )}
              </SortableRow>
            )
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-start gap-1 bg-card py-1.5 pr-3 ${isDragging ? 'relative z-10 shadow-xl ring-2 ring-brand' : ''}`}>
      <button ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={t('Drag to reorder')}
        className="flex h-12 w-10 shrink-0 cursor-grab touch-none items-center justify-center text-muted active:cursor-grabbing">
        <GripVertical className="size-5" />
      </button>
      {children}
    </div>
  )
}

function SectionLabel({ category, title }: { category: Category; title: string }) {
  const Icon = categoryIcon(category.icon)
  return (
    <span className="flex min-h-12 min-w-0 flex-1 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-soft"><Icon className="size-5" /></span>
      <span className="truncate font-bold">{title}</span>
    </span>
  )
}

function SectionButton({ category, onEdit, grouped }: { category: Category; onEdit: (c: Category) => void; grouped: boolean }) {
  const Icon = categoryIcon(category.icon)
  return (
    <button onClick={() => onEdit(category)} className="flex min-h-12 w-full min-w-0 items-center gap-3 py-1 text-left">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-soft"><Icon className="size-5" /></span>
      <span className="min-w-0">
        <span className="block truncate font-bold">{categoryName(category)}</span>
        <span className="block text-xs text-muted">
          {tn(category.keywords?.length ?? 0, '{n} keyword', '{n} keywords')}
          {grouped && <> · {t('Shown together')}</>}
        </span>
      </span>
    </button>
  )
}
