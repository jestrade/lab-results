/**
 * Legal document registry (KAN-40, KAN-22).
 *
 * The Medical Disclaimer is written out in full: its substance comes from the
 * product spec (§26, §46 and the classification rules), so it is ours to
 * publish and it is the one legal text the app's behaviour actually depends on.
 *
 * The other four are registered here with their structure and status, but
 * their bodies are deliberately empty. Drafting a Privacy Policy, Terms of
 * Service, AI Processing Disclosure or Data Retention Policy is a job for
 * whoever carries the legal risk for this product — a plausible-looking one
 * written here would be worse than an obviously missing one, because it would
 * be relied on. KAN-22 (Phase 7) is where they get written; until then each
 * renders an honest "not published yet" state that still links to the
 * disclaimer that *is* in force.
 */

import type { ReactNode } from 'react';

import { MEDICAL_DISCLAIMER } from '@/domain/disclaimers';
import type { MessageKey } from '@/i18n/messages';

export interface LegalSection {
  id: string;
  heading: string;
  body: ReactNode;
}

export interface LegalDocument {
  slug: string;
  title: string;
  lastUpdated: string;
  readingTime: string;
  /** The §26 callout printed above the body. Only the disclaimer uses it. */
  callout?: string;
  sections: LegalSection[];
  /** False until Legal has signed the text off — drives the pending state. */
  published: boolean;
}

const MEDICAL_DISCLAIMER_DOC: LegalDocument = {
  slug: 'medical-disclaimer',
  title: 'Medical Disclaimer',
  lastUpdated: '1 July 2026',
  readingTime: 'about 4 minutes',
  callout: MEDICAL_DISCLAIMER,
  published: true,
  sections: [
    {
      id: 'what-it-does',
      heading: 'What this application does',
      body: (
        <p>
          It reads the laboratory reports you upload, extracts the values printed on them, groups
          the same test across different reports, and shows how each value has moved over time. It
          also produces written explanations of what a test measures and a preliminary,
          automatically generated commentary on each result.
        </p>
      ),
    },
    {
      id: 'what-it-does-not-do',
      heading: 'What it does not do',
      body: (
        <p>
          It does not diagnose disease, confirm or rule out any condition, recommend or adjust
          medication, propose treatment, or replace an examination by a clinician. It has no
          knowledge of your symptoms, examination findings, imaging, family history or anything
          else not present in the documents you upload.
        </p>
      ),
    },
    {
      id: 'limits-of-ai',
      heading: 'Limits of AI-generated content',
      body: (
        <p>
          Every explanation and analysis marked as AI-generated was produced by an automated
          language model. Such systems can misread a document, omit a value, or describe a pattern
          with more confidence than the data supports. Values extracted with low confidence are
          flagged in the interface, and you can report an incorrect extraction at any time.
        </p>
      ),
    },
    {
      id: 'reference-ranges',
      heading: 'Reference ranges and classification',
      body: (
        <p>
          Whether a value is low, normal, high or critical is decided arithmetically against the
          reference range printed on that report — not by the language model. Where a report gives
          no usable range, the result is shown as <em>unknown</em> rather than guessed. Any range
          taken from a general source instead of your laboratory is labelled as such. Ranges differ
          between laboratories and change over time, so each result keeps the range it was reported
          with.
        </p>
      ),
    },
    {
      id: 'critical-results',
      heading: 'Critical results and emergencies',
      body: (
        <p>
          If a value falls outside the critical thresholds stated by your laboratory, the interface
          will say so and ask you to contact a healthcare professional promptly. This application is
          not an emergency service. If you feel unwell or believe you need urgent care, contact your
          local emergency number or attend an emergency department.
        </p>
      ),
    },
    {
      id: 'your-responsibility',
      heading: 'Your responsibility',
      body: (
        <p>
          By using this application you accept that any decision about your health remains between
          you and a qualified healthcare professional, and that nothing shown here constitutes a
          clinical opinion.
        </p>
      ),
    },
  ],
};

function pending(slug: string, title: string): LegalDocument {
  return {
    slug,
    title,
    lastUpdated: 'not yet published',
    readingTime: '—',
    published: false,
    sections: [],
  };
}

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  MEDICAL_DISCLAIMER_DOC,
  pending('privacy', 'Privacy Policy'),
  pending('terms', 'Terms of Service'),
  pending('ai-processing', 'AI Processing Disclosure'),
  pending('data-retention', 'Data Retention Policy'),
];

export function findLegalDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((document) => document.slug === slug);
}

/**
 * The document's *name*, which is translated even though its body is not.
 *
 * A title is a label in the navigation, not a term of the agreement — a
 * Spanish reader hunting for the privacy policy should find "Política de
 * Privacidad" in the rail. The `title` field above stays as the English name
 * of record; this is what the UI renders.
 */
const TITLE_KEYS: Record<string, MessageKey> = {
  'medical-disclaimer': 'public.legal.medicalDisclaimer',
  privacy: 'public.legal.privacy',
  terms: 'public.legal.terms',
  'ai-processing': 'public.legal.aiProcessing',
  'data-retention': 'legal.doc.dataRetention',
};

export function legalTitleKey(slug: string): MessageKey {
  return TITLE_KEYS[slug] ?? 'public.legal.medicalDisclaimer';
}
