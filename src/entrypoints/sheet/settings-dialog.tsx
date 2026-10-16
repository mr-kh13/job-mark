import { useId, useState, type ChangeEvent } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import type { Settings } from '@/hooks/use-settings';

type Props = { settings: Settings; onChange: (settings: Settings) => void };

/** A gear button that opens the settings. A change applies as soon as it is made. */
export function SettingsDialog({ settings, onChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const aiId = useId();

  const handleAiChange = (event: ChangeEvent<HTMLInputElement>) =>
    onChange({ isAiEnabled: event.target.checked });

  return (
    <>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Settings"
        onClick={() => setIsOpen(true)}
      >
        <SettingsIcon />
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>
          <Field orientation="horizontal">
            <input
              id={aiId}
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-primary"
              checked={settings.isAiEnabled}
              onChange={handleAiChange}
            />
            <FieldContent>
              <FieldLabel htmlFor={aiId}>Write the daily line with on-device AI</FieldLabel>
              <FieldDescription>
                Uses your browser's built-in AI, only when it is already on your device. Nothing
                leaves your device.
              </FieldDescription>
            </FieldContent>
          </Field>
        </DialogContent>
      </Dialog>
    </>
  );
}
