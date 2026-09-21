export type ClockSample={elapsed:number;last:number;wasVisible:boolean};

export function sampleClock(sample:ClockSample,now:number,isVisible:boolean,duration:number):ClockSample{
 const delta=Math.max(0,now-sample.last);
 return {
  elapsed:sample.wasVisible?Math.min(duration,sample.elapsed+delta):sample.elapsed,
  last:now,
  wasVisible:isVisible,
 };
}
