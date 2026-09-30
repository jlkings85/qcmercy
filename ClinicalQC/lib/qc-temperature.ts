import {temperatureStatements} from './temperature-server';
import {Problem} from './server';
import type {TemperatureSettings} from './temperature-settings';
type R=Record<string,any>;
export function qcTemperature(input:any,truck:R,actor:R,day:string,id:string,settings:TemperatureSettings,parent?:R){
 if(parent){
  const previous=parent.snapshot,temperature=previous.temperature||null;
  const sourceQcRecordId=temperature?.qcRecordId||previous.temperatureCapture?.sourceQcRecordId||parent.id;
  return {snapshot:temperature,statements:[],capture:{mode:temperature?'reused':'repeat_without_temperature',sourceQcRecordId,sourceTemperatureRecordId:temperature?(previous.temperatureCapture?.sourceTemperatureRecordId||sourceQcRecordId+'-temperature'):null,observedDate:temperature?.observedDate||null,settingsRevision:settings.revision}};
 }
 if(!settings.qcEnabled)return {snapshot:null,statements:[],capture:{mode:'disabled',settingsRevision:settings.revision}};
 if(!input)throw new Problem('Enter the daily high, low, and current temperatures.');
 const built=temperatureStatements(input,truck,actor,day,id,id+'-temperature');
 return {...built,capture:{mode:'recorded',sourceQcRecordId:id,sourceTemperatureRecordId:id+'-temperature',observedDate:day,settingsRevision:settings.revision}};
}
