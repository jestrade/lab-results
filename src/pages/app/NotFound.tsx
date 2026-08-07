import { ButtonLink } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { useT } from '@/i18n/useI18n';

export function NotFound() {
  const t = useT();

  return (
    <div style={{ padding: '64px 24px' }}>
      <EmptyState
        icon="compass"
        title={t('notFound.title')}
        action={
          <ButtonLink to="/" variant="primary">
            {t('notFound.back')}
          </ButtonLink>
        }
      >
        {t('notFound.body')}
      </EmptyState>
    </div>
  );
}
