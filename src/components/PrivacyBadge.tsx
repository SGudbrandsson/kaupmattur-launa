import { copy } from "../copy";

function LockIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="10" rx="2.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function PrivacyBadge() {
  const { badge, detail, howTitle, howBody } = copy.privacy;
  return (
    <section class="privacy rise rise-2">
      <span class="privacy-pill">
        <LockIcon />
        {badge}
      </span>
      <p class="privacy-detail">{detail}</p>
      <details>
        <summary>{howTitle}</summary>
        <p>{howBody}</p>
      </details>
    </section>
  );
}
