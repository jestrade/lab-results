import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';

import { renderWithProviders, signedInAuth } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import type { CatalogDocument } from '@/domain/adminCatalog';
import type { LabVariable } from '@/domain/types';
import type * as AdminCatalogModule from '@/services/adminCatalog';
import { AdminVariables } from './AdminVariables';

const subscribeToCatalog = vi.hoisted(() => vi.fn());
// Typed so the assertions on what was written do not need a cast each time.
const createVariable = vi.hoisted(() =>
  vi.fn((_id: string, _document: CatalogDocument) => Promise.resolve()),
);
const updateVariable = vi.hoisted(() =>
  vi.fn((_id: string, _document: CatalogDocument) => Promise.resolve()),
);
const deleteVariable = vi.hoisted(() => vi.fn((_id: string) => Promise.resolve()));

vi.mock('@/services/adminCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof AdminCatalogModule>();
  return { ...actual, subscribeToCatalog, createVariable, updateVariable, deleteVariable };
});

function makeVariable(overrides: Partial<LabVariable> = {}): LabVariable {
  return {
    id: 'hemoglobin',
    canonicalName: 'Hemoglobin',
    names: { en: 'Hemoglobin', es: 'Hemoglobina' },
    descriptions: { en: 'Carries oxygen around the body.' },
    aliases: ['Hgb'],
    category: 'complete_blood_count',
    defaultUnit: 'g/dL',
    origin: 'catalog',
    needsEnrichment: false,
    createdAt: null as never,
    ...overrides,
  };
}

const ferritin = makeVariable({
  id: 'ferritina-serica',
  canonicalName: 'Ferritina sérica',
  names: { en: 'Ferritina sérica' },
  descriptions: {},
  aliases: [],
  category: 'other',
  defaultUnit: null,
  origin: 'discovered',
  needsEnrichment: true,
});

function emit(entries: LabVariable[]) {
  (subscribeToCatalog.mock.calls.at(-1)?.[0] as (v: LabVariable[]) => void)(entries);
}

function fail(message = 'nope') {
  (subscribeToCatalog.mock.calls.at(-1)?.[1] as (e: Error) => void)(new Error(message));
}

/** Reports the query string, which is where the filters actually live. */
function Search() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderPage(route = '/admin/variables') {
  return renderWithProviders(
    <>
      <AdminVariables />
      <Search />
    </>,
    { auth: signedInAuth({ role: 'admin', isAdmin: true }), route },
  );
}

beforeEach(() => {
  subscribeToCatalog.mockReset();
  subscribeToCatalog.mockReturnValue(() => {});
  createVariable.mockReset().mockResolvedValue(undefined);
  updateVariable.mockReset().mockResolvedValue(undefined);
  deleteVariable.mockReset().mockResolvedValue(undefined);
});

