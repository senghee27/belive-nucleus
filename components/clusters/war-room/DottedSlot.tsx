/**
 * DottedSlot — empty-slot placeholder for the fixed-band war-room grid.
 *
 * Every column in the war-room wall reserves a fixed number of slots
 * per category (10 for Maintenance, 3 for each of the others). When a
 * category has fewer open rows than its limit, the unused slots
 * render this component instead of collapsing the band. Lee can then
 * scan row-by-row horizontally across all 11 clusters at a predictable
 * vertical position.
 *
 * Styling is intentionally weightless — dotted border, no text, ~38px
 * tall to match SituationRow — so dense columns stay visually louder
 * than sparse ones without breaking the grid.
 */

export function DottedSlot() {
  return (
    <div
      aria-hidden="true"
      className="mx-[6px] my-[3px] rounded border border-dashed border-[#1A2035]/50 pointer-events-none"
      style={{ height: 32 }}
    />
  )
}
