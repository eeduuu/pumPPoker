export function formatBB(chips:number,big:number){return (chips/big).toLocaleString('es-ES',{maximumFractionDigits:3})+' BB';}
export function raiseStepCount(min:number,max:number,big:number){
 if(!Number.isSafeInteger(min)||!Number.isSafeInteger(max)||!Number.isSafeInteger(big)||big<=0||min<0||max<min)throw new RangeError('Subida inválida');
 const regular=Math.floor((max-min)/big)+1;
 return regular+(min+(regular-1)*big<max?1:0);
}
export function raiseStepAt(min:number,max:number,big:number,index:number){
 const count=raiseStepCount(min,max,big);
 if(!Number.isSafeInteger(index)||index<0||index>=count)throw new RangeError('Opción de subida inválida');
 const regular=Math.floor((max-min)/big)+1;
 return index<regular?min+index*big:max;
}
