import type { ComponentChildren } from "preact";

export interface DisclosureProps {
  /** Always-visible content; rendered as a sibling of the toggle, never inside it. */
  summary: ComponentChildren;
  /** Collapsible content; unmounted entirely while collapsed. */
  children: ComponentChildren;
  expanded: boolean;
  onToggle: () => void;
  toggleLabel: string;
  regionId: string;
}

/**
 * Domain-agnostic collapse wrapper. Collapsed children are UNMOUNTED (not just
 * visually hidden) so their focusable controls never sit in the tab order.
 * Open/closed state is owned by the parent.
 */
export function Disclosure({
  summary,
  children,
  expanded,
  onToggle,
  toggleLabel,
  regionId,
}: DisclosureProps) {
  return (
    <div class="disclosure">
      <div class="disclosure-summary">{summary}</div>
      <button
        type="button"
        class="disclosure-toggle"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={onToggle}
      >
        {toggleLabel}
      </button>
      {expanded && (
        <div id={regionId} class="disclosure-region">
          {children}
        </div>
      )}
    </div>
  );
}
