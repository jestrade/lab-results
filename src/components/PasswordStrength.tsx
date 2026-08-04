import { PASSWORD_ADVICE, scorePassword } from './password';

export function PasswordStrength({ password }: { password: string }) {
  const score = scorePassword(password);

  return (
    <>
      <div className="password-meter" aria-hidden="true">
        {[1, 2, 3, 4].map((segment) => (
          <div key={segment} className="password-meter-seg" data-filled={segment <= score} />
        ))}
      </div>
      {/* The bars are decorative; this sentence is the real feedback, and it is
          what a screen reader announces as the user types. */}
      <div style={{ fontSize: 12, marginTop: 5 }} className="muted" aria-live="polite">
        {PASSWORD_ADVICE[score]}
      </div>
    </>
  );
}
