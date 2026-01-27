type FilterSelectProps = {
  label: string;
  options: readonly string[];
  value: number;
  onChange: (index: number) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  renderLabel?: (option: string) => string;
};

export function FilterSelect({
  label,
  options,
  value,
  onChange,
  disabled,
  className = "",
  id,
  renderLabel,
}: FilterSelectProps) {
  const isDisabled = disabled || options.length <= 1;
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-label-text mb-1">
        {label}
      </label>
      <select
        id={id}
        className="w-full bg-surface-muted text-foreground border border-border rounded-xl px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={isDisabled}
      >
        {options.map((option, idx) => (
          <option key={option} value={idx}>
            {renderLabel ? renderLabel(option) : option}
          </option>
        ))}
      </select>
    </div>
  );
}
