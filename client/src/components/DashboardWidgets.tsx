/**
 * DashboardWidgets — drag-to-reorder, show/hide, and resize overview widgets.
 *
 * Widgets are identified by a stable string key. The parent passes the
 * current ordered list, hidden set, and size map; this component handles
 * the DnD chrome and calls back on changes.
 *
 * Layout: two-column grid. Widgets with size "full" span both columns.
 * Widgets with size "half" (default) take one column.
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
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Eye, EyeOff, Maximize2, Minimize2, LayoutGrid } from "lucide-react";
import React from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

export type WidgetSize = "half" | "full";

export interface WidgetDef {
  id: string;
  label: string;
  /** The actual widget content — rendered when not hidden */
  content: React.ReactNode;
  /** Default size if not in widgetSizes map */
  defaultSize?: WidgetSize;
}

interface Props {
  widgets: WidgetDef[];
  /** Ordered list of widget IDs (may be a subset of widgets) */
  order: string[];
  /** Set of hidden widget IDs */
  hidden: Set<string>;
  /** Map of widget ID to size */
  sizes?: Record<string, WidgetSize>;
  /** Whether the user is in "edit layout" mode */
  editMode: boolean;
  onOrderChange: (newOrder: string[]) => void;
  onToggleHidden: (id: string) => void;
  onToggleSize?: (id: string) => void;
}

// ─── Sortable Widget Shell ───────────────────────────────────────────────────

function SortableWidget({
  id,
  label,
  content,
  hidden,
  editMode,
  size,
  onToggle,
  onToggleSize,
}: {
  id: string;
  label: string;
  content: React.ReactNode;
  hidden: boolean;
  editMode: boolean;
  size: WidgetSize;
  onToggle: () => void;
  onToggleSize?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
    gridColumn: size === "full" ? "1 / -1" : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={`relative ${hidden && !editMode ? "hidden" : ""}`}>
      {/* Edit-mode overlay bar */}
      {editMode && (
        <div className="flex items-center gap-2 mb-1.5 px-1 py-1 bg-gold/10 border border-gold/20">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-sage/60 hover:text-sage transition-colors p-0.5 flex-shrink-0"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <span className="font-bebas text-xs tracking-widest text-sage/80 flex-1">{label}</span>

          {/* Size toggle */}
          {onToggleSize && (
            <button
              onClick={onToggleSize}
              className={`flex items-center gap-1 font-bebas text-xs tracking-widest px-2 py-0.5 border transition-colors ${
                size === "full"
                  ? "border-forest/40 text-forest bg-forest/5 hover:border-forest/70"
                  : "border-sage/30 text-sage/60 hover:border-sage hover:text-sage"
              }`}
              title={size === "full" ? "Switch to half width" : "Switch to full width"}
            >
              {size === "full" ? (
                <><Minimize2 className="w-3 h-3" /> HALF</>
              ) : (
                <><Maximize2 className="w-3 h-3" /> FULL</>
              )}
            </button>
          )}

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
  sizes = {},
  editMode,
  onOrderChange,
  onToggleHidden,
  onToggleSize,
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
      <SortableContext items={orderedIds} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {orderedIds.map((id) => {
            const w = widgetMap[id];
            if (!w) return null;
            const size: WidgetSize = sizes[id] ?? w.defaultSize ?? "half";
            return (
              <SortableWidget
                key={id}
                id={id}
                label={w.label}
                content={w.content}
                hidden={hidden.has(id)}
                editMode={editMode}
                size={size}
                onToggle={() => onToggleHidden(id)}
                onToggleSize={onToggleSize ? () => onToggleSize(id) : undefined}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
