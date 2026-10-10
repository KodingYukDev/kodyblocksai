/** Ikon garis sederhana buatan sendiri (24x24, currentColor). */
import type { ReactElement } from "react";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Svg({ children, size = 20 }: { children: ReactElement | ReactElement[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const IconSearch = () => (
  <Svg>
    <circle cx="10.5" cy="10.5" r="6" {...P} />
    <path d="M15 15l5 5" {...P} />
  </Svg>
);
export const IconBrush = () => (
  <Svg>
    <path d="M14 4l6 6-8 8-6-6z" {...P} />
    <path d="M6 12l-2 6 6-2" {...P} />
  </Svg>
);
export const IconUpload = () => (
  <Svg>
    <path d="M12 16V4M7 9l5-5 5 5M4 20h16" {...P} />
  </Svg>
);
export const IconCamera = () => (
  <Svg>
    <rect x="3" y="7" width="18" height="13" rx="2" {...P} />
    <circle cx="12" cy="13.5" r="3.5" {...P} />
    <path d="M8 7l2-3h4l2 3" {...P} />
  </Svg>
);
export const IconSurprise = () => (
  <Svg>
    <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.3l6-.7z" {...P} />
  </Svg>
);
export const IconMic = () => (
  <Svg>
    <rect x="9" y="3" width="6" height="11" rx="3" {...P} />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" {...P} />
  </Svg>
);
export const IconPlus = ({ size = 28 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M12 5v14M5 12h14" {...P} strokeWidth={3} />
  </Svg>
);
export const IconClose = () => (
  <Svg size={14}>
    <path d="M6 6l12 12M18 6L6 18" {...P} strokeWidth={3} />
  </Svg>
);
export const IconPlay = () => (
  <Svg>
    <path d="M7 4l13 8-13 8z" fill="currentColor" />
  </Svg>
);
export const IconStop = () => (
  <Svg>
    <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" />
  </Svg>
);
export const IconUndo = () => (
  <Svg>
    <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" {...P} />
  </Svg>
);
export const IconRedo = () => (
  <Svg>
    <path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" {...P} />
  </Svg>
);
export const IconSound = () => (
  <Svg size={32}>
    <path d="M4 9h4l5-4v14l-5-4H4z" {...P} />
    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" {...P} />
  </Svg>
);
