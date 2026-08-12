const STATUS_MAP = {
  draft:            'badge-draft',
  published:        'badge-published',
  RUNNING:          'badge-running',
  WAITING_APPROVAL: 'badge-waiting',
  COMPLETED:        'badge-completed',
  FAILED:           'badge-failed',
  CANCELLED:        'badge-cancelled',
  PENDING:          'badge-pending',
  APPROVED:         'badge-approved',
  REJECTED:         'badge-rejected',
  success:          'badge-completed',
  failed:           'badge-failed',
  retrying:         'badge-waiting',
  pending:          'badge-pending',
  skipped:          'badge-cancelled',
}

const STATUS_LABELS = {
  RUNNING:          'Running',
  WAITING_APPROVAL: 'Approval',
  COMPLETED:        'Done',
  FAILED:           'Failed',
  CANCELLED:        'Cancelled',
  PENDING:          'Pending',
  APPROVED:         'Approved',
  REJECTED:         'Rejected',
  success:          'OK',
  failed:           'Error',
  retrying:         'Retrying',
  pending:          'Pending',
  skipped:          'Skipped',
}

export default function StatusBadge({ status }) {
  const cls = STATUS_MAP[status] || 'badge bg-zinc-800/50 text-zinc-400 border border-zinc-700/40'
  const label = STATUS_LABELS[status] || status
  return (
    <span className={cls}>
      {label}
    </span>
  )
}
