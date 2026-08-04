import type { CSSProperties, ReactNode } from 'react';

export interface CardProps {
  kicker?: string;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  style?: CSSProperties;
  elevation?: 'sm' | 'md' | 'lg' | 'none';
}

export function Card({
  kicker,
  title,
  children,
  footer,
  className,
  style,
  elevation = 'none',
}: CardProps) {
  const classes = ['card', elevation === 'none' ? '' : `elev-${elevation}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={classes} style={style}>
      {kicker ? <div className="card-kicker">{kicker}</div> : null}
      {title ? <div className="card-title">{title}</div> : null}
      {children}
      {footer ? <div className="card-meta">{footer}</div> : null}
    </section>
  );
}
