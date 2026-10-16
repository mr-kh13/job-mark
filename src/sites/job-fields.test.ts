import { beforeEach, describe, expect, it } from 'vitest';
import {
  extractJsonLd,
  extractJsonLdFromTexts,
  extractPageTitle,
  mergeExtracted,
  parseWorkType,
  pickTitle,
  splitPageTitle,
} from './job-fields';

const ldBlock = (data: unknown) =>
  `<script type="application/ld+json">${typeof data === 'string' ? data : JSON.stringify(data)}</script>`;

const pageWithBlocks = (...blocks: unknown[]) => {
  document.head.innerHTML = blocks.map(ldBlock).join('');
  return document;
};

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('extractJsonLd', () => {
  it('reads a JobPosting', () => {
    const doc = pageWithBlocks({
      '@type': 'JobPosting',
      title: 'Data Engineer',
      hiringOrganization: { name: 'Acme' },
      jobLocation: { address: { addressLocality: 'Sydney', addressRegion: 'NSW' } },
      employmentType: 'FULL_TIME',
    });

    expect(extractJsonLd(doc)).toEqual({
      title: 'Data Engineer',
      company: 'Acme',
      location: 'Sydney, NSW',
      workType: 'FULL_TIME',
    });
  });

  it('finds a JobPosting inside @graph, skipping other blocks and bad JSON', () => {
    const doc = pageWithBlocks('{not json', {
      '@graph': [{ '@type': 'WebSite' }, { '@type': 'JobPosting', title: 'QA' }],
    });

    expect(extractJsonLd(doc)).toEqual({ title: 'QA' });
  });

  it('finds a JobPosting in a top-level array and in a type list', () => {
    const doc = pageWithBlocks([
      { '@type': 'WebSite' },
      { '@type': ['Thing', 'JobPosting'], title: 'SRE' },
    ]);

    expect(extractJsonLd(doc)).toEqual({ title: 'SRE' });
  });

  it('uses the first JobPosting on the page', () => {
    const doc = pageWithBlocks(
      { '@type': 'JobPosting', title: 'First' },
      { '@type': 'JobPosting', title: 'Second' },
    );

    expect(extractJsonLd(doc).title).toBe('First');
  });

  it('reads the first place when jobLocation is a list, and a lone locality', () => {
    const doc = pageWithBlocks({
      '@type': 'JobPosting',
      jobLocation: [
        { address: { addressLocality: 'Perth' } },
        { address: { addressLocality: 'Hobart' } },
      ],
    });

    expect(extractJsonLd(doc)).toEqual({ location: 'Perth' });
  });

  it('cleans up text and leaves out fields that are blank or not strings', () => {
    const doc = pageWithBlocks({
      '@type': 'JobPosting',
      title: '  Data \n  Engineer ',
      hiringOrganization: { name: 42 },
      jobLocation: { address: { addressLocality: '   ' } },
      employmentType: ['FULL_TIME'],
    });

    expect(extractJsonLd(doc)).toEqual({ title: 'Data Engineer' });
  });

  it('returns nothing when there is no JobPosting', () => {
    expect(extractJsonLd(pageWithBlocks({ '@type': 'WebSite' }))).toEqual({});
    expect(extractJsonLd(pageWithBlocks())).toEqual({});
  });
});

describe('extractJsonLdFromTexts', () => {
  it('reads a JobPosting from raw script texts', () => {
    const posting = JSON.stringify({
      '@type': 'JobPosting',
      title: 'Data Engineer',
      hiringOrganization: { name: 'Acme' },
      employmentType: 'FULL_TIME',
    });

    expect(extractJsonLdFromTexts(['{not json', '', posting])).toEqual({
      title: 'Data Engineer',
      company: 'Acme',
      workType: 'FULL_TIME',
    });
  });

  it('returns nothing when no text holds a JobPosting', () => {
    expect(extractJsonLdFromTexts([JSON.stringify({ '@type': 'WebSite' }), 'null'])).toEqual({});
    expect(extractJsonLdFromTexts([])).toEqual({});
  });
});

describe('pickTitle', () => {
  it('takes the first non-blank of h1, og:title and the document title, cleaned up', () => {
    expect(pickTitle(' Site   Engineer ', 'OG', 'Tab')).toBe('Site Engineer');
    expect(pickTitle('  ', ' OG   title ', 'Tab')).toBe('OG title');
    expect(pickTitle('', '', ' Tab \n title ')).toBe('Tab title');
  });

  it('returns an empty string when all three are blank', () => {
    expect(pickTitle('', ' ', '\n')).toBe('');
  });
});

describe('extractPageTitle', () => {
  const setTitles = (over: { h1?: string; og?: string; title?: string }) => {
    document.head.innerHTML = over.og ? `<meta property="og:title" content="${over.og}">` : '';
    document.title = over.title ?? '';
    document.body.innerHTML = over.h1 ? `<h1>${over.h1}</h1>` : '';
  };

  it('prefers the first h1', () => {
    setTitles({ h1: ' Site   Reliability Engineer ', og: 'OG title', title: 'Tab title' });

    expect(extractPageTitle(document)).toEqual({ title: 'Site Reliability Engineer' });
  });

  it('falls back to og:title, then to the document title', () => {
    setTitles({ og: 'OG title', title: 'Tab title' });
    expect(extractPageTitle(document)).toEqual({ title: 'OG title' });

    setTitles({ title: 'Tab title' });
    expect(extractPageTitle(document)).toEqual({ title: 'Tab title' });
  });

  it('returns nothing when the page has no title at all', () => {
    setTitles({});

    expect(extractPageTitle(document)).toEqual({});
  });
});

