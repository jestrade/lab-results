import { Link, Navigate, NavLink, useParams } from 'react-router-dom';

import { Alert } from '@/components/Alert';
import { DOCUMENTS_VERSION } from '@/domain/disclaimers';
import { Trans } from '@/i18n/Trans';
import { useI18n } from '@/i18n/useI18n';
import { findLegalDocument, LEGAL_DOCUMENTS, legalTitleKey } from './documents';

/**
 * One shell, five documents (KAN-40).
 *
 * The left rail lists every document and, for the one being read, its sections.
 * Section links are real in-page anchors to real headings, so the browser's own
 * find-and-jump behaviour works and the URL of a specific clause is shareable.
 *
 * ── What is translated here, and what is not (KAN-8) ──────────────────────
 *
 * The chrome — navigation, headings, the not-yet-published notice — follows
 * the reader's language. The *body* of a published document does not: these
 * are formal instruments, and a translation of one is a new text that has to
 * be reviewed and version-stamped in its own right, not a rendering choice.
 * Shipping an unreviewed Spanish Terms of Service would be publishing terms
 * nobody has approved.
 *
 * A reader in Spanish is told this rather than left to notice it, which is
 * what the note under the heading is for. The §26 medical disclaimer is the
 * one exception and is translated (see `@/domain/disclaimers`): it is a
 * warning the reader has to understand for it to do anything at all.
 */
export function LegalPage() {
  const { slug } = useParams<{ slug: string }>();
  const document = slug ? findLegalDocument(slug) : undefined;
  const { t, locale } = useI18n();

  if (!document) return <Navigate to="/legal/medical-disclaimer" replace />;

  const title = t(legalTitleKey(document.slug));

  return (
    <div className="legal-shell">
      <nav className="legal-nav" aria-label={t('legal.navLabel')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="kicker-quiet" style={{ paddingBottom: 6 }}>
            {t('legal.documents')}
          </div>
          {LEGAL_DOCUMENTS.map((entry) => (
            <NavLink key={entry.slug} to={`/legal/${entry.slug}`} className="legal-nav-link">
              {t(legalTitleKey(entry.slug))}
            </NavLink>
          ))}
        </div>

        {document.sections.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="kicker-quiet" style={{ paddingBottom: 4 }}>
              {t('legal.onThisPage')}
            </div>
            {document.sections.map((section, index) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                style={{ fontSize: 13, padding: '4px 14px', fontWeight: 500 }}
              >
                {index + 1}. {section.heading}
              </a>
            ))}
          </div>
        ) : null}

        <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
          {t('legal.version', { version: DOCUMENTS_VERSION })}
          <br />
          {t('legal.previousVersions')}
        </div>
      </nav>

      <article className="legal-doc">
        <div className="kicker">{t('legal.kicker')}</div>
        <h1>{title}</h1>
        <p className="muted" style={{ fontSize: 14, margin: '0 0 20px' }}>
          {t('legal.lastUpdated', {
            date: document.lastUpdated,
            readingTime: t('legal.readingTime', { time: document.readingTime }),
          })}
        </p>

        {/* Said plainly to a reader who is not reading in English, rather than
            left for them to work out from the fact that the page did not
            change language. */}
        {locale !== 'en' && document.published ? (
          <p className="muted" style={{ fontSize: 13, margin: '0 0 20px' }}>
            {t('legal.translationNote')}
          </p>
        ) : null}

        {document.callout ? (
          <div className="legal-callout">
            <p>{document.callout}</p>
          </div>
        ) : null}

        {document.published ? (
          document.sections.map((section, index) => (
            <section key={section.id}>
              <h2 id={section.id}>
                {index + 1}. {section.heading}
              </h2>
              {section.body}
            </section>
          ))
        ) : (
          <Alert tone="warning" title={t('legal.notPublishedTitle')}>
            <Trans
              id="legal.notPublishedBody"
              values={{
                title,
                disclaimer: (
                  <Link to="/legal/medical-disclaimer">
                    {t('public.legal.medicalDisclaimer')}
                  </Link>
                ),
              }}
            />
          </Alert>
        )}
      </article>
    </div>
  );
}
