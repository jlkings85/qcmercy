type Asset={id?:string;label?:string};
// Stable inventory IDs preserve this policy when display names are edited.
const GREENE_COUNTY='4247bc0a-7403-4c3e-ae6b-1909ad27796b';
const VEHICLE_3101='6cc6f543-d536-41bd-88ce-34cae2b38528';
export function qcTemperatureExempt(department?:Asset,truck?:Asset){
 return department?.id===GREENE_COUNTY&&!!truck?.id&&truck.id!==VEHICLE_3101&&truck.label?.trim()!=='3101';
}