describe('AdminVariables', () => {
  it('lists the catalog once it arrives', async () => {
    const { container } = renderPage();
    emit([makeVariable(), ferritin]);

    expect(await screen.findByText('Hemoglobin')).toBeInTheDocument();
    expect(screen.getByText('Ferritina sérica')).toBeInTheDocument();
    // The other locale's name is on the row, so a missing translation is
    // visible without opening every entry.
    expect(screen.getByText('Hemoglobina')).toBeInTheDocument();
    expect(screen.getByText('hemoglobin')).toBeInTheDocument();

    await expectNoA11yViolations(container);
  });

  it('flags the entries nobody has reviewed', async () => {
    renderPage();
    emit([makeVariable(), ferritin]);

    const row = (await screen.findByText('Ferritina sérica')).closest('tr')!;
    expect(within(row).getByText('Needs review')).toBeInTheDocument();

    const reviewed = screen.getByText('Hemoglobin').closest('tr')!;
    expect(within(reviewed).getByText('Reviewed')).toBeInTheDocument();
  });

  it('shows an empty state rather than an empty table', async () => {
    renderPage();
    emit([]);

    expect(await screen.findByText('The catalog is empty')).toBeInTheDocument();
  });

  it('reports a failed subscription', async () => {
    renderPage();
    fail();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The catalog could not be loaded.',
    );
  });

  it('narrows the list by search, and keeps it in the address bar', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeVariable(), ferritin]);

    await user.type(await screen.findByLabelText('Search the catalog'), 'ferritina');

    await waitFor(() => expect(screen.queryByText('Hemoglobin')).not.toBeInTheDocument());
    expect(screen.getByText('Ferritina sérica')).toBeInTheDocument();
    // The URL is the only place this state lives, so a refresh keeps the view.
    expect(screen.getByTestId('search')).toHaveTextContent('q=ferritina');
  });

  it('restores the filters a URL carries', async () => {
    renderPage('/admin/variables?review=1');
    emit([makeVariable(), ferritin]);

    expect(await screen.findByText('Ferritina sérica')).toBeInTheDocument();
    expect(screen.queryByText('Hemoglobin')).not.toBeInTheDocument();
  });

  it('filters down to what still needs a human', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeVariable(), ferritin]);

    await user.click(await screen.findByRole('button', { name: 'Needs review (1)' }));

    expect(screen.queryByText('Hemoglobin')).not.toBeInTheDocument();
    expect(screen.getByText('Ferritina sérica')).toBeInTheDocument();
  });

  it('says so when a filter leaves nothing', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeVariable()]);

    await user.type(await screen.findByLabelText('Search the catalog'), 'thyroxine');

    expect(await screen.findByText('No variable matches')).toBeInTheDocument();
  });
});

describe('creating a variable', () => {
  it('suggests a document id from the name, and writes the entry', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeVariable()]);

    await user.click(screen.getByRole('button', { name: 'New variable' }));
    await user.type(screen.getByLabelText('Canonical name'), 'Vitamin B12');

    const id = screen.getByLabelText('Document id');
    expect(id).toHaveValue('vitamin-b12');

    await user.type(screen.getByLabelText('Display name (Español)'), 'Vitamina B12');
    await user.click(screen.getByRole('button', { name: 'Create variable' }));

    await waitFor(() => expect(createVariable).toHaveBeenCalledTimes(1));
    const [writtenId, document] = createVariable.mock.calls[0]!;
    expect(writtenId).toBe('vitamin-b12');
    expect(document).toMatchObject({
      canonicalName: 'Vitamin B12',
      // The English display name follows the canonical name rather than making
      // the admin type the same string twice.
      names: { en: 'Vitamin B12', es: 'Vitamina B12' },
      origin: 'catalog',
      needsEnrichment: false,
    });
  });

  it('stops following the name once the id is typed in by hand', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([]);

    await user.click(screen.getByRole('button', { name: 'New variable' }));
    await user.type(screen.getByLabelText('Canonical name'), 'Ferritin');
    await user.clear(screen.getByLabelText('Document id'));
    await user.type(screen.getByLabelText('Document id'), 'ferritin-serum');
    await user.type(screen.getByLabelText('Canonical name'), ' (serum)');

    expect(screen.getByLabelText('Document id')).toHaveValue('ferritin-serum');
  });

  it('refuses to save without the fields that make an entry usable', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([]);

    await user.click(screen.getByRole('button', { name: 'New variable' }));
    // Nothing typed: no id, no canonical name, no English name.
    expect(screen.getByRole('button', { name: 'Create variable' })).toBeDisabled();

    await user.type(screen.getByLabelText('Canonical name'), 'Ferritin');
    expect(screen.getByRole('button', { name: 'Create variable' })).toBeEnabled();
    expect(createVariable).not.toHaveBeenCalled();
  });

  it('rejects an id another entry already holds', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeVariable()]);

    await user.click(screen.getByRole('button', { name: 'New variable' }));
    await user.type(screen.getByLabelText('Canonical name'), 'Something else');
    await user.clear(screen.getByLabelText('Document id'));
    await user.type(screen.getByLabelText('Document id'), 'hemoglobin');

    expect(await screen.findByText('Another variable already uses this id.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create variable' })).toBeDisabled();
  });

  it('warns about a probable duplicate without blocking the save', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeVariable()]);

    await user.click(screen.getByRole('button', { name: 'New variable' }));
    await user.type(screen.getByLabelText('Canonical name'), 'HEMOGLOBINA');

    // A warning, because two genuinely distinct tests can print under
    // near-identical names and only a person can tell.
    expect(await screen.findByRole('alert')).toHaveTextContent('hemoglobin');
    expect(screen.getByRole('button', { name: 'Create variable' })).toBeEnabled();
  });

  it('reports losing the race for an id differently from a failed write', async () => {
    const user = userEvent.setup();
    const { VariableExistsError } = await import('@/services/adminCatalog');
    createVariable.mockRejectedValueOnce(new VariableExistsError('ferritin'));
    renderPage();
    emit([]);

    await user.click(screen.getByRole('button', { name: 'New variable' }));
    await user.type(screen.getByLabelText('Canonical name'), 'Ferritin');
    await user.click(screen.getByRole('button', { name: 'Create variable' }));

    expect(await screen.findByText(/That id was taken while you were editing/)).toBeInTheDocument();
  });
});

