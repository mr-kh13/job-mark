import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/cn';

// Select values are strings, so "no value" is the empty string.
const NOT_SET = '';

type Props<T extends string> = {
  options: readonly T[];
  value: T | undefined;
  onValueChange: (value: T | undefined) => void;
  /** The accessible name, since the picker shows no visible label. */
  label: string;
  /** Lets a `<label htmlFor>` point at the picker. */
  id?: string;
  /** `ghost` blends into a table row until hovered or focused. */
  variant?: 'default' | 'ghost';
  className?: string;
};

/** A picker for an optional field. It shows a dash when nothing is set; “Not set” clears it. */
export function OptionSelect<T extends string>({
  options,
  value,
  onValueChange,
  label,
  id,
  variant = 'default',
  className,
}: Props<T>) {
  const items = [{ value: NOT_SET, label: 'Not set' }].concat(
    options.map((option) => ({ value: option, label: option })),
  );
  return (
    <Select
      value={value ?? NOT_SET}
      items={items}
      onValueChange={(next) => onValueChange(next ? (next as T) : undefined)}
    >
      <SelectTrigger
        id={id}
        size="sm"
        variant={variant}
        aria-label={label}
        className={cn('w-full', !value && 'text-muted-foreground', className)}
      >
        <SelectValue>{(current: string) => current || '-'}</SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
