import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, settle } from '@/test-utils/render';
import { buttonNamed, fieldFor } from '@/test-utils/query';
import { openSelect, pickOption } from '@/test-utils/select';
import { typeInto } from '@/test-utils/text-field';
import { JobForm } from './job-form';

afterEach(cleanup);

const jobRef = { id: 'manual:abc', source: 'other' } as const;

const submit = (screen: HTMLElement, label = 'Save') =>
  settle(() => buttonNamed(screen, label).click());

/** Fills the two required fields. */
const fillRequired = async (screen: HTMLElement) => {
  await typeInto(fieldFor(screen, 'Title'), 'Platform Engineer');
  await typeInto(fieldFor(screen, 'Company'), 'Acme');
};

describe('JobForm', () => {
  it('starts empty, with the status Applied', async () => {
    const screen = await render(
      <JobForm jobRef={jobRef} onSubmit={() => {}} onCancel={() => {}} />,
    );

    for (const label of ['Title', 'Company', 'Location', 'Salary', 'Job link']) {
      expect(fieldFor(screen, label).value).toBe('');
    }
    expect(fieldFor<HTMLElement>(screen, 'Status').textContent).toBe('Applied');
    expect(fieldFor<HTMLElement>(screen, 'Work arrangement').textContent).toBe('-');
    expect(fieldFor<HTMLElement>(screen, 'Employment type').textContent).toBe('-');
  });

  it('starts with the values it is given', async () => {
    const screen = await render(
      <JobForm
        jobRef={jobRef}
        defaultValues={{
          title: 'Platform Engineer',
          company: 'Acme',
          location: 'Melbourne, VIC',
          workArrangement: 'Hybrid',
          employmentType: 'Full-time',
          salary: '$120k',
          url: 'https://acme.com/jobs/1',
        }}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(fieldFor(screen, 'Title').value).toBe('Platform Engineer');
    expect(fieldFor(screen, 'Company').value).toBe('Acme');
    expect(fieldFor(screen, 'Location').value).toBe('Melbourne, VIC');
    expect(fieldFor(screen, 'Salary').value).toBe('$120k');
    expect(fieldFor(screen, 'Job link').value).toBe('https://acme.com/jobs/1');
    expect(fieldFor<HTMLElement>(screen, 'Work arrangement').textContent).toBe('Hybrid');
    expect(fieldFor<HTMLElement>(screen, 'Employment type').textContent).toBe('Full-time');
    expect(fieldFor<HTMLElement>(screen, 'Status').textContent).toBe('Applied');
  });

  it('leaves the fields it is not given empty', async () => {
    const screen = await render(
      <JobForm
        jobRef={jobRef}
        defaultValues={{ title: 'Platform Engineer' }}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(fieldFor(screen, 'Title').value).toBe('Platform Engineer');
    for (const label of ['Company', 'Location', 'Salary', 'Job link']) {
      expect(fieldFor(screen, label).value).toBe('');
    }
    expect(fieldFor<HTMLElement>(screen, 'Work arrangement').textContent).toBe('-');
  });

  it('submits the given values as they are, under the given id and source', async () => {
    const onSubmit = vi.fn();
    const screen = await render(
      <JobForm
        jobRef={jobRef}
        defaultValues={{
          title: 'Platform Engineer',
          company: 'Acme',
          workArrangement: 'Remote',
          url: 'https://acme.com/jobs/1',
        }}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );

    await submit(screen);

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
        id: 'manual:abc',
        source: 'other',
        title: 'Platform Engineer',
        company: 'Acme',
        location: '',
        workArrangement: 'Remote',
        employmentType: undefined,
        salary: '',
        url: 'https://acme.com/jobs/1',
        status: 'Applied',
      }),
    );
  });

  it('submits what was entered, under the given id and source', async () => {
    const onSubmit = vi.fn();
    const screen = await render(
      <JobForm jobRef={jobRef} onSubmit={onSubmit} onCancel={() => {}} />,
    );
    await typeInto(fieldFor(screen, 'Title'), 'Platform Engineer');
    await typeInto(fieldFor(screen, 'Company'), 'Acme');
    await typeInto(fieldFor(screen, 'Location'), 'Sydney');
    await typeInto(fieldFor(screen, 'Salary'), '$120k - $140k');
    await typeInto(fieldFor(screen, 'Job link'), 'https://example.com/jobs/1');
    await openSelect(fieldFor<HTMLElement>(screen, 'Work arrangement'));
    await pickOption('Remote');
    await openSelect(fieldFor<HTMLElement>(screen, 'Employment type'));
    await pickOption('Contract');
    await openSelect(fieldFor<HTMLElement>(screen, 'Status'));
    await pickOption('Interviewing');

    await submit(screen);

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
        id: 'manual:abc',
        source: 'other',
        title: 'Platform Engineer',
        company: 'Acme',
        location: 'Sydney',
        workArrangement: 'Remote',
        employmentType: 'Contract',
        salary: '$120k - $140k',
        url: 'https://example.com/jobs/1',
        status: 'Interviewing',
      }),
    );
  });

  it('submits a job with only a title and a company', async () => {
    const onSubmit = vi.fn();
    const screen = await render(
      <JobForm jobRef={jobRef} onSubmit={onSubmit} onCancel={() => {}} />,
    );
    await fillRequired(screen);

    await submit(screen);

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
        id: 'manual:abc',
        source: 'other',
        title: 'Platform Engineer',
        company: 'Acme',
        location: '',
        workArrangement: undefined,
        employmentType: undefined,
        salary: '',
        url: '',
        status: 'Applied',
      }),
    );
  });

  it('uses the given label on the submit button', async () => {
    const screen = await render(
      <JobForm jobRef={jobRef} submitLabel="Add job" onSubmit={() => {}} onCancel={() => {}} />,
    );

    expect(buttonNamed(screen, 'Add job')).toBeDefined();
  });

  describe('required fields', () => {
    it('asks for a title', async () => {
      const onSubmit = vi.fn();
      const screen = await render(
        <JobForm jobRef={jobRef} onSubmit={onSubmit} onCancel={() => {}} />,
      );
      await typeInto(fieldFor(screen, 'Company'), 'Acme');

      await submit(screen);

      await vi.waitFor(() => expect(screen.textContent).toContain('Add the job title.'));
      expect(screen.textContent).not.toContain('Add the company name.');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('asks for a company', async () => {
      const onSubmit = vi.fn();
      const screen = await render(
        <JobForm jobRef={jobRef} onSubmit={onSubmit} onCancel={() => {}} />,
      );
      await typeInto(fieldFor(screen, 'Title'), 'Platform Engineer');

      await submit(screen);

      await vi.waitFor(() => expect(screen.textContent).toContain('Add the company name.'));
      expect(screen.textContent).not.toContain('Add the job title.');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('counts a title of only spaces as missing', async () => {
      const onSubmit = vi.fn();
      const screen = await render(
        <JobForm jobRef={jobRef} onSubmit={onSubmit} onCancel={() => {}} />,
      );
      await typeInto(fieldFor(screen, 'Title'), '   ');
      await typeInto(fieldFor(screen, 'Company'), 'Acme');

      await submit(screen);

      await vi.waitFor(() => expect(screen.textContent).toContain('Add the job title.'));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('shows no error before the first submit', async () => {
      const screen = await render(
        <JobForm jobRef={jobRef} onSubmit={() => {}} onCancel={() => {}} />,
      );

      expect(screen.textContent).not.toContain('Add the job title.');
      expect(screen.textContent).not.toContain('Add the company name.');
    });
  });

  describe('job link', () => {
    it.each(['http://example.com/jobs/1', 'https://example.com/jobs/1'])(
      'accepts %s',
      async (link) => {
        const onSubmit = vi.fn();
        const screen = await render(
          <JobForm jobRef={jobRef} onSubmit={onSubmit} onCancel={() => {}} />,
        );
        await fillRequired(screen);
        await typeInto(fieldFor(screen, 'Job link'), link);

        await submit(screen);

        await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
      },
    );

    it.each(['example.com/jobs/1', 'javascript:alert(1)', 'ftp://example.com/jobs/1'])(
      'rejects %s',
      async (link) => {
        const onSubmit = vi.fn();
        const screen = await render(
          <JobForm jobRef={jobRef} onSubmit={onSubmit} onCancel={() => {}} />,
        );
        await fillRequired(screen);
        await typeInto(fieldFor(screen, 'Job link'), link);

        await submit(screen);

        await vi.waitFor(() =>
          expect(screen.textContent).toContain(
            'Enter a link that starts with http:// or https://.',
          ),
        );
        expect(onSubmit).not.toHaveBeenCalled();
      },
    );

    it('accepts a link with spaces around it', async () => {
      const onSubmit = vi.fn();
      const screen = await render(
        <JobForm jobRef={jobRef} onSubmit={onSubmit} onCancel={() => {}} />,
      );
      await fillRequired(screen);
      await typeInto(fieldFor(screen, 'Job link'), '  https://example.com/jobs/1  ');

      await submit(screen);

      await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    });
  });

  describe('length limits', () => {
    it.each(['Title', 'Company', 'Location', 'Salary'])(
      'rejects a %s of more than 1,000 characters',
      async (label) => {
        const onSubmit = vi.fn();
        const screen = await render(
          <JobForm jobRef={jobRef} onSubmit={onSubmit} onCancel={() => {}} />,
        );
        await fillRequired(screen);
        await typeInto(fieldFor(screen, label), 'x'.repeat(1001));

        await submit(screen);

        await vi.waitFor(() =>
          expect(screen.textContent).toContain('Use 1000 characters or fewer.'),
        );
        expect(onSubmit).not.toHaveBeenCalled();
      },
    );

    it('accepts a title of exactly 1,000 characters', async () => {
      const onSubmit = vi.fn();
      const screen = await render(
        <JobForm jobRef={jobRef} onSubmit={onSubmit} onCancel={() => {}} />,
      );
      await fillRequired(screen);
      await typeInto(fieldFor(screen, 'Title'), 'x'.repeat(1000));

      await submit(screen);

      await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    });

    it('rejects a job link of more than 2,048 characters', async () => {
      const onSubmit = vi.fn();
      const screen = await render(
        <JobForm jobRef={jobRef} onSubmit={onSubmit} onCancel={() => {}} />,
      );
      await fillRequired(screen);
      await typeInto(fieldFor(screen, 'Job link'), 'https://example.com/' + 'x'.repeat(2030));

      await submit(screen);

      await vi.waitFor(() => expect(screen.textContent).toContain('Use 2048 characters or fewer.'));
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it('calls onCancel without submitting when Cancel is clicked', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const screen = await render(
      <JobForm jobRef={jobRef} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    await fillRequired(screen);

    await settle(() => buttonNamed(screen, 'Cancel').click());

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
