// 24 px grid, 1.75 px round stroke. Legacy Tap Test icons (Tap Testing/icons/svg) plus new ones from the icon artboard.

const P = {
  stability: <><path d="M3.5 3.5v17h17" /><path d="M5.5 5.5Q6.75 13 8.25 7.5Q10.25 15 12.75 7Q15.75 16.5 20 5" /><circle cx="15" cy="16.5" r="1.4" fill="currentColor" stroke="none" /></>,
  dynamics: <><path d="M3.5 3.5v17h17" /><path d="M5.5 17C8.5 17 10.5 15.5 11.75 10C12.3 7.5 12.6 5.5 13.25 5.5C13.9 5.5 14.2 7.5 14.75 10C16 15.5 17.5 17 20 17" /><circle cx="7.75" cy="13.75" r="1.1" fill="currentColor" stroke="none" /><circle cx="10.25" cy="11.25" r="1.1" fill="currentColor" stroke="none" /><circle cx="16.25" cy="11.25" r="1.1" fill="currentColor" stroke="none" /><circle cx="18.75" cy="13.75" r="1.1" fill="currentColor" stroke="none" /></>,
  tool: <><path d="M9 11V3.75Q9 2.5 10.25 2.5h3.5Q15 2.5 15 3.75V11" /><path d="M9 11h6" /><path d="M9 11v9.75q0 .75.75.75h4.5q.75 0 .75-.75V11" /><path d="M9 14.25c2.25-.25 4.25-1.25 6-3" /><path d="M9 17.75c2.25-.25 4.25-1.25 6-3" /><path d="M10.25 21.5c1.75-.5 3.5-1.5 4.75-3.25" /></>,
  time: <><path d="M3.5 3.5v17h17" /><path d="M5.5 17c1.5-2 2.75-7 3.5-10v10h1.5c1.5-2 2.75-7 3.5-10v10h1.5c1.5-2 2.75-7 3.5-10v10h1" /></>,
  measure: <path d="M3 12c.75-9.33 1.5-9.33 2.25 0c.75 7.2 1.5 7.2 2.25 0c.75-5.47 1.5-5.47 2.25 0c.75 4.13 1.5 4.13 2.25 0c.75-3.07 1.5-3.07 2.25 0c.75 2.13 1.5 2.13 2.25 0c.75-1.47 1.5-1.47 2.25 0c.75 .93 1.5 .93 2.25 0" />,
  settings: <><path d="M4 6h9M17 6h3" /><circle cx="15" cy="6" r="2" /><path d="M4 12h2M10 12h10" /><circle cx="8" cy="12" r="2" /><path d="M4 18h7M15 18h5" /><circle cx="13" cy="18" r="2" /></>,
  export: <><path d="M12 15V3.5" /><path d="M7.5 8L12 3.5 16.5 8" /><path d="M4 14.5v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
  save: <><path d="M5 3.5h11l3.5 3.5v12.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z" /><path d="M8 3.5v4.5h7V3.5" /><path d="M7.5 20.5v-6h9v6" /></>,
  run: <path d="M7.5 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8a1 1 0 0 0-1.5.86z" />,
  pause: <><path d="M8 5v14" /><path d="M16 5v14" /></>,
  part: <><path d="M12 4l8 4-8 4-8-4z" /><path d="M4 8v8l8 4 8-4V8" /><path d="M12 12v8" /><ellipse cx="12" cy="8" rx="2.6" ry="1.3" /></>,
  import: <><path d="M12 3.5V15" /><path d="M7.5 10.5L12 15l4.5-4.5" /><path d="M4 14.5v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
  home: <><path d="M3.5 10.5L12 3.5l8.5 7" /><path d="M5.5 9v11h13V9" /><path d="M10 20v-5.5h4V20" /></>,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.25-1 .8-1 1.45v.65" /><circle cx="12" cy="16.75" r="1" fill="currentColor" stroke="none" /></>,
  sensor: <><rect x="4.5" y="9.5" width="9" height="7.5" rx="1.5" /><path d="M13.5 13.25h2.5c2 0 3-1 3-3V4" /><path d="M9 9.5V3.5M7 5.5l2-2 2 2" /><path d="M4 20.5h10" /><path d="M9 17v3.5" /></>,
  force: <><path d="M3 20h18" /><path d="M5 5l8.5 8.5" /><path d="M14 8.5v5.5H8.5" /></>,
  cut: <><path d="M3 20h18V10h-7v4H3z" /><path d="M3 6h7M8 4l2 2-2 2" /></>,
  group: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
  grid: <><path d="M3.5 3.5v17h17" /><circle cx="7.5" cy="16.5" r="1.2" /><circle cx="7.5" cy="12.5" r="1.2" /><circle cx="12" cy="16.5" r="1.2" /><circle cx="12" cy="12.5" r="1.2" /><circle cx="12" cy="8.5" r="1.2" /><circle cx="16.5" cy="16.5" r="1.2" /><circle cx="16.5" cy="12.5" r="1.2" /><circle cx="16.5" cy="8.5" r="1.2" /><circle cx="16.5" cy="4.5" r="1.2" /></>,
  spectrum: <><path d="M3.5 20.5h17" /><path d="M6.5 20.5v-4M9.5 20.5v-10M12.5 20.5v-6M15.5 20.5v-14M18.5 20.5v-3" /></>,
  sound: <><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></>,
  teeth: <><circle cx="12" cy="12" r="6.5" /><path d="M12 5.5V2.5M18.5 12h3M12 18.5v3M5.5 12h-3" /></>,
  varpitch: <><circle cx="12" cy="12" r="6.5" /><path d="M12 5.5V2.5M18.4 13.1l3 .5M12.6 18.5l.3 3M5.5 12h-3" /></>,
  runout: <><circle cx="12" cy="12" r="7" stroke-dasharray="2 2.5" /><circle cx="13.5" cy="11" r="7" /></>,
  damping: <path d="M2 12c1.5-8 3-8 4.5 0s2.5 5 3.5 0 2-3.5 3 0 1.5 2 2.5 0 1-1 1.5 0H22" />,
  noise: <path d="M2 12h3l1.5-4 2 8 2-10 2 12 2-8 1.5 4 1-2h6" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>,
  check: <path d="M5 12l5 5 9-10" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
};

export function Icon({ name, size = 20, color = 'currentColor', stroke = 1.75, label, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} color={color} stroke-width={stroke}
      stroke-linecap="round" stroke-linejoin="round" style={style}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}>
      {P[name]}
    </svg>
  );
}
