export type BlindLevel={number:number;small:number;big:number};
export function validStartingBlinds(small:number,big:number){
 return Number.isSafeInteger(small)&&Number.isSafeInteger(big)&&small>0&&big>small&&small/big>=1/3&&small/big<=2/3;
}
const BLIND_STEPS=[1,1.5,2,3,4,6,8];
export function breakDue(mode:'normal'|'tournament',enabled:boolean,every:number,finishedLevel:number,nextLevel:number){
 return mode==='tournament'&&enabled&&Number.isInteger(every)&&every>0&&nextLevel>finishedLevel&&Math.floor((nextLevel-1)/every)>Math.floor((finishedLevel-1)/every);
}
export function nextBreakElapsedMs(mode:'normal'|'tournament',enabled:boolean,breaks:boolean,every:number,currentLevel:number,durationMs:number){
 if(mode!=='tournament'||!enabled||!breaks||!Number.isInteger(every)||every<=0)return Number.POSITIVE_INFINITY;
 return Math.ceil(currentLevel/every)*every*durationMs;
}
export function clockLevelNumber(elapsedMs:number,durationMs:number,breakLimit=Number.POSITIVE_INFINITY){
 return Math.min(Math.floor(elapsedMs/durationMs)+1,breakLimit/durationMs);
}
export function scheduledBlindLevel(initial:BlindLevel,elapsedMs:number,durationMs:number,enabled:boolean,maxBlind=Number.MAX_SAFE_INTEGER):BlindLevel{
 if(!enabled)return initial;
 if(!Number.isFinite(elapsedMs)||elapsedMs<0||!Number.isFinite(durationMs)||durationMs<=0||!Number.isSafeInteger(maxBlind)||maxBlind<initial.big||!Number.isSafeInteger(initial.number)||initial.number<1||!Number.isSafeInteger(initial.small)||!Number.isSafeInteger(initial.big)||initial.small<1||initial.big<=initial.small)throw new RangeError('Nivel inválido');
 const passed=Math.floor(elapsedMs/durationMs);
 if(passed===0)return initial;
 const multiplier=BLIND_STEPS[passed%BLIND_STEPS.length]*10**Math.floor(passed/BLIND_STEPS.length);
 const number=initial.number+passed,big=Math.min(Math.round(initial.big*multiplier),maxBlind);
 const proportional=passed===1?initial.small:Math.round(big*initial.small/initial.big);
 const small=Math.min(Math.floor(2*big/3),Math.max(Math.ceil(big/3),proportional));
 if(!Number.isSafeInteger(number)||!Number.isSafeInteger(small)||!Number.isSafeInteger(big))throw new RangeError('Nivel inválido');
 return {number,small,big};
}
export function timeToNextLevel(elapsedMs:number,durationMs:number){
 if(!Number.isFinite(elapsedMs)||elapsedMs<0||!Number.isFinite(durationMs)||durationMs<=0)throw new RangeError('Nivel inválido');
 return durationMs-(elapsedMs%durationMs);
}
export function levelTime(remainingMs:number){
 const seconds=Math.max(0,Math.ceil(remainingMs/1000));
 return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
