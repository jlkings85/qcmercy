export const REVIEW_DECISIONS = [
  'Supervisor remediated',
  'Reading entered in error',
  'Remedial education assigned',
  'Repeat QC completed within range',
  'Supplies replaced',
  'Device removed from service',
  'Further review required',
  'Other',
] as const;

export function reviewNotes(decision: unknown, comments: unknown): string {
  if (typeof decision !== 'string' || !(REVIEW_DECISIONS as readonly string[]).includes(decision)) {
    throw new Error('Select a decision.');
  }
  if (comments != null && typeof comments !== 'string') throw new Error('Enter valid comments.');
  const text = typeof comments === 'string' ? comments.trim() : '';
  if (text.length > 2000) throw new Error('Comments must be 2,000 characters or fewer.');
  if (decision === 'Other' && !text) throw new Error('Comments are required when selecting Other.');
  return text ? `${decision}\n\n${text}` : decision;
}
