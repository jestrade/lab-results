import { ButtonLink } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';

export interface ComingSoonProps {
  title: string;
  kicker: string;
  /** The ticket that builds this screen, shown so the gap is traceable. */
  ticket: string;
  description: string;
  icon?: string;
}

/**
 * A placeholder for a screen a later phase builds.
 *
 * Every item in the navigation resolves to something — a route that 404s or a
 * link that goes nowhere reads as a bug rather than as unbuilt scope. Naming
 * the ticket keeps the gap honest and traceable back to the board.
 */
export function ComingSoon({ title, kicker, ticket, description, icon = 'compass' }: ComingSoonProps) {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{kicker}</div>
          <h1>{title}</h1>
        </div>
      </div>

      <EmptyState
        icon={icon}
        title="Not built yet"
        action={
          <ButtonLink to="/upload" variant="secondary" icon="upload-simple">
            Upload a report
          </ButtonLink>
        }
      >
        {description} This screen is built by {ticket}.
      </EmptyState>
    </>
  );
}
