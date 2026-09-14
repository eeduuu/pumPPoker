export type BlindLevel={number:number;small:number;big:number};
export function breakDue(mode:'normal'|'tournament',enabled:boolean,every:number,finishedLevel:number,nextLevel:number){
 return mode==='tournament'&&enabled&&Number.isInteger(every)&&every>0&&nextLevel>finishedLevel&&finishedLevel%every===0;
}
export function nextBlindLevel(level:BlindLevel,elapsedMs:number,durationMs:number,enabled:boolean):BlindLevel{
 if(!enabled||elapsedMs<durationMs)return level;
 if(!Number.isFinite(durationMs)||durationMs<=0||!Number.isSafeInteger(level.big*2))throw new RangeError('Nivel inválido');
 return {number:level.number+1,small:level.small*2,big:level.big*2};
}
export function levelTime(remainingMs:number){
 const seconds=Math.max(0,Math.ceil(remainingMs/1000));
 return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
