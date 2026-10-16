import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/utils/cn';

type Props = {
  value: string;
  /** The accessible name and the placeholder. */
  label: string;
  isMultiline?: boolean;
  className?: string;
  onCommit: (value: string) => void;
};

/** A text cell that saves when it loses focus. Enter saves a single line too. */
export function EditableText({ value, label, isMultiline, className, onCommit }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  const handleCommit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };

  if (isMultiline) {
    return (
      <Textarea
        aria-label={label}
        placeholder={label}
        value={draft ?? value}
        onFocus={() => setDraft(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleCommit}
        variant="ghost"
        className={cn(
          'field-sizing-fixed h-8 min-h-8 min-w-36 resize-none overflow-hidden py-[5px] leading-5 transition-[height]',
          draft !== null && 'h-28 overflow-auto bg-background dark:bg-input/30',
          className,
        )}
      />
    );
  }
  return (
    <Input
      aria-label={label}
      placeholder={label}
      value={draft ?? value}
      onFocus={() => setDraft(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleCommit}
      variant="ghost"
      className={cn('h-8 min-w-32 text-ellipsis', className)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}
