export default function PageShell({
  title,
  subtitle,
  children,
  maxWidth = "max-w-5xl",
  contentClassName = "",
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className={`mx-auto w-full px-4 py-6 ${maxWidth}`}>
        {(title || subtitle) && (
          <div className="mb-5 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            {title && <h1 className="text-2xl font-bold">{title}</h1>}
            {subtitle && (
              <p className="mt-1 text-sm text-slate-300">{subtitle}</p>
            )}
          </div>
        )}
        <div className={contentClassName}>{children}</div>
      </div>
    </div>
  );
}
