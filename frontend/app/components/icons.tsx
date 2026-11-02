/**
 * Shared stroke icons (24px grid, round caps/joins) so every icon in the
 * app shares one visual language. All are decorative: the control that
 * holds them carries the accessible name.
 */

type IconProps = { className?: string; strokeWidth?: number };

function Icon({
  className,
  strokeWidth = 2,
  d,
}: IconProps & { d: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d={d}
      />
    </svg>
  );
}

export const CloseIcon = (p: IconProps) => <Icon {...p} d="M6 18L18 6M6 6l12 12" />;

export const CheckIcon = (p: IconProps) => <Icon {...p} d="M5 13l4 4L19 7" />;

export const SearchIcon = (p: IconProps) => (
  <Icon {...p} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
);

export const BackIcon = (p: IconProps) => <Icon {...p} d="M15 19l-7-7 7-7" />;

export const ImageIcon = (p: IconProps) => (
  <Icon
    {...p}
    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
  />
);

export const AlertIcon = (p: IconProps) => (
  <Icon
    {...p}
    d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
  />
);

export const ExternalIcon = (p: IconProps) => (
  <Icon {...p} d="M14 4h6m0 0v6m0-6L10 14M18 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h4" />
);

export const ChevronIcon = (p: IconProps) => <Icon {...p} d="M9 5l7 7-7 7" />;
