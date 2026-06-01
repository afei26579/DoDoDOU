type LoadingOverlayProps = {
  open?: boolean;
  title: string;
  message?: string;
  scope?: 'page' | 'modal';
};

const beadSlots = Array.from({ length: 8 }, (_, index) => index);

export function LoadingOverlay({ open = true, title, message, scope = 'page' }: LoadingOverlayProps) {
  if (!open) return null;

  return (
    <div className={`app-loading-overlay app-loading-overlay--${scope}`} role="status" aria-live="polite" aria-busy="true">
      <div className="app-loading-overlay__card">
        <div className="app-loading-overlay__beads" aria-hidden="true">
          {beadSlots.map((slot) => (
            <span key={slot} className="app-loading-overlay__bead" />
          ))}
        </div>
        <div className="app-loading-overlay__copy">
          <span className="app-loading-overlay__eyebrow">LOADING</span>
          <strong>{title}</strong>
          {message ? <p>{message}</p> : null}
        </div>
        <div className="app-loading-overlay__bar" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  );
}
