import { Link, Navigate, NavLink, useParams } from 'react-router-dom';

import { Alert } from '@/components/Alert';
import { DOCUMENTS_VERSION } from '@/domain/disclaimers';
import { findLegalDocument, LEGAL_DOCUMENTS } from './documents';

/**
 * One shell, five documents (KAN-40).
 *
 * The left rail lists every document and, for the one being read, its sections.
 * Section links are real in-page anchors to real headings, so the browser's own
 * find-and-jump behaviour works and the URL of a specific clause is shareable.
 */
export function LegalPage() {
  const { slug } = useParams<{ slug: string }>();
  const document = slug ? findLegalDocument(slug) : undefined;

  if (!document) return <Navigate to="/legal/medical-disclaimer" replace />;

  return (
    <div className="legal-shell">
      <nav className="legal-nav" aria-label="Legal documents">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="kicker-quiet" style={{ paddingBottom: 6 }}>
            Documents
          </div>
          {LEGAL_DOCUMENTS.map((entry) => (
            <NavLink key={entry.slug} to={`/legal/${entry.slug}`} className="legal-nav-link">
              {entry.title}
            </NavLink>
          ))}
        </div>

        {document.sections.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="kicker-quiet" style={{ paddingBottom: 4 }}>
              On this page
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
          Version {DOCUMENTS_VERSION}
          <br />
          Previous versions available on request.
        </div>
      </nav>

      <article className="legal-doc">
        <div className="kicker">Legal</div>
        <h1>{document.title}</h1>
        <p className="muted" style={{ fontSize: 14, margin: '0 0 20px' }}>
          Last updated {document.lastUpdated} · reading time {document.readingTime}
        </p>

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
          <Alert tone="warning" title="This document has not been published yet">
            The {document.title} is still being drafted and reviewed. Until it is published, the{' '}
            <Link to="/legal/medical-disclaimer">Medical Disclaimer</Link> is the document that
            governs how this application may be used. If you need this policy before creating an
            account, contact support and we will send you the current draft.
          </Alert>
        )}
      </article>
    </div>
  );
}
