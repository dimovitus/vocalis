interface EmptyStateProps {
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-state-icon" aria-hidden>
        ◌
      </div>
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      {action ? (
        <button type="button" className="primary" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
