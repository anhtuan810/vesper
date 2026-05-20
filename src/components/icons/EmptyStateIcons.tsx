type IconProps = { size?: number };

function Ico({ d, size = 16, extra }: { d: React.ReactNode; size?: number; extra?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={extra}
      style={{ width: size, height: size, flexShrink: 0 }}
      aria-hidden
    >
      {d}
    </svg>
  );
}

export function LockIcon({ size }: IconProps) {
  return (
    <Ico size={size} d={<>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>} />
  );
}

export function ImageIcon({ size }: IconProps) {
  return (
    <Ico size={size} d={<>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </>} />
  );
}

export function PaperclipIcon({ size }: IconProps) {
  return (
    <Ico size={size} d={
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    } />
  );
}

export function ArrowUpIcon({ size }: IconProps) {
  return (
    <Ico size={size} d={<>
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </>} />
  );
}

export function QuoteIcon({ size }: IconProps) {
  return (
    <Ico size={size} d={<>
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
    </>} />
  );
}

export function FileSpreadsheetIcon({ size }: IconProps) {
  return (
    <Ico size={size} d={<>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M8 13h2" />
      <path d="M14 13h2" />
      <path d="M8 17h2" />
      <path d="M14 17h2" />
    </>} />
  );
}

export function CameraIcon({ size }: IconProps) {
  return (
    <Ico size={size} d={<>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </>} />
  );
}
