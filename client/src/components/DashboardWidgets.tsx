/**
 * DashboardWidgets — drag-to-reorder, show/hide overview widgets.
 *
 * Widgets are identified by a stable string key. The parent passes the
 * current ordered list and hidden set; this component handles the DnD
 * chrome and calls back on changes.
 */
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Eye, EyeOff } from "lucide-react";
import React from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WidgetDef {
  id: string;
  label: string;
  /** The actual widget content — rendered when not hidden */
  content: React.ReactNode;
}

interface Props {
  widgets: WidgetDef[];
  /** Ordered list of widget IDs (may be a subset of widgets) */
  order: string[];
  /** Set of hidden widget IDs */
  hidden: Set<string>;
  /** Whether the user is in "edit layout" mode */
  editMode: boolean;
  onOrderChange: (newOrder: string[]) => void;
  onToggleHidden: (id: string) => void;
}

// ─── Sortable Widget Shell ───────────────────────────────────────────────────

function SortableWidget({
  id,
  label,
  content,
  hidden,
  editMode,
  onToggle,
}: {
  id: string;
  label: string;
  content: React.ReactNode;
  hidden: boolean;
  editMode: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={`relative ${hidden && !editMode ? "hidden" : ""}`}>
      {/* Edit-mode overlay bar */}
      {editMode && (
        <div className="flex items-center gap-2 mb-1 px-1">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-sage/50 hover:text-sage transition-colors p-0.5"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <span className="font-bebas text-xs tracking-widest text-sage/70 flex-1">{label}</span>
          {/* Show/hide toggle */}
          <button
            onClick={onToggle}
            className={`flex items-center gap-1 font-bebas text-xs tracking-widest px-2 py-0.5 border transition-colors ${
              hidden
                ? "border-sage/30 text-sage/50 hover:border-sage hover:text-sage"
                : "border-forest/30 text-forest hover:border-tomato hover:text-tomato"
            }`}
            title={hidden ? "Show widget" : "Hide widget"}
          >
            {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {hidden ? "HIDDEN" : "VISIBLE"}
          </button>
        </div>
      )}
      {/* Widget content — always rendered so hooks stay stable */}
      <div className={hidden ? "opacity-30 pointer-events-none" : ""}>
        {content}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function DashboardWidgets({
  widgets,
  order,
  hidden,
  editMode,
  onOrderChange,
  onToggleHidden,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Build a stable ordered list — include any widget not yet in order at the end
  const allIds = widgets.map((w) => w.id);
  const orderedIds = [
    ...order.filter((id) => allIds.includes(id)),
    ...allIds.filter((id) => !order.includes(id)),
  ];

  const widgetMap = Object.fromEntries(widgets.map((w) => [w.id, w]));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = orderedIds.indexOf(active.id as string);
      const newIndex = orderedIds.indexOf(over.id as string);
      onOrderChange(arrayMove(orderedIds, oldIndex, newIndex));
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-6">
          {orderedIds.map((id) => {
            const w = widgetMap[id];
            if (!w) return null;
            return (
              <SortableWidget
                key={id}
                id={id}
                label={w.label}
                content={w.content}
                hidden={hidden.has(id)}
                editMode={editMode}
                onToggle={() => onToggleHidden(id)}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
