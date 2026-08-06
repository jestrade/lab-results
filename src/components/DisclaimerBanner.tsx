import { Link } from 'react-router-dom';

import {
  MEDICAL_DISCLAIMER_BY_LOCALE,
  MEDICAL_DISCLAIMER_SHORT_BY_LOCALE,
} from '@/domain/disclaimers';
import { useI18n } from '@/i18n/useI18n';
import { Icon } from './Icon';

export interface DisclaimerBannerProps {
  /**
   * `short` is the in-app banner: the abbreviated wording plus a link to the
   * full text. `full` prints §26 verbatim and is what the public pages use,
   * where there is room and where the user has not yet agreed to anything.
   */
  variant?: 'short' | 'full';
}

/**
 * The disclaimer is one of the few things in this app that has to be readable
 * to do its job at all — a warning about what the product is not, printed in a
 * language the reader does not have, warns nobody. So it follows the chosen
 * locale rather than staying in English. See the note in `@/domain/disclaimers`
 * about the Spanish wording still being pending legal review.
 */
export function DisclaimerBanner({ variant = 'short' }: DisclaimerBannerProps) {
  const { locale, t } = useI18n();

  if (variant === 'full') {
    return (
      <aside className="disclaimer-strong" aria-labelledby="disclaimer-heading">
        <Icon name="shield-warning" size={26} className="alert-icon" />
        <div>
          <div id="disclaimer-heading" style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>
            {t('disclaimer.whatThisIsNot')}
          </div>
          <p>{MEDICAL_DISCLAIMER_BY_LOCALE[locale]}</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="disclaimer-banner" aria-label={t('disclaimer.bannerLabel')}>
      <Icon name="info" className="alert-icon" />
      <p>
        {MEDICAL_DISCLAIMER_SHORT_BY_LOCALE[locale]}{' '}
        <Link to="/legal/medical-disclaimer" style={{ whiteSpace: 'nowrap' }}>
          {t('disclaimer.readFull')}
        </Link>
      </p>
    </aside>
  );
}
