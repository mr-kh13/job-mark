import { describe, expect, it } from 'vitest';
import { JOB_KEY_PREFIX, isJobKey, jobIdOf, jobKey } from './job-key';

describe('job keys', () => {
  it('puts a job id behind the job prefix', () => {
    expect(jobKey('seek:123')).toBe(`${JOB_KEY_PREFIX}seek:123`);
  });

  it.each(['seek:1', 'seek-nz:22', 'linkedin:333', 'manual:4f1c-9a'])(
    'reads the id "%s" back from its key',
    (id) => {
      expect(jobIdOf(jobKey(id))).toBe(id);
    },
  );

  it('recognizes the key of a job', () => {
    expect(isJobKey(jobKey('seek:1'))).toBe(true);
  });

  it.each(['lastBackupAt', 'jobs', 'job', 'jobs:seek:1', 'myjob:seek:1', 'settings'])(
    'does not take the key "%s" for a job',
    (key) => {
      expect(isJobKey(key)).toBe(false);
    },
  );
});
