/**
 * A translated sentence with React elements inside it.
 *
 * Use this whenever a sentence contains a link, a bold run, a formatted date
 * or a component — anything that cannot be a plain string. The sentence stays
 * one message, so the translator can put the embedded piece wherever Spanish
 * needs it:
 *
 *   en: 'Full detail in the {document}.'
 *   es: 'Todos los detalles en la {document}.'
 *
 *   <Trans id="settings.ai.fullDetail" values={{
 *     document: <Link to="/legal/ai-processing">{t('public.legal.aiProcessing')}</Link>,
 *   }} />
 *
 * The alternative — cutting the sentence at the link and translating the two
 * halves — silently forbids the translator from reordering, which is the one
 * thing translating this sentence actually requires.
 */

import { Fragment } from 'react';

import { formatNodes, type NodeValues } from './format';
import type { MessageKey } from './messages';
import { useT } from './useI18n';

export interface TransProps {
  id: MessageKey;
  values: NodeValues;
}

export function Trans({ id, values }: TransProps) {
  const t = useT();
  const parts = formatNodes(t(id), values);

  return (
    <>
      {parts.map((part, index) => (
        // Index keys are correct here and only here: the parts are positional
        // segments of one string that is re-derived whole on every render, so
        // there is no identity to preserve across renders.
        <Fragment key={index}>{part}</Fragment>
      ))}
    </>
  );
}
