import {useCallback,useEffect,useRef,useState} from 'react';
import {sampleClock} from './poker/clock';
export function useLevelClock(duration:number,enabled:boolean,stopped:boolean,limit=Number.POSITIVE_INFINITY){
 const elapsed=useRef(0),clock=useRef({elapsed:0,last:Date.now()});
 const [shown,setShown]=useState(0);
 const readElapsed=useCallback(()=>{
  if(!enabled||stopped)return elapsed.current;
  clock.current=sampleClock(clock.current,Date.now(),limit);
  elapsed.current=clock.current.elapsed;setShown(elapsed.current);
  return elapsed.current;
 },[enabled,stopped,limit]);
 useEffect(()=>{
  if(!enabled||stopped)return;
  clock.current={elapsed:elapsed.current,last:Date.now()};
  const timer=setInterval(readElapsed,250);document.addEventListener('visibilitychange',readElapsed);
  return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',readElapsed);};
 },[enabled,stopped,readElapsed]);
 const reset=useCallback(()=>{elapsed.current=0;clock.current={elapsed:0,last:Date.now()};setShown(0);},[]);
 return {elapsedMs:shown,remaining:Math.max(0,duration-shown),reset,readElapsed};
}
