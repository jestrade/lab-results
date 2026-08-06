import { ButtonLink } from '@/components/Button';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { EmptyState } from '@/components/EmptyState';
import { useT } from '@/i18n/useI18n';
import { useAuth } from '@/auth/useAuth';

/**
 * Dashboard (KAN-41 / KAN-12 build this out in Phase 4).
 *
 * What is here now is the Phase 1 half: the shell, the disclaimer banner that
 * every authenticated page must carry, and the entry point to the one workflow
 * that exists. The metric row, recent-reports table and AI insights panel need
 * the extraction pipeline (Phase 2) and the trend engine (Phase 3) to have
 * anything to show, so they are not faked here.
 */
export function Dashboard() {
  const { user } = useAuth();
  const t = useT();
  const name = user?.displayName?.split(' ')[0];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{t('dashboard.kicker')}</div>
          <h1>{name ? t('dashboard.welcome', { name }) : t('nav.dashboard')}</h1>
        </div>
        <div className="spacer" />
        <ButtonLink to="/upload" variant="primary" icon="upload-simple">
          {t('dashboard.uploadReport')}
        </ButtonLink>
      </div>

      <DisclaimerBanner />

      <EmptyState
        icon="file-pdf"
        title={t('dashboard.emptyTitle')}
        action={
          <ButtonLink to="/upload" variant="primary" icon="upload-simple">
            {t('dashboard.uploadFirst')}
          </ButtonLink>
        }
      >
        {t('dashboard.emptyBody')}
      </EmptyState>
    </>
  );
}
