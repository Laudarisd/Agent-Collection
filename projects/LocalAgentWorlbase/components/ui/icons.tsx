import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function IconBase({ size = 20, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const PlusIcon = (props: IconProps) => <IconBase {...props}><path d="M12 5v14M5 12h14" /></IconBase>;
export const SearchIcon = (props: IconProps) => <IconBase {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.4-3.4" /></IconBase>;
export const SettingsIcon = (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.2 19.3a1.7 1.7 0 0 0-1.8.4l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2v-4h.3A1.7 1.7 0 0 0 4 8.2a1.7 1.7 0 0 0-.4-1.8l-.06-.06L6.37 3.5l.06.06A1.7 1.7 0 0 0 8.3 4a1.7 1.7 0 0 0 1-.6A1.7 1.7 0 0 0 9.7 2H14v.3A1.7 1.7 0 0 0 15.4 4a1.7 1.7 0 0 0 1.8-.4l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.6 8a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.3v4h-.3A1.7 1.7 0 0 0 19.4 15Z" /></IconBase>;
export const KeyIcon = (props: IconProps) => <IconBase {...props}><circle cx="7.5" cy="15.5" r="3.5" /><path d="m10.3 13 8.2-8.2 1.7 1.7-1.6 1.6 1.2 1.2-2.1 2.1-1.2-1.2-4 4" /></IconBase>;
export const CpuIcon = (props: IconProps) => <IconBase {...props}><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" /><rect x="10" y="10" width="4" height="4" /></IconBase>;
export const MenuIcon = (props: IconProps) => <IconBase {...props}><path d="M4 7h16M4 12h16M4 17h16" /></IconBase>;
export const CloseIcon = (props: IconProps) => <IconBase {...props}><path d="m6 6 12 12M18 6 6 18" /></IconBase>;
export const SendIcon = (props: IconProps) => <IconBase {...props}><path d="m4 12 16-8-6.5 16-2.2-6.3L4 12Z" /><path d="m11.3 13.7 3.8-3.8" /></IconBase>;
export const StopIcon = (props: IconProps) => <IconBase {...props}><rect x="7" y="7" width="10" height="10" rx="1" /></IconBase>;
export const PaperclipIcon = (props: IconProps) => <IconBase {...props}><path d="m20.5 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 1 1-2.8-2.8l8.2-8.2" /></IconBase>;
export const CopyIcon = (props: IconProps) => <IconBase {...props}><rect x="9" y="9" width="10" height="10" rx="2" /><path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /></IconBase>;
export const EditIcon = (props: IconProps) => <IconBase {...props}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></IconBase>;
export const RefreshIcon = (props: IconProps) => <IconBase {...props}><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 8a7 7 0 0 1 11.8-2L20 12M4 12l2.1 4a7 7 0 0 0 11.8 0" /></IconBase>;
export const TrashIcon = (props: IconProps) => <IconBase {...props}><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></IconBase>;
export const MoreIcon = (props: IconProps) => <IconBase {...props}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></IconBase>;
export const ChevronDownIcon = (props: IconProps) => <IconBase {...props}><path d="m7 10 5 5 5-5" /></IconBase>;
export const CheckIcon = (props: IconProps) => <IconBase {...props}><path d="m5 12 4 4L19 6" /></IconBase>;
export const ImageIcon = (props: IconProps) => <IconBase {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></IconBase>;
export const FileIcon = (props: IconProps) => <IconBase {...props}><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5" /></IconBase>;
export const SunIcon = (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></IconBase>;
export const MoonIcon = (props: IconProps) => <IconBase {...props}><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" /></IconBase>;

export const DashboardIcon = (props: IconProps) => <IconBase {...props}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></IconBase>;
export const BuildingIcon = (props: IconProps) => <IconBase {...props}><path d="M4 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" /><path d="M16 9h3a1 1 0 0 1 1 1v11M8 7h4M8 11h4M8 15h4M8 19h4M3 21h18" /></IconBase>;
export const ActivityIcon = (props: IconProps) => <IconBase {...props}><path d="M3 12h4l2-6 4 12 2-6h6" /></IconBase>;
export const ChatIcon = (props: IconProps) => <IconBase {...props}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /></IconBase>;
export const GlobeIcon = (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></IconBase>;
export const ExternalIcon = (props: IconProps) => <IconBase {...props}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></IconBase>;
export const ArrowRightIcon = (props: IconProps) => <IconBase {...props}><path d="M5 12h14M14 7l5 5-5 5" /></IconBase>;
