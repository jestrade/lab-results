/**
 * Phosphor duotone icon (KAN-38).
 *
 * Icons in this app are always decorative: every one of them sits next to text
 * that says the same thing, which is the rule that keeps status readable
 * without colour or sight. So the default is `aria-hidden` — pass a `title`
 * only for the rare icon that genuinely carries meaning alone.
 */
export interface IconProps {
  /** Phosphor name without the weight prefix, e.g. `check-circle`. */
  name: string;
  size?: number | string;
  className?: string;
  title?: string;
  spin?: boolean;
}

export function Icon({ name, size = '1em', className, title, spin = false }: IconProps) {
  const normalized = name.startsWith('ph-') ? name : `ph-${name}`;
  const classes = ['ph-duotone', normalized, spin ? 'spinner' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <i
      className={classes}
      style={{ fontSize: size }}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
    />
  );
}
