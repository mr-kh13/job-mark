import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/components/ui/toast';
import { logger } from '@/utils/logger';
import { reportFailure, writeOrReport } from './write-or-report';

afterEach(() => {
  vi.restoreAllMocks();
});

const spies = () => ({
  add: vi.spyOn(toast, 'add').mockReturnValue('toast-id'),
  warn: vi.spyOn(logger, 'warn').mockImplementation(() => {}),
});

describe('writeOrReport', () => {
  it('returns true and shows nothing when the write succeeds', async () => {
    const { add, warn } = spies();

    const isWritten = await writeOrReport(Promise.resolve('saved'), 'save the change');

    expect(isWritten).toBe(true);
    expect(add).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns false and reports the failure when the write fails', async () => {
    const { add } = spies();

    const isWritten = await writeOrReport(
      Promise.reject(new Error('disk gone')),
      'save the change',
    );

    expect(isWritten).toBe(false);
    expect(add).toHaveBeenCalledTimes(1);
  });
});

describe('reportFailure', () => {
  it('names what failed in a toast that stays until it is dismissed', () => {
    const { add } = spies();

    reportFailure('delete the job', new Error('disk gone'));

    expect(add).toHaveBeenCalledWith({
      title: "Couldn't delete the job",
      description: 'disk gone',
      type: 'error',
      timeout: 0,
    });
  });

  it('logs a warning with the error', () => {
    const { warn } = spies();
    const error = new Error('disk gone');

    reportFailure('delete the job', error);

    expect(warn).toHaveBeenCalledWith({ err: error }, 'Could not delete the job');
  });

  it('explains a full storage in plain words', () => {
    const { add } = spies();

    reportFailure('save the change', new Error('Resource::kQuotaBytes quota exceeded'));

    const [toastOptions] = add.mock.calls[0] ?? [];
    expect(toastOptions?.description).toMatch(/is full/i);
    expect(toastOptions?.description).not.toMatch(/kQuotaBytes/);
  });

  it('gives no description for something that is not an error', () => {
    const { add } = spies();

    reportFailure('save the change', 'oops');

    const [toastOptions] = add.mock.calls[0] ?? [];
    expect(toastOptions?.description).toBeUndefined();
  });
});