describe('editing a variable', () => {
  it('opens with what is stored and saves the changes', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeVariable()]);

    await user.click(await screen.findByRole('button', { name: 'Edit Hemoglobin' }));

    expect(screen.getByLabelText('Canonical name')).toHaveValue('Hemoglobin');
    expect(screen.getByLabelText('Display name (Español)')).toHaveValue('Hemoglobina');
    // Aliases are one per line, so a name containing a comma survives.
    expect(screen.getByLabelText('Aliases')).toHaveValue('Hgb');

    await user.type(screen.getByLabelText('Aliases'), '\nHb');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateVariable).toHaveBeenCalledTimes(1));
    const [id, document] = updateVariable.mock.calls[0]!;
    expect(id).toBe('hemoglobin');
    expect(document.aliases).toEqual(['Hgb', 'Hb']);
  });

  it('does not offer to change the id of an entry results already point at', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeVariable()]);

    await user.click(await screen.findByRole('button', { name: 'Edit Hemoglobin' }));

    // Present as text, not as a control to tab past.
    expect(screen.queryByRole('textbox', { name: 'Document id' })).not.toBeInTheDocument();
    expect(
      screen.getByText('An id cannot be changed after the entry is created — results already point at it.'),
    ).toBeInTheDocument();
  });

  it('marks a reviewed placeholder as curated', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([ferritin]);

    await user.click(await screen.findByRole('button', { name: 'Edit Ferritina sérica' }));
    await user.type(screen.getByLabelText('Explanation (English)'), 'Stored iron.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateVariable).toHaveBeenCalledTimes(1));
    // Otherwise the enrichment pass would come back and overwrite the wording
    // a person just wrote — the flag is what it treats as permission.
    expect(updateVariable.mock.calls[0]![1]).toMatchObject({
      origin: 'catalog',
      needsEnrichment: false,
      descriptions: { en: 'Stored iron.' },
    });
  });

  it('keeps the dialog open and explains a failed save', async () => {
    const user = userEvent.setup();
    updateVariable.mockRejectedValueOnce(new Error('offline'));
    renderPage();
    emit([makeVariable()]);

    await user.click(await screen.findByRole('button', { name: 'Edit Hemoglobin' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('The variable could not be saved.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('deleting a variable', () => {
  it('says what goes, what stays and that it can come back', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeVariable()]);

    await user.click(await screen.findByRole('button', { name: 'Delete Hemoglobin' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/No results are affected/)).toBeInTheDocument();
    expect(within(dialog).getByText(/It can come back on its own/)).toBeInTheDocument();
  });

  it('deletes only after the confirming click', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeVariable()]);

    await user.click(await screen.findByRole('button', { name: 'Delete Hemoglobin' }));
    expect(deleteVariable).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete variable' }));
    await waitFor(() => expect(deleteVariable).toHaveBeenCalledWith('hemoglobin'));
    // The row disappearing is the subscription's doing; the toast is what
    // tells the admin the silence is the delete having worked.
    expect(
      await screen.findByText('Hemoglobin was deleted from the catalog.'),
    ).toBeInTheDocument();
  });

  it('says so when the delete fails, and leaves the entry alone', async () => {
    const user = userEvent.setup();
    deleteVariable.mockRejectedValueOnce(new Error('offline'));
    renderPage();
    emit([makeVariable()]);

    await user.click(await screen.findByRole('button', { name: 'Delete Hemoglobin' }));
    await user.click(screen.getByRole('button', { name: 'Delete variable' }));

    expect(await screen.findByText('The variable could not be deleted.')).toBeInTheDocument();
    expect(screen.getByText('Hemoglobin')).toBeInTheDocument();
  });
});

