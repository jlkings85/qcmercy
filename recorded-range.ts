type SavedRange={min?:number|null,max?:number|null,units?:string|null};
// A recorded range remains valid display data when the source omitted its units.
// Never substitute current defaults for a historical record's saved limits.
export function recordedRange(range?:SavedRange|null){
 if(range?.min==null||range.max==null)return 'Not recorded';
 const units=range.units?.trim();
 return `${range.min}–${range.max}${units?' '+units:''}`;
}
