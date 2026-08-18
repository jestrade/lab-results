import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { DataTable, type Column } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { Field, TextInput } from '@/components/Field';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { Skeleton } from '@/components/Skeleton';
import { Tag } from '@/components/Tag';
import { useToast } from '@/components/useToast';
import { LOCALE_LABEL, LOCALES, type Locale } from '@/domain/locales';
import type { LabVariable, VariableCategory } from '@/domain/types';
import { CATEGORY_ORDER, categoryLabel } from '@/domain/variables';
import {
  deriveId,
  draftToDocument,
  emptyDraft,
  filterCatalog,
  filterParams,
  hasActiveFilters,
  hasErrors,
  readFilters,
  toDraft,
  validateDraft,
  type CatalogDraft,
  type CatalogFilters,
  type DraftErrorCode,
  type OriginFilter,
} from '@/domain/adminCatalog';
import {
  createVariable,
  deleteVariable,
  subscribeToCatalog,
  updateVariable,
  VariableExistsError,
} from '@/services/adminCatalog';
import { useI18n } from '@/i18n/useI18n';
import type { I18nContextValue } from '@/i18n/I18nContext';
import type { MessageKey } from '@/i18n/messages';

/**
 * Variable catalog administration (KAN-49, KAN-8).
 *
 * `variables/{variableId}` is reference data every reader sees: the name on
 * their card, the explanation on the variable page, and the list the pipeline
 * matches printed names against. docs/variables.md says three things write it —
 * the importer, the pipeline and the backfill — and that none of them may edit
 * an entry that already exists, because a script cannot tell a correction from
 * a regression. This screen is the fourth writer, and the only one that can:
 * a person, who can.
 *
 * ── What an admin is actually protecting here ─────────────────────────────
 *
 * Two mistakes on this screen are worse than the rest, and the page is shaped
 * around making them visible rather than merely possible to undo.
 *
 * A **duplicate** splits one test's history in two: half a reader's potassium
 * values under one entry, half under another, each with a trend computed from
 * the part it can see. The editor therefore compares every name a draft would
 * be known by against every name every existing entry is known by, and says so
 * before the save rather than after. It warns instead of blocking, because two
 * genuinely distinct tests can print under near-identical names — that is a
 * judgement, and this is the screen with a human on it.
 *
 * An **overwrite** is the quieter one. Enrichment may complete a placeholder
 * exactly once, guarded by `needsEnrichment` inside a transaction; an entry
 * saved here clears that flag, so the AI pass cannot come back and rewrite an
 * admin's own wording. That is why every save marks the entry curated, and why
 * the editor says so above the button rather than leaving it to be discovered.
 */
