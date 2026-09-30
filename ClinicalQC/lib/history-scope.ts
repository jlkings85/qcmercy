export const historicalScopeLabel='Neonatal Transport Team and all Lifeline departments are excluded from historical imports.';
export function excludedHistoricalDepartment(value:string){return /^(?:neonatal\b|life\s*line\b|ll\s*\d+\b)/i.test(value.trim())}
