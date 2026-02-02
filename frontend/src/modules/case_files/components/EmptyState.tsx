type EmptyStateProps = {
  title: string;
  description?: string;
  actionText?: string;
};

export default function EmptyState({ title, description, actionText }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed bg-white p-5 text-center">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>

      {description ? <p className="mt-1 text-sm text-gray-600">{description}</p> : null}

      {actionText ? <p className="mt-3 text-sm text-gray-500">{actionText}</p> : null}
    </div>
  );
}
