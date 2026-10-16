import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { cn } from '@/utils/cn';

const Tooltip = TooltipPrimitive.Root;

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  side = 'top',
  sideOffset = 6,
  align = 'center',
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, 'side' | 'sideOffset' | 'align'>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            'max-w-64 rounded-md bg-foreground px-3 py-1.5 text-xs leading-snug text-balance text-background shadow-md data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fill-mode-forwards data-closed:fade-out-0',
            className,
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent };
