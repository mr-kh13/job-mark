import { describe, expect, it } from 'vitest';
import { isWebLink, normalizeUrl, parseUrl } from './url';

describe('isWebLink', () => {
  it.each([
    'http://example.com/job',
    'https://www.seek.com.au/job/1?ref=search#top',
    'http://localhost/job/1',
    'http://intranet/jobs/1',
    'HTTPS://EXAMPLE.COM/JOB',
  ])('accepts %s', (value) => {
    expect(isWebLink(value)).toBe(true);
  });

  it.each([
    '',
    'javascript:alert(1)',
    'data:text/html,hi',
    'ftp://example.com/job',
    'file:///etc/passwd',
    'example.com/job',
    '//example.com/job',
    'not a url',
  ])('rejects %j', (value) => {
    expect(isWebLink(value)).toBe(false);
  });
});

describe('parseUrl', () => {
  it('parses an absolute URL and resolves a relative one against a base', () => {
    expect(parseUrl('https://acme.com/jobs/1')?.href).toBe('https://acme.com/jobs/1');
    expect(parseUrl('/jobs/2', 'https://acme.com/careers')?.href).toBe('https://acme.com/jobs/2');
  });

  it('returns undefined for text that is not a URL', () => {
    expect(parseUrl('not a url')).toBeUndefined();
    expect(parseUrl('')).toBeUndefined();
  });
});

describe('normalizeUrl', () => {
  it('drops the hash, tracking parameters and trailing slash, and keeps real parameters', () => {
    expect(normalizeUrl('https://Careers.Acme.com/jobs/42/?utm_source=x&id=7&gclid=1#apply')).toBe(
      'https://careers.acme.com/jobs/42?id=7',
    );
  });

  it.each(['utm_source', 'UTM_Medium', 'gclid', 'fbclid', 'msclkid', 'mc_cid', '_hsenc'])(
    'drops the %s parameter',
    (param) => {
      expect(normalizeUrl(`https://acme.com/j?id=7&${param}=x`)).toBe('https://acme.com/j?id=7');
    },
  );

  it('keeps parameters that only resemble tracking ones, in their original order', () => {
    expect(normalizeUrl('https://acme.com/j?b=2&gclid2=1&autm_x=3&mc=4&a=1')).toBe(
      'https://acme.com/j?b=2&gclid2=1&autm_x=3&mc=4&a=1',
    );
  });

  it('keeps a port that is not the default', () => {
    expect(normalizeUrl('https://acme.com:8443/j/?utm_source=x')).toBe('https://acme.com:8443/j');
  });

  it('keeps the root path and collapses repeated trailing slashes elsewhere', () => {
    expect(normalizeUrl('https://acme.com/')).toBe('https://acme.com/');
    expect(normalizeUrl('https://acme.com/jobs/42//')).toBe('https://acme.com/jobs/42');
  });

  it('returns text that is not a URL trimmed', () => {
    expect(normalizeUrl('  not a url ')).toBe('not a url');
  });
});
