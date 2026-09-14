import {useCallback,useEffect,useRef,useState} from 'react';
import {sampleClock} from './poker/clock';
export function useLevelClock(duration:number,enabled:boolean,stopped:boolean){
 const elapsed=useRef(0),clock=useRef({elapsed:0,last:performance.now(),wasVisible:!document.hidden});
 const [shown,setShown]=useState(0);
 useEffect(()=>{
  if(!enabled||stopped)return;
  clock.current={elapsed:elapsed.current,last:performance.now(),wasVisible:!document.hidden};
  const tick=()=>{clock.current=sampleClock(clock.current,performance.now(),!document.hidden,duration);elapsed.current=clock.current.elapsed;setShown(elapsed.current);};
  const timer=setInterval(tick,250);document.addEventListener('visibilitychange',tick);
  return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);};
 },[duration,enabled,stopped]);
 const reset=useCallback(()=>{elapsed.current=0;clock.current={elapsed:0,last:performance.now(),wasVisible:!document.hidden};setShown(0);},[]);
 return {elapsed,remaining:Math.max(0,duration-shown),reset};
}
