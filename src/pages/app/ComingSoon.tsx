import { ButtonLink } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { useT } from '@/i18n/useI18n';
import type { MessageKey } from '@/i18n/messages';

export interface ComingSoonProps {
  titleKey: MessageKey;
  kickerKey: MessageKey;
  /** The ticket that builds this screen, shown so the gap is traceable. */
  ticket: string;
  descriptionKey: MessageKey;
  icon?: string;
}

/**
 * A placeholder for a screen a later phase builds.
 *
 * Every item in the navigation resolves to something — a route that 404s or a
 * link that goes nowhere reads as a bug rather than as unbuilt scope. Naming
 * the ticket keeps the gap honest and traceable back to the board.
 *
 * The props are message keys rather than text: these placeholders are declared
 * in the route table, which is built once at module scope and has no locale to
 * read. The ticket id stays a literal — "KAN-46" is the same in every
 * language, and translating an identifier would break the traceability the
 * ticket is here for.
 */
export function ComingSoon({
  titleKey,
  kickerKey,
  ticket,
  descriptionKey,
  icon = 'compass',
}: ComingSoonProps) {
  const t = useT();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{t(kickerKey)}</div>
          <h1>{t(titleKey)}</h1>
        </div>
      </div>

      <EmptyState
        icon={icon}
        title={t('comingSoon.title')}
        action={
          <ButtonLink to="/upload" variant="secondary" icon="upload-simple">
            {t('dashboard.uploadReport')}
          </ButtonLink>
        }
      >
        {t('comingSoon.body', { description: t(descriptionKey), ticket })}
      </EmptyState>
    </>
  );
}
