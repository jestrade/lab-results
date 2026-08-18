/**
 * Page controls for a long table (KAN-49, KAN-50).
 *
 * A `<nav>` with real `<button>`s, because these move the reader through a
 * list and have to be reachable and operable by keyboard like anything else.
 * The current page carries `aria-current="page"`, which is what tells a screen
 * reader which of a row of numbers is the one you are on — the visual
 * treatment alone says nothing.
 *
 * The count sentence is not decoration either. "Showing 26–50 of 178" is the
 * only thing on a paged screen that distinguishes "this is the whole result"
 * from "there is more behind these controls", and a reader who has just
 * searched needs that answer more than they need the buttons.
 */

import { Icon } from './Icon';
import { PAGE_GAP, pageNumbers, pageWindow } from '@/domain/pagination';
import { useI18n } from '@/i18n/useI18n';

export interface PaginationProps {
  page: number;
  pageCount: number;
  /** Rows across every page, for the count sentence. */
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Names the list being paged, so two controls on one screen differ. */
  label: string;
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  label,
}: PaginationProps) {
  const { t } = useI18n();
  const window = pageWindow(page, total, pageSize);

  return (
    <div className="pagination">
      <p className="pagination-count" aria-live="polite">
        {t('pagination.showing', {
          from: window.from,
          to: window.to,
          total: window.total,
        })}
      </p>

      {/* One page is not worth a control. The count sentence above still is:
          it is what says the result is complete. */}
      {pageCount > 1 ? (
        <nav className="pagination-nav" aria-label={label}>
          <button
            type="button"
            className="pagination-step"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            <Icon name="caret-left" size={14} />
            <span className="pagination-step-label">{t('pagination.previous')}</span>
          </button>

          <ol className="pagination-pages">
            {pageNumbers(page, pageCount).map((entry, index) =>
              entry === PAGE_GAP ? (
                // Not a button, and hidden from the reading order: it stands
                // for pages that were left out, and announcing an ellipsis
                // between two numbers helps nobody.
                <li key={`gap-${index}`} className="pagination-gap" aria-hidden="true">
                  &hellip;
                </li>
              ) : (
                <li key={entry}>
                  <button
                    type="button"
                    className="pagination-page"
                    aria-current={entry === page ? 'page' : undefined}
                    aria-label={t('pagination.goToPage', { page: entry })}
                    onClick={() => onPageChange(entry)}
                  >
                    {entry}
                  </button>
                </li>
              ),
            )}
          </ol>

          <button
            type="button"
            className="pagination-step"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
          >
            <span className="pagination-step-label">{t('pagination.next')}</span>
            <Icon name="caret-right" size={14} />
          </button>
        </nav>
      ) : null}
    </div>
  );
}
