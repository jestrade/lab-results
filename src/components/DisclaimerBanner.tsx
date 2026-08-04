import { Link } from 'react-router-dom';

import { MEDICAL_DISCLAIMER, MEDICAL_DISCLAIMER_SHORT } from '@/domain/disclaimers';
import { Icon } from './Icon';

export interface DisclaimerBannerProps {
  /**
   * `short` is the in-app banner: the abbreviated wording plus a link to the
   * full text. `full` prints §26 verbatim and is what the public pages use,
   * where there is room and where the user has not yet agreed to anything.
   */
  variant?: 'short' | 'full';
}

export function DisclaimerBanner({ variant = 'short' }: DisclaimerBannerProps) {
  if (variant === 'full') {
    return (
      <aside className="disclaimer-strong" aria-labelledby="disclaimer-heading">
        <Icon name="shield-warning" size={26} className="alert-icon" />
        <div>
          <div id="disclaimer-heading" style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>
            What this is not
          </div>
          <p>{MEDICAL_DISCLAIMER}</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="disclaimer-banner" aria-label="Medical disclaimer">
      <Icon name="info" className="alert-icon" />
      <p>
        {MEDICAL_DISCLAIMER_SHORT}{' '}
        <Link to="/legal/medical-disclaimer" style={{ whiteSpace: 'nowrap' }}>
          Read the full disclaimer
        </Link>
      </p>
    </aside>
  );
}
