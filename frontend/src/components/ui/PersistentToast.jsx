export default function PersistentToast({
  open,
  title,
  message,
  onClose,

  // ✅ NEW: click whole toast (ex: navigate to case chat)
  onClick,

  // ✅ NEW: optional action button (ex: "Open chat")
  actionLabel,
  onAction,
}) {
  if (!open) return null;

  return (
    <div className="fixed top-5 right-5 z-50 w-[360px]">
      <div
        className={[
          "border border-amber-400/40 bg-amber-500/15 backdrop-blur rounded-xl shadow-lg p-4",
          onClick ? "cursor-pointer hover:bg-amber-500/20" : "",
        ].join(" ")}
        onClick={() => onClick?.()}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={(e) => {
          if (!onClick) return;
          if (e.key === "Enter" || e.key === " ") onClick();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="text-amber-200 font-semibold text-sm">{title}</div>

            {message ? (
              <div className="text-slate-200 text-sm mt-1 leading-snug">
                {message}
              </div>
            ) : null}

            {/* ✅ optional action button */}
            {actionLabel && onAction ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation(); // ✅ don’t trigger toast onClick
                    onAction();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold"
                >
                  {actionLabel}
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation(); // ✅ don’t trigger toast onClick
              onClose?.();
            }}
            className="text-amber-200 hover:text-white rounded px-2"
            aria-label="Close notification"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
