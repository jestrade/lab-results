import { Icon } from './Icon';

export type StepState = 'complete' | 'current' | 'pending' | 'failed';

export interface Step {
  label: string;
  detail?: string;
  state: StepState;
}

/**
 * Processing progress (KAN-42).
 *
 * An ordered list, because that is what it is — the visual rules are decoration
 * over real list semantics. Each step's state is spelled out in text for
 * assistive tech rather than being carried by the rule's colour alone.
 */
export function StepIndicator({ steps, label }: { steps: Step[]; label: string }) {
  return (
    <ol className="steps" aria-label={label} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {steps.map((step, index) => (
        <li
          key={step.label}
          className="step"
          data-state={step.state}
          aria-current={step.state === 'current' ? 'step' : undefined}
        >
          <div className="step-rule" />
          <div className="step-label">
            {index + 1} · {step.label}
            <span className="sr-only">
              {' '}
              — {step.state === 'complete' ? 'done' : step.state}
            </span>
          </div>
          {step.detail ? (
            <div className="step-detail">
              {step.state === 'current' ? <Icon name="circle-notch" size={12} spin /> : null}{' '}
              {step.detail}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
