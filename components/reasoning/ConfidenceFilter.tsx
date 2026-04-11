'use client'

interface Option {
  value: string
  label: string
}

interface PillFilterProps {
  label: string
  value: string
  options: Option[]
  onChange: (next: string) => void
}

export function PillFilter({ label, value, options, onChange }: PillFilterProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[9px] uppercase tracking-wider text-[#4B5A7A]">{label}</span>
      {options.map(o => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
              active
                ? 'border-[#F2784B] bg-[#F2784B]/10 text-[#F2784B]'
                : 'border-[#1A2035] text-[#8A9BB8] hover:border-[#2A3550] hover:text-[#D4DAEA]'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
