/** Ikon SVG inline buatan sendiri (bentuk mengikuti bahasa visual Scratch, bukan salinan aset). */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

export const GreenFlagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 2.5v15" stroke="#45993d" strokeWidth="1.8" strokeLinecap="round" />
    <path
      d="M4.8 3.6c3.4-2 6 1.6 10.6-.4v8.4c-4.6 2-7.2-1.6-10.6.4z"
      fill="#4cbf56"
      stroke="#45993d"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </Svg>
);

export const StopIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 2h6l5 5v6l-5 5H7l-5-5V7z" fill="#ec5959" stroke="#b84848" strokeWidth="1.2" strokeLinejoin="round" />
  </Svg>
);

export const SmallStageIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="4" width="7" height="12" rx="1.5" fill="currentColor" />
    <rect x="10.5" y="4" width="7.5" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
  </Svg>
);

export const LargeStageIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="4" width="4.5" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <rect x="8" y="4" width="10" height="12" rx="1.5" fill="currentColor" />
  </Svg>
);

export const FullscreenIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const UnfullscreenIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      d="M7 3v4H3M17 7h-4V3M13 17v-4h4M3 13h4v4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const EyeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M1.5 10S5 4.5 10 4.5 18.5 10 18.5 10 15 15.5 10 15.5 1.5 10 1.5 10z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="10" cy="10" r="2.6" fill="currentColor" />
  </Svg>
);

export const EyeOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M1.5 10S5 4.5 10 4.5 18.5 10 18.5 10 15 15.5 10 15.5 1.5 10 1.5 10z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M3 17L17 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </Svg>
);

export const AllAroundIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15.5 6.5A6.5 6.5 0 1 0 16.5 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M16.8 2.8l-.6 4.4-4.3-.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const LeftRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 10h15M6 6.5 2.5 10 6 13.5M14 6.5l3.5 3.5-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const DontRotateIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M5 15 15 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

export const CatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      d="M4 8.5 3.5 3l4 2.6a7 7 0 0 1 5 0L16.5 3 16 8.5c.7 1 1 2 1 3.2 0 3.3-3.1 5.3-7 5.3s-7-2-7-5.3c0-1.2.3-2.2 1-3.2z"
      fill="currentColor"
    />
  </Svg>
);

export const BackdropIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="3.5" width="16" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3 15l4.5-5 3 3 2-2 4.5 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="13.5" cy="7.5" r="1.5" fill="currentColor" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M12.6 12.6 17 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </Svg>
);

export const PaintIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.5 2.5 17.5 6.5 8 16l-4.5.5L4 12z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M11.5 4.5l4 4" stroke="currentColor" strokeWidth="1.7" />
  </Svg>
);

export const UploadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 13V3M6 7l4-4 4 4M3.5 13v3.5h13V13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const SurpriseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.8l5-.7z" fill="currentColor" />
  </Svg>
);

export const CaretIcon = (p: IconProps) => (
  <Svg size={10} viewBox="0 0 10 10" {...p}>
    <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const GlobeIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2.5 10h15M10 2.5c2.2 2.2 2.2 12.8 0 15M10 2.5c-2.2 2.2-2.2 12.8 0 15" fill="none" stroke="currentColor" strokeWidth="1.3" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </Svg>
);

export const CodeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 5 2.5 10 7 15M13 5l4.5 5-4.5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const BrushIcon = PaintIcon;

export const SoundIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7.5h3l4-3.5v12l-4-3.5H3z" fill="currentColor" />
    <path d="M13 7a4 4 0 0 1 0 6M15.2 4.8a7 7 0 0 1 0 10.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const KeyboardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="1.5" y="5" width="17" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M4.5 8h1M8 8h1M11.5 8h1M15 8h.5M4.5 11h1M6.5 12h7M15 11h.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

/** Panah segitiga; `dir` memutar ke atas/bawah/kiri/kanan. */
export const ArrowIcon = ({ dir = "up", ...p }: IconProps & { dir?: "up" | "down" | "left" | "right" }) => {
  const rot = { up: 0, right: 90, down: 180, left: 270 }[dir];
  return (
    <Svg {...p}>
      <path d="M10 4l6 9H4z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" transform={`rotate(${rot} 10 10)`} />
    </Svg>
  );
};

export const SparkleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 2l1.6 4.4L15 8l-4.4 1.6L9 14l-1.6-4.4L3 8l4.4-1.6z" fill="currentColor" />
    <path d="M15.5 12.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" fill="currentColor" />
  </Svg>
);

export const FileIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 2.5h6.5L15.5 6.5V17a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M11.5 2.5v4h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </Svg>
);
