export const REGIONS=['North','South','East','West','Central','Perry'] as const;
export function normalizeRegion(value:unknown){
 const text=typeof value==='string'?value.trim():'';
 return REGIONS.find(region=>region.toLowerCase()===text.toLowerCase())||text;
}