describe('mergeExtracted', () => {
  it('takes the first non-empty value for each field, in the order given', () => {
    const merged = mergeExtracted(
      { title: '', company: 'Acme', salary: '$100k' },
      { title: 'Engineer', company: 'Other', location: 'Sydney', workType: 'Hybrid' },
    );

    expect(merged).toEqual({
      title: 'Engineer',
      company: 'Acme',
      location: 'Sydney',
      workType: 'Hybrid',
      salary: '$100k',
    });
  });

  it('leaves missing title, company and location as empty strings', () => {
    const merged = mergeExtracted({}, {});

    expect(merged).toEqual({
      title: '',
      company: '',
      location: '',
      workType: undefined,
      salary: undefined,
    });
  });
});

describe('parseWorkType', () => {
  it.each([
    ['Hybrid, Full-time', 'Hybrid', 'Full-time'],
    ['Remote', 'Remote', undefined],
    ['Work from home', 'Remote', undefined],
    ['WFH', 'Remote', undefined],
    ['On-site', 'On-site', undefined],
    ['onsite', 'On-site', undefined],
    ['In office', 'On-site', undefined],
    ['PART_TIME', undefined, 'Part-time'],
    ['Part time', undefined, 'Part-time'],
    ['FULL_TIME', undefined, 'Full-time'],
    ['Contract/Temp', undefined, 'Contract'],
    ['CONTRACTOR', undefined, 'Contract'],
    ['TEMPORARY', undefined, 'Contract'],
    ['Casual', undefined, 'Casual'],
    ['INTERN', undefined, 'Internship'],
  ])('reads "%s" as %s / %s', (text, workArrangement, employmentType) => {
    expect(parseWorkType(text)).toEqual({ workArrangement, employmentType });
  });

  it('returns nothing for empty, missing or unrecognised text', () => {
    const nothing = { workArrangement: undefined, employmentType: undefined };
    expect(parseWorkType(undefined)).toEqual(nothing);
    expect(parseWorkType('')).toEqual(nothing);
    expect(parseWorkType('Volunteer')).toEqual(nothing);
  });
});

describe('splitPageTitle', () => {
  it('splits a LinkedIn tab title into the job title and the company', () => {
    expect(splitPageTitle('Senior Frontend Engineer | Fabrikam | LinkedIn')).toEqual({
      title: 'Senior Frontend Engineer',
      company: 'Fabrikam',
    });
  });

  it('keeps a bar inside the job title and takes the last part as the company', () => {
    expect(splitPageTitle('Engineer | Platform | Contoso Group | LinkedIn')).toEqual({
      title: 'Engineer | Platform',
      company: 'Contoso Group',
    });
  });

  it('drops the LinkedIn suffix when no company is in the title', () => {
    expect(splitPageTitle('Senior Frontend Engineer | LinkedIn')).toEqual({
      title: 'Senior Frontend Engineer',
    });
  });

  it('splits a Seek tab title into the job title and the place', () => {
    expect(
      splitPageTitle(
        'Software Engineer / Full Stack Engineer (All Levels) Job in Springfield Central, Brisbane QLD - SEEK',
      ),
    ).toEqual({
      title: 'Software Engineer / Full Stack Engineer (All Levels)',
      location: 'Springfield Central, Brisbane QLD',
    });
  });

  it('splits at the last "Job in" when the job title has one too', () => {
    expect(splitPageTitle('Night Job in Safety Officer Job in Perth WA - SEEK')).toEqual({
      title: 'Night Job in Safety Officer',
      location: 'Perth WA',
    });
  });

  it('drops the SEEK suffix when no place is in the title', () => {
    expect(splitPageTitle('Senior Software Engineer - SEEK')).toEqual({
      title: 'Senior Software Engineer',
    });
  });

  it.each([
    ['a plain title', 'Software Engineer'],
    [
      'the Seek home page title',
      "SEEK - Australia's no. 1 jobs, employment, career and recruitment site",
    ],
    ['another site', 'Software Engineer - Acme Careers'],
    ['a title that only mentions LinkedIn', 'How to find a job on LinkedIn'],
    ['a title that goes on after LinkedIn', 'Python Course | LinkedIn Learning'],
    ['a title that goes on after SEEK', 'Account Manager - SEEK Partners Pty Ltd'],
    ['an empty title', ''],
  ])('leaves %s as it is', (_label, title) => {
    expect(splitPageTitle(title)).toEqual({ title });
  });

  it('cleans the spaces first', () => {
    expect(splitPageTitle('  Senior   Engineer | Fabrikam | LinkedIn ')).toEqual({
      title: 'Senior Engineer',
      company: 'Fabrikam',
    });
  });
});
