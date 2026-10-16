import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Job } from '@/store/job';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/format-date';
import { summarize } from '@/store/job-stats';
import { useWrittenLine } from './generated-line';
import { chooseMessage, weekBand } from './messages';

type Props = { jobs: readonly Job[]; isAiEnabled: boolean; className?: string };

// Balanced lines keep a long line from leaving one word alone on its last row.
const LINE_CLASS = 'text-center text-balance text-muted-foreground';

const AI_NOTE = "Written by your browser's on-device AI. Turn it off in the sheet's Settings.";

/** A small info icon after a line the model wrote. Its tooltip says so. */
function AiNote() {
  return (
    <Tooltip>
      <TooltipTrigger
        delay={200}
        aria-label="About this line"
        className="ml-1 inline-flex size-4 items-center justify-center rounded-full align-text-bottom text-muted-foreground/60 outline-none transition-colors hover:text-muted-foreground focus-visible:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Info className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>{AI_NOTE}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A short warm line for today. It waits for the on-device model to write the line, then shows
 * that line, or a fixed one if the model has none.
 *
 * While it waits it holds the place of one line. A soft bar fades in there only if the wait
 * lasts, so a quick answer never flashes it.
 */
export function Inspiration({ jobs, isAiEnabled, className }: Props) {
  const stats = summarize(jobs);
  const day = formatDate(new Date(), 'yyyy-MM-dd');
  const { isWaiting, line } = useWrittenLine(day, weekBand(stats), isAiEnabled);

  if (isWaiting) {
    return (
      <p
        data-slot="inspiration"
        aria-hidden
        className={cn(
          LINE_CLASS,
          'animate-in fill-mode-backwards delay-500 duration-500 fade-in',
          className,
        )}
      >
        <span className="inline-block h-3 w-48 max-w-full rounded-full bg-muted-foreground/20 align-middle motion-safe:animate-pulse">
          &nbsp;
        </span>
      </p>
    );
  }
  return (
    <p data-slot="inspiration" className={cn(LINE_CLASS, className)}>
      {line ?? chooseMessage(stats, day)}
      {line !== undefined && <AiNote />}
    </p>
  );
}
