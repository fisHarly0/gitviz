export default function Icon({ name, size = 18 }) {
  const paths = {
    tree: <><path d="M6 3v12a4 4 0 0 0 4 4h7M6 9h8a4 4 0 0 0 4-4V3"/><circle cx="6" cy="3" r="2"/><circle cx="18" cy="3" r="2"/><circle cx="18" cy="19" r="2"/></>,
    target: <><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
    compare: <><path d="M7 3v18m10-18v18M3 7l4-4 4 4m2 10 4 4 4-4"/></>,
    refresh: <><path d="M20 7a9 9 0 1 0 1 8M20 3v5h-5"/></>,
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    minus: <path d="M5 12h14"/>,
    fit: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>,
    back: <path d="m10 5-7 7 7 7M3 12h10a7 7 0 0 1 7 7"/>,
    arrow: <path d="m9 5 7 7-7 7"/>,
    folder: <path d="M3 7V4h7l2 3h9v13H3Z"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    check: <path d="m4 12 5 5L20 6"/>,
    fork: <><path d="M6 4v16m12-16v4c0 5-12 3-12 8"/><circle cx="6" cy="4" r="2"/><circle cx="18" cy="4" r="2"/><circle cx="6" cy="20" r="2"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.tree}</svg>
}
