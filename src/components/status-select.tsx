import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { STATUS_COLOURS } from '@/store/job-display';
import { STATUSES, type Status } from '@/store/job';
import { cn } from '@/utils/cn';

function StatusDot({ status }: { status: Status }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: STATUS_COLOURS[status] }}
    />
  );
}

type Props = {
  value: Status;
  onValueChange: (status: Status) => void;
  /** The accessible name, since the picker shows no visible label. */
  label: string;
  /** Lets a `<label htmlFor>` point at the picker. */
  id?: string;
  /** `ghost` blends into a table row until hovered or focused. */
  variant?: 'default' | 'ghost';
  className?: string;
};

/** A picker for a job's status. */
export function StatusSelect({
  value,
  onValueChange,
  label,
  id,
  variant = 'default',
  className,
}: Props) {
  return (
    <Select value={value} onValueChange={(next) => next && onValueChange(next as Status)}>
      <SelectTrigger
        id={id}
        size="sm"
        variant={variant}
        aria-label={label}
        className={cn('w-[154px] shrink-0', className)}
      >
        <SelectValue>
          {(current: Status) => (
            <>
              <StatusDot status={current} />
              {current}
            </>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            <StatusDot status={status} />
            {status}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
