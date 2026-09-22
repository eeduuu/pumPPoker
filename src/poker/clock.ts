export type ClockSample={elapsed:number;last:number};

export function sampleClock(sample:ClockSample,now:number,limit=Number.POSITIVE_INFINITY):ClockSample{
 const delta=Math.max(0,now-sample.last);
 return {
  elapsed:Math.min(limit,sample.elapsed+delta),
  last:now,
 };
}