export function AdminVariables() {
  const { t, locale } = useI18n();
  const { push } = useToast();

  const [catalog, setCatalog] = useState<LabVariable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The entry being edited, `'new'` for the create form, `null` for closed. */
  const [editing, setEditing] = useState<LabVariable | 'new' | null>(null);
  const [deleting, setDeleting] = useState<LabVariable | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readFilters(searchParams), [searchParams]);

  // `replace`, for the reason the variables grid gives: these are adjustments
  // to one view, and pushing would put a history entry behind every keystroke.
  const updateFilters = useCallback(
    (change: Partial<CatalogFilters>) => {
      setSearchParams((current) => filterParams({ ...readFilters(current), ...change }), {
        replace: true,
      });
    },
    [setSearchParams],
  );

  useEffect(
    () =>
      subscribeToCatalog(
        (entries) => {
          setCatalog(entries);
          setError(null);
        },
        () => setError(t('adminVariables.loadFailed')),
      ),
    [t],
  );

  // Memoised for the reason the variables grid memoises the same expression:
  // `catalog ?? []` mints a fresh array on every render while the subscription
  // is still pending, invalidating every memo below it.
  const all = useMemo(() => catalog ?? [], [catalog]);
  const visible = useMemo(() => filterCatalog(all, filters), [all, filters]);
  const needsReviewCount = useMemo(
    () => all.filter((entry) => entry.needsEnrichment).length,
    [all],
  );

  /** Panels the catalog actually has entries in, in the grid's fixed order. */
  const availableCategories = useMemo(() => {
    const present = new Set(all.map((entry) => entry.category));
    return CATEGORY_ORDER.filter((category) => present.has(category));
  }, [all]);

  const rows = useMemo(
    () =>
      [...visible].sort((left, right) =>
        left.canonicalName.localeCompare(right.canonicalName, locale),
      ),
    [visible, locale],
  );

  const columns: Column<LabVariable>[] = [
    {
      key: 'name',
      header: t('adminVariables.columnName'),
      sortValue: (row) => row.canonicalName.toLowerCase(),
      render: (row) => (
        <div className="admin-cell-stack">
          <span className="admin-cell-title">{row.canonicalName}</span>
          {/* The other locales' names, so an admin scanning for a missing
              translation finds it without opening every entry in turn. */}
          {LOCALES.filter((entry) => entry !== 'en' && row.names[entry]).map((entry) => (
            <span key={entry} className="muted admin-cell-sub">
              {row.names[entry]}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'id',
      header: t('adminVariables.columnId'),
      sortValue: (row) => row.id,
      render: (row) => <code className="admin-code">{row.id}</code>,
    },
    {
      key: 'category',
      header: t('adminVariables.columnCategory'),
      sortValue: (row) => categoryLabel(row.category, locale),
      render: (row) => categoryLabel(row.category, locale),
    },
    {
      key: 'unit',
      header: t('adminVariables.columnUnit'),
      render: (row) =>
        row.defaultUnit ?? <span className="muted">{t('adminVariables.noUnit')}</span>,
    },
    {
      key: 'aliases',
      header: t('adminVariables.columnAliases'),
      align: 'right',
      sortValue: (row) => row.aliases.length,
      render: (row) => row.aliases.length,
    },
    {
      key: 'state',
      header: t('adminVariables.columnState'),
      sortValue: (row) => (row.needsEnrichment ? 0 : 1),
      render: (row) =>
        row.needsEnrichment ? (
          <Tag tone="accent-2">{t('adminVariables.stateNeedsReview')}</Tag>
        ) : (
          <Tag tone="neutral">
            {t(
              row.origin === 'catalog'
                ? 'adminVariables.stateReviewed'
                : 'adminVariables.originDiscovered',
            )}
          </Tag>
        ),
    },
    {
      key: 'actions',
      header: t('adminVariables.columnActions'),
      align: 'right',
      render: (row) => (
        <div className="admin-row-actions">
          {/* Both labels name the row: a column of identical "Edit" buttons is
              a list of controls a screen-reader user cannot tell apart. */}
          <Button
            variant="secondary"
            onClick={() => setEditing(row)}
            aria-label={t('adminVariables.editLabel', { name: row.canonicalName })}
          >
            {t('adminVariables.edit')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setDeleting(row)}
            aria-label={t('adminVariables.deleteLabel', { name: row.canonicalName })}
          >
            {t('adminVariables.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{t('nav.administration')}</div>
          <h1>{t('nav.adminVariables')}</h1>
        </div>
        <div className="spacer" />
        <div style={{ width: 240 }}>
          <Field label={t('adminVariables.search')}>
            {(props) => (
              <TextInput
                {...props}
                type="search"
                placeholder={t('adminVariables.searchPlaceholder')}
                value={filters.query}
                onChange={(event) => updateFilters({ query: event.target.value })}
              />
            )}
          </Field>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
          {t('adminVariables.new')}
        </Button>
      </div>

      <p className="muted admin-intro">{t('adminVariables.intro')}</p>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      {catalog === null ? (
        <div role="status" aria-label={t('adminVariables.loadingLabel')}>
          <Skeleton height={320} radius="var(--r-card)" />
        </div>
      ) : all.length === 0 ? (
        <EmptyState icon="flask" title={t('adminVariables.emptyTitle')}>
          {t('adminVariables.emptyBody')}
        </EmptyState>
      ) : (
        <>
          <div className="variable-filters">
            <div
              role="group"
              aria-label={t('adminVariables.filterCategory')}
              className="variable-chips"
            >
              <FilterChip
                pressed={filters.category === 'all'}
                onClick={() => updateFilters({ category: 'all' })}
              >
                {t('adminVariables.allCategories')}
              </FilterChip>
              {availableCategories.map((category) => (
                <FilterChip
                  key={category}
                  pressed={filters.category === category}
                  onClick={() => updateFilters({ category })}
                >
                  {categoryLabel(category, locale)}
                </FilterChip>
              ))}
            </div>

            <div
              role="group"
              aria-label={t('adminVariables.filterOrigin')}
              className="variable-chips"
            >
              {ORIGINS.map((option) => (
                <FilterChip
                  key={option.id}
                  pressed={filters.origin === option.id}
                  onClick={() => updateFilters({ origin: option.id })}
                >
                  {t(option.label)}
                </FilterChip>
              ))}
            </div>

            <div className="spacer" />

            {/* The review queue, as one press. It is the question this screen
                exists to answer most often — which entries did the pipeline
                invent and nobody has looked at. */}
            <FilterChip
              pressed={filters.needsReview}
              onClick={() => updateFilters({ needsReview: !filters.needsReview })}
            >
              {t('adminVariables.needsReview', { count: needsReviewCount })}
            </FilterChip>
          </div>

          <DataTable
            caption={t('adminVariables.tableCaption')}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            initialSort={{ key: 'name', direction: 'ascending' }}
            empty={
              <EmptyState icon="funnel" title={t('adminVariables.noMatchTitle')}>
                {t('adminVariables.noMatchBody')}
              </EmptyState>
            }
          />

          {hasActiveFilters(filters) && rows.length > 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {t('adminVariables.showing', { visible: rows.length, total: all.length })}
            </p>
          ) : null}
        </>
      )}

      {/* One dialog at a time: `Modal` labels itself with a fixed element id,
          and two mounted at once would both answer to it. */}
      {editing ? (
        <VariableEditor
          variable={editing === 'new' ? null : editing}
          catalog={all}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            push(message, 'success');
            setEditing(null);
          }}
          t={t}
          locale={locale}
        />
      ) : deleting ? (
        <DeleteDialog
          variable={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(message) => {
            push(message, 'success');
            setDeleting(null);
          }}
          onFailed={() => push(t('adminVariables.deleteFailed'), 'danger')}
          t={t}
        />
      ) : null}
    </>
  );
}

const ORIGINS: { id: OriginFilter; label: MessageKey }[] = [
  { id: 'all', label: 'adminVariables.originAll' },
  { id: 'catalog', label: 'adminVariables.originCatalog' },
  { id: 'discovered', label: 'adminVariables.originDiscovered' },
];

function FilterChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

const ERROR_MESSAGE: Record<DraftErrorCode, MessageKey> = {
  required: 'adminVariables.errorRequired',
  invalidId: 'adminVariables.errorInvalidId',
  idTaken: 'adminVariables.errorIdTaken',
};

/**
 * The create/edit form.
 *
 * ── Why the id stops being editable ───────────────────────────────────────
 *
 * On a new entry the id is a field, pre-filled from the English name and
 * changeable. On an existing one it is text. The id is what every stored
 * result and every user's series points at (`variableSeries/{variableId}`), and
 * "renaming" it here would not move any of them — it would create a second
 * entry and orphan the first, which is the duplicate this screen exists to
 * prevent, arrived at from the other direction.
 */
function VariableEditor({
  variable,
  catalog,
  onClose,
  onSaved,
  t,
  locale,
}: {
  variable: LabVariable | null;
  catalog: readonly LabVariable[];
  onClose: () => void;
  onSaved: (message: string) => void;
  t: I18nContextValue['t'];
  locale: Locale;
}) {
  const isNew = variable === null;
  const [draft, setDraft] = useState<CatalogDraft>(() =>
    variable ? toDraft(variable) : emptyDraft(),
  );
  /**
   * Whether the id still follows the name.
   *
   * It stops the moment an admin types in the id field — after which the name
   * must not overwrite what they chose, which is the whole point of the field
   * being editable.
   */
  const [idFollowsName, setIdFollowsName] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const problems = useMemo(
    () => validateDraft(draft, catalog, variable?.id ?? null),
    [draft, catalog, variable],
  );

  function set<K extends keyof CatalogDraft>(key: K, value: CatalogDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setCanonicalName(name: string) {
    setDraft((current) => ({
      ...current,
      canonicalName: name,
      // The English display name mirrors the canonical name until it is given
      // one of its own, because on the great majority of entries they are the
      // same string and typing it twice is a chance to make them differ.
      names: current.names.en === current.canonicalName
        ? { ...current.names, en: name }
        : current.names,
      id: idFollowsName ? deriveId(name) : current.id,
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (hasErrors(problems) || saving) return;

    setSaving(true);
    setFailure(null);
    const document = draftToDocument(draft);

    try {
      if (isNew) {
        await createVariable(draft.id.trim(), document);
        onSaved(t('adminVariables.created', { name: document.canonicalName }));
      } else {
        await updateVariable(variable.id, document);
        onSaved(t('adminVariables.updated', { name: document.canonicalName }));
      }
    } catch (error) {
      // Losing the race for an id is a different sentence from a failed write,
      // and it is the one the admin can act on.
      setFailure(
        error instanceof VariableExistsError
          ? t('adminVariables.existsFailed')
          : t('adminVariables.saveFailed'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => (saving ? undefined : onClose())}
      title={
        isNew
          ? t('adminVariables.newTitle')
          : t('adminVariables.editTitle', { name: variable.canonicalName })
      }
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            form={FORM_ID}
            type="submit"
            disabled={hasErrors(problems)}
            loading={saving}
            loadingLabel={t(isNew ? 'adminVariables.creating' : 'common.saving')}
          >
            {t(isNew ? 'adminVariables.create' : 'common.save')}
          </Button>
        </>
      }
    >
      {failure ? (
        <Alert tone="danger" live>
          {failure}
        </Alert>
      ) : null}

      {problems.duplicateOf ? (
        <Alert tone="warning" live>
          {t('adminVariables.duplicateWarning', { id: problems.duplicateOf })}
        </Alert>
      ) : null}

      <form id={FORM_ID} className="profile-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <Field
          label={t('adminVariables.fieldCanonicalName')}
          hint={t('adminVariables.fieldCanonicalNameHint')}
          error={problems.errors.canonicalName ? t(ERROR_MESSAGE[problems.errors.canonicalName]) : null}
        >
          {(props) => (
            <TextInput
              {...props}
              value={draft.canonicalName}
              onChange={(event) => setCanonicalName(event.target.value)}
            />
          )}
        </Field>

        <Field
          label={t('adminVariables.fieldId')}
          hint={t(isNew ? 'adminVariables.fieldIdHint' : 'adminVariables.fieldIdFixed')}
          error={problems.errors.id ? t(ERROR_MESSAGE[problems.errors.id]) : null}
        >
          {(props) =>
            isNew ? (
              <TextInput
                {...props}
                value={draft.id}
                onChange={(event) => {
                  setIdFollowsName(false);
                  set('id', event.target.value);
                }}
              />
            ) : (
              // Text, not a disabled input: a control that can never be used is
              // still a control to reach past with the keyboard.
              <p className="admin-code admin-static-value" id={props.id}>
                {draft.id}
              </p>
            )
          }
        </Field>

        <div className="profile-grid">
          {LOCALES.map((entry) => (
            <Field
              key={entry}
              label={t('adminVariables.fieldName', { language: LOCALE_LABEL[entry] })}
              error={
                entry === 'en' && problems.errors.nameEn
                  ? t(ERROR_MESSAGE[problems.errors.nameEn])
                  : null
              }
            >
              {(props) => (
                <TextInput
                  {...props}
                  value={draft.names[entry]}
                  onChange={(event) =>
                    set('names', { ...draft.names, [entry]: event.target.value })
                  }
                />
              )}
            </Field>
          ))}
        </div>

        <div className="profile-grid">
          <Field label={t('adminVariables.fieldCategory')}>
            {(props) => (
              <select
                {...props}
                className="input"
                value={draft.category}
                onChange={(event) => set('category', event.target.value as VariableCategory)}
              >
                {CATEGORY_ORDER.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabel(category, locale)}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label={t('adminVariables.fieldUnit')} hint={t('adminVariables.fieldUnitHint')}>
            {(props) => (
              <TextInput
                {...props}
                value={draft.defaultUnit}
                onChange={(event) => set('defaultUnit', event.target.value)}
              />
            )}
          </Field>
        </div>

        {LOCALES.map((entry) => (
          <Field
            key={entry}
            label={t('adminVariables.fieldDescription', { language: LOCALE_LABEL[entry] })}
            hint={entry === 'en' ? t('adminVariables.fieldDescriptionHint') : undefined}
          >
            {(props) => (
              <textarea
                {...props}
                className="input"
                rows={3}
                value={draft.descriptions[entry]}
                onChange={(event) =>
                  set('descriptions', { ...draft.descriptions, [entry]: event.target.value })
                }
              />
            )}
          </Field>
        ))}

        <Field label={t('adminVariables.fieldAliases')} hint={t('adminVariables.fieldAliasesHint')}>
          {(props) => (
            <textarea
              {...props}
              className="input"
              rows={4}
              value={draft.aliases}
              onChange={(event) => set('aliases', event.target.value)}
            />
          )}
        </Field>

        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          <Icon name="seal-check" size={14} /> {t('adminVariables.reviewNote')}
        </p>
      </form>
    </Modal>
  );
}

/**
 * The submit button lives in the dialog's action row, outside the `<form>`.
 * `form=` is what keeps it a real submit button from there — so Enter in a text
 * field and a click on the button take the same path.
 */
const FORM_ID = 'variable-editor-form';

function DeleteDialog({
  variable,
  onClose,
  onDeleted,
  onFailed,
  t,
}: {
  variable: LabVariable;
  onClose: () => void;
  onDeleted: (message: string) => void;
  onFailed: () => void;
  t: I18nContextValue['t'];
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteVariable(variable.id);
      onDeleted(t('adminVariables.deleted', { name: variable.canonicalName }));
    } catch {
      onFailed();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => (deleting ? undefined : onClose())}
      title={t('adminVariables.deleteTitle', { name: variable.canonicalName })}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={deleting}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleDelete()}
            loading={deleting}
            loadingLabel={t('adminVariables.deleting')}
          >
            {t('adminVariables.deleteConfirm')}
          </Button>
        </>
      }
    >
      <p>{t('adminVariables.deleteBody')}</p>
      {/* What survives is as much a part of the decision as what does not. */}
      <p>{t('adminVariables.deleteKeeps')}</p>
      <p className="muted" style={{ marginBottom: 0, fontSize: 13 }}>
        {t('adminVariables.deleteReturns')}
      </p>
    </Modal>
  );
}
