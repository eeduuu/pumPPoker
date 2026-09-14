import { shuffle } from './deck.ts';
export const BOT_PROFILES = [
 {id:'tight',name:'Conservador',looseness:0.02,aggression:0.25,bluff:0.01,size:2},
 {id:'patient',name:'Paciente',looseness:0.07,aggression:0.35,bluff:0.02,size:2},
 {id:'balanced',name:'Equilibrado',looseness:0.12,aggression:0.5,bluff:0.04,size:3},
 {id:'aggressive',name:'Agresivo',looseness:0.18,aggression:0.8,bluff:0.1,size:3},
 {id:'loose',name:'Impulsivo',looseness:0.3,aggression:0.6,bluff:0.14,size:4},
 {id:'caller',name:'Pagador',looseness:0.38,aggression:0.15,bluff:0.01,size:2},
 {id:'tricky',name:'Farolero',looseness:0.2,aggression:0.65,bluff:0.18,size:3},
 {id:'selective',name:'Selectivo',looseness:0.04,aggression:0.7,bluff:0.03,size:3},
] as const;
export type BotProfile = typeof BOT_PROFILES[number];
export function assignBotProfiles(count:number){
 if(!Number.isInteger(count)||count<1||count>8)throw new RangeError('Número de bots inválido');
 return shuffle(BOT_PROFILES).slice(0,count);
}
