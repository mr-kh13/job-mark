// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { localIso, makeJob } from '@/test-utils/make-job';
import { createCsv } from './csv';

const HEADER =
  'Applied,Saved,Title,Company,Location,Work arrangement,Employment type,Salary,Source,Apply type,Status,Notes,Link';

/** The rows of a file, without the byte-order mark and the empty piece after the last row. */
const rowsOf = (csv: string) => csv.slice(1).split('\r\n').slice(0, -1);

/** The file for one job with this title. Its Company cell, which follows the title, is "Acme". */
const csvWithTitle = (title: string) => createCsv([makeJob({ title, company: 'Acme' })]);

describe('createCsv', () => {
  it('starts with a byte-order mark so Excel reads accents', () => {
    expect(createCsv([makeJob()]).charCodeAt(0)).toBe(0xfeff);
  });

  it('writes the column names as the first row', () => {
    expect(rowsOf(createCsv([makeJob()]))[0]).toBe(HEADER);
  });

  it('ends every row with CRLF, the last one included', () => {
    const csv = createCsv([makeJob({ id: 'seek:1' }), makeJob({ id: 'seek:2' })]);

    expect(csv.endsWith('\r\n')).toBe(true);
    expect(rowsOf(csv)).toHaveLength(3);
  });

  it('writes only the column names when there are no jobs', () => {
    expect(createCsv([])).toBe(String.fromCharCode(0xfeff) + HEADER + '\r\n');
  });

  it('writes every field of a job in column order', () => {
    const job = makeJob({
      title: 'Engineer',
      company: 'Acme',
      location: 'Sydney',
      workArrangement: 'Hybrid',
      employmentType: 'Contract',
      salary: '$120k',
      source: 'linkedin',
      applyType: 'easy',
      status: 'Interviewing',
      notes: 'Call Monday',
      url: 'https://www.linkedin.com/jobs/view/9',
      savedAt: localIso(2026, 10, 5, 8, 0),
      appliedAt: localIso(2026, 10, 7, 9, 30),
    });

    expect(rowsOf(createCsv([job]))[1]).toBe(
      '2026-10-07 09:30,2026-10-05 08:00,Engineer,Acme,Sydney,Hybrid,Contract,$120k,linkedin,easy,Interviewing,Call Monday,https://www.linkedin.com/jobs/view/9',
    );
  });

  it('writes dates in local time', () => {
    const job = makeJob({
      savedAt: localIso(2026, 10, 13, 23, 59),
      appliedAt: localIso(2026, 10, 14, 0, 5),
    });

    expect(rowsOf(createCsv([job]))[1]).toMatch(/^2026-10-14 00:05,2026-10-13 23:59,/);
  });

  it('leaves the Applied cell empty for a job never applied for', () => {
    const job = makeJob({ savedAt: localIso(2026, 10, 13, 11, 57), appliedAt: undefined });

    expect(rowsOf(createCsv([job]))[1]).toMatch(/^,2026-10-13 11:57,/);
  });

  it('keeps accents and non-Latin text intact', () => {
    const job = makeJob({ title: 'Développeur 日本語', company: 'Zoë & Co' });

    expect(createCsv([job])).toContain(',Développeur 日本語,Zoë & Co,');
  });

  it('lists the most recent job first', () => {
    const csv = createCsv([
      makeJob({ id: 'seek:old', title: 'Old', savedAt: localIso(2026, 9, 1) }),
      makeJob({ id: 'seek:new', title: 'New', savedAt: localIso(2026, 10, 1) }),
    ]);

    expect(rowsOf(csv).map((row) => row.split(',')[2])).toEqual(['Title', 'New', 'Old']);
  });

  describe('quoting', () => {
    it('quotes text that contains a comma', () => {
      expect(createCsv([makeJob({ location: 'Sydney, NSW' })])).toContain(',"Sydney, NSW",');
    });

    it('doubles the quotes inside quoted text', () => {
      expect(createCsv([makeJob({ notes: 'say "hi"' })])).toContain(',"say ""hi"""');
    });

    it('quotes text that spans lines', () => {
      expect(createCsv([makeJob({ notes: 'one\ntwo' })])).toContain(',"one\ntwo"');
    });

    it('leaves plain text unquoted', () => {
      expect(createCsv([makeJob({ location: 'Sydney' })])).toContain(',Sydney,');
    });
  });

  describe('cells that start like a formula', () => {
    it.each([
      ['=1+1', "'=1+1"],
      ['+61 400 000 000', "'+61 400 000 000"],
      ['-5', "'-5"],
      ['@SUM(A1)', "'@SUM(A1)"],
      ['\tindented', "'\tindented"],
      ['\rreturned', `"'\rreturned"`],
    ])('gets an apostrophe in front: %j', (title, expected) => {
      expect(csvWithTitle(title)).toContain(`,${expected},Acme,`);
    });

    it('quotes a guarded cell that needs quoting too', () => {
      expect(csvWithTitle('=A1,B1')).toContain(`,"'=A1,B1",Acme,`);
    });

    it('neutralises a scraped HYPERLINK formula', () => {
      expect(csvWithTitle('=HYPERLINK("http://evil","x")')).toContain(
        `,"'=HYPERLINK(""http://evil"",""x"")",Acme,`,
      );
    });

    it('guards every column, notes included', () => {
      expect(createCsv([makeJob({ notes: '=2+2' })])).toContain(",'=2+2,");
    });

    it('leaves text that merely contains a formula character alone', () => {
      expect(csvWithTitle('C++ = fun @ work')).toContain(',C++ = fun @ work,Acme,');
    });
  });
});
