import { ButtonLink } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';

export function NotFound() {
  return (
    <div style={{ padding: '64px 24px' }}>
      <EmptyState
        icon="compass"
        title="That page does not exist"
        action={
          <ButtonLink to="/" variant="primary">
            Back to the start
          </ButtonLink>
        }
      >
        The link may be out of date, or the page may have moved.
      </EmptyState>
    </div>
  );
}