describe('paging the catalog', () => {
  /** 30 entries — enough to need a second page at 25 per page. */
  function manyVariables() {
    return Array.from({ length: 30 }, (_, index) =>
      makeVariable({
        id: `var-${String(index + 1).padStart(2, '0')}`,
        canonicalName: `Variable ${String(index + 1).padStart(2, '0')}`,
        names: { en: `Variable ${String(index + 1).padStart(2, '0')}` },
      }),
    );
  }

  it('shows one page at a time and says how much of the list that is', async () => {
    renderPage();
    emit(manyVariables());

    expect(await screen.findByText('Variable 01')).toBeInTheDocument();
    expect(screen.queryByText('Variable 26')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1–25 of 30')).toBeInTheDocument();
  });

  it('puts the page in the address bar, so a refresh keeps it', async () => {
    const user = userEvent.setup();
    renderPage();
    emit(manyVariables());

    await user.click(await screen.findByRole('button', { name: 'Go to page 2' }));

    expect(screen.getByText('Variable 26')).toBeInTheDocument();
    expect(screen.queryByText('Variable 01')).not.toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('page=2');
  });

  it('opens on the page a URL carries', async () => {
    renderPage('/admin/variables?page=2');
    emit(manyVariables());

    expect(await screen.findByText('Variable 26')).toBeInTheDocument();
  });

  it('returns to the first page when a filter changes', async () => {
    // Otherwise narrowing the list while on page two leaves an empty table
    // with working controls and no explanation.
    const user = userEvent.setup();
    renderPage('/admin/variables?page=2');
    emit(manyVariables());

    await user.type(await screen.findByLabelText('Search the catalog'), 'Variable 01');

    await waitFor(() => expect(screen.getByTestId('search')).not.toHaveTextContent('page=2'));
    expect(screen.getByText('Variable 01')).toBeInTheDocument();
  });

  it('falls back to the last page rather than rendering blank', async () => {
    renderPage('/admin/variables?page=99');
    emit(manyVariables());

    expect(await screen.findByText('Variable 26')).toBeInTheDocument();
    expect(screen.getByText('Showing 26–30 of 30')).toBeInTheDocument();
  });

  it('leaves the duplicate check reading the whole catalog, not the page', async () => {
    // The entry it must find is on page two; the editor is opened from page
    // one. A check narrowed to the visible rows would say nothing here.
    const user = userEvent.setup();
    renderPage();
    emit([...manyVariables(), makeVariable({ id: 'hemoglobin', canonicalName: 'Hemoglobin' })]);

    await user.click(screen.getByRole('button', { name: 'New variable' }));
    await user.type(screen.getByLabelText('Canonical name'), 'HEMOGLOBINA');

    expect(await screen.findByRole('alert')).toHaveTextContent('hemoglobin');
  });

  it('does not draw a control when the catalog fits on one page', async () => {
    renderPage();
    emit([makeVariable(), ferritin]);

    await screen.findByText('Hemoglobin');
    expect(screen.queryByRole('navigation', { name: 'Catalog pages' })).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1–2 of 2')).toBeInTheDocument();
  });
});
