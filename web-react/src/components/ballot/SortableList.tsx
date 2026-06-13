import type { ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  defaultAnimateLayoutChanges,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  type AnimateLayoutChanges,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

import { cn } from '@/lib/utils'

// Accessible drag-to-reorder list for the ranked ballot templates (A/D pure
// rankings, F/G score-sorted). Built on dnd-kit for first-class keyboard and
// screen-reader reordering — the Flutter ReorderableListView rendered to canvas
// and was effectively mouse-only. The drag affordance is a dedicated handle so
// score chips / other controls inside a row stay independently operable.

// Animate rows sliding when the list order changes — including programmatic
// re-sorts after a score change (BAL-17), not only during an active drag.
const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true })

export function SortableList({
  ids,
  onReorder,
  disabled,
  children,
}: {
  ids: string[]
  /** Called with the dragged id and the id it was dropped onto. */
  onReorder: (activeId: string, overId: string) => void
  disabled?: boolean
  children: ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over == null || active.id === over.id) return
    onReorder(String(active.id), String(over.id))
  }

  if (disabled) {
    return <div className="flex flex-col gap-2">{children}</div>
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">{children}</div>
      </SortableContext>
    </DndContext>
  )
}

export function SortableRow({
  id,
  disabled,
  children,
}: {
  id: string
  disabled?: boolean
  children: ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled, animateLayoutChanges })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-start gap-3 rounded-lg border border-border bg-card p-3',
        isDragging && 'z-10 opacity-80 shadow-lg',
      )}
    >
      {!disabled && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="mt-0.5 cursor-grab touch-none rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-5" />
        </button>
      )}
      <div className="flex-1">{children}</div>
    </div>
  )
}
