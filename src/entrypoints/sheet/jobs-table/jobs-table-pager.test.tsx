import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, settle } from '@/test-utils/render';
import { openSelect, pickOption, selectOptions } from '@/test-utils/select';
import { JobsTablePager } from './jobs-table-pager';

afterEach(cleanup);

type Props = Parameters<typeof JobsTablePager>[0];

const renderPager = (over: Partial<Props> = {}) =>
  render(
    <JobsTablePager
      page={over.page ?? 1}
      pageCount={over.pageCount ?? 1}
      pageSize={over.pageSize ?? 50}
      total={over.total ?? 3}
      onPageChange={over.onPageChange ?? (() => {})}
      onPageSizeChange={over.onPageSizeChange ?? (() => {})}
    />,
  );

const byLabel = <T extends HTMLElement = HTMLButtonElement>(screen: HTMLElement, label: string) =>
  screen.querySelector<T>(`[aria-label="${label}"]`)!;

describe('JobsTablePager', () => {
  it('says which jobs the page shows and how many there are', async () => {
    const screen = await renderPager({ page: 2, pageCount: 3, total: 120 });

    expect(screen.textContent).toContain('51–100 of 120');
  });

  it('ends the range at the last job on the last page', async () => {
    const screen = await renderPager({ page: 3, pageCount: 3, total: 120 });

    expect(screen.textContent).toContain('101–120 of 120');
  });

  it('shows every job when they fit on one page', async () => {
    const screen = await renderPager({ page: 1, pageCount: 1, total: 3 });

    expect(screen.textContent).toContain('1–3 of 3');
  });

  it('uses the page size for the start of the range', async () => {
    const screen = await renderPager({ page: 2, pageCount: 5, pageSize: 10, total: 45 });

    expect(screen.textContent).toContain('11–20 of 45');
  });

  describe('moving between pages', () => {
    it('goes to the next page', async () => {
      const onPageChange = vi.fn();
      const screen = await renderPager({ page: 2, pageCount: 3, total: 120, onPageChange });

      await settle(() => byLabel(screen, 'Next page').click());

      expect(onPageChange).toHaveBeenCalledExactlyOnceWith(3);
    });

    it('goes to the previous page', async () => {
      const onPageChange = vi.fn();
      const screen = await renderPager({ page: 2, pageCount: 3, total: 120, onPageChange });

      await settle(() => byLabel(screen, 'Previous page').click());

      expect(onPageChange).toHaveBeenCalledExactlyOnceWith(1);
    });

    it('cannot go back from the first page', async () => {
      const screen = await renderPager({ page: 1, pageCount: 3, total: 120 });

      expect(byLabel(screen, 'Previous page').disabled).toBe(true);
      expect(byLabel(screen, 'Next page').disabled).toBe(false);
    });

    it('cannot go on from the last page', async () => {
      const screen = await renderPager({ page: 3, pageCount: 3, total: 120 });

      expect(byLabel(screen, 'Previous page').disabled).toBe(false);
      expect(byLabel(screen, 'Next page').disabled).toBe(true);
    });

    it('cannot move at all with a single page', async () => {
      const screen = await renderPager({ page: 1, pageCount: 1, total: 3 });

      expect(byLabel(screen, 'Previous page').disabled).toBe(true);
      expect(byLabel(screen, 'Next page').disabled).toBe(true);
    });
  });

  describe('rows per page', () => {
    it('shows the current page size', async () => {
      const screen = await renderPager({ pageSize: 25 });

      expect(byLabel(screen, 'Rows per page').textContent).toBe('25');
    });

    it('offers 10, 25 and 50 and nothing larger', async () => {
      const screen = await renderPager();

      await openSelect(byLabel(screen, 'Rows per page'));

      expect(selectOptions().map((option) => option.textContent)).toEqual(['10', '25', '50']);
    });

    it('reports the size that was picked', async () => {
      const onPageSizeChange = vi.fn();
      const screen = await renderPager({ onPageSizeChange });

      await openSelect(byLabel(screen, 'Rows per page'));
      await pickOption('10');

      expect(onPageSizeChange).toHaveBeenCalledExactlyOnceWith(10);
    });
  });
});
