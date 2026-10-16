import { describe, expect, it } from 'vitest';
import { refFromUrl } from './job-ref';

describe('refFromUrl', () => {
  it('gives a Seek page the same id and link as the click listener', () => {
    expect(refFromUrl('https://au.seek.com/job/123?ref=x', 'u')).toEqual({
      id: 'seek:123',
      source: 'seek',
      url: 'https://au.seek.com/job/123',
    });
    expect(refFromUrl('https://nz.seek.com/search?jobId=9', 'u')).toEqual({
      id: 'seek-nz:9',
      source: 'seek',
      url: 'https://nz.seek.com/job/9',
    });
  });

  it('gives a LinkedIn page the same id and link as the click listener', () => {
    expect(refFromUrl('https://www.linkedin.com/jobs/view/55/?trk=x', 'u')).toEqual({
      id: 'linkedin:55',
      source: 'linkedin',
      url: 'https://www.linkedin.com/jobs/view/55/',
    });
    const search = 'https://www.linkedin.com/jobs/search-results/?currentJobId=77&x=1';
    expect(refFromUrl(search, 'u').id).toBe('linkedin:77');
  });

  it('makes a manual id and a cleaned-up link for any other page', () => {
    expect(refFromUrl('https://careers.acme.com/jobs/42?utm_source=x#apply', 'abc')).toEqual({
      id: 'manual:abc',
      source: 'other',
      url: 'https://careers.acme.com/jobs/42',
    });
  });

  it('makes a manual id for job-site pages that show no single job', () => {
    expect(refFromUrl('https://au.seek.com/software-engineer-jobs', 'abc').id).toBe('manual:abc');
    expect(refFromUrl('https://www.linkedin.com/feed/', 'abc').id).toBe('manual:abc');
  });

  it('makes a manual id for text that is not a URL', () => {
    expect(refFromUrl(' not a url ', 'abc')).toEqual({
      id: 'manual:abc',
      source: 'other',
      url: 'not a url',
    });
  });
});
