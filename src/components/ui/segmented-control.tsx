import { cn } from "../../lib/utils";

interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Labels the group for screen readers, e.g. "Commute direction". */
  label: string;
  className?: string;
}

/**
 * Compact two-or-three-way switch used for commute direction. Sized to sit in a
 * card header row without competing with the title.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, label, className }: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn("flex gap-1 rounded-lg bg-muted p-[3px]", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            option.value === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
