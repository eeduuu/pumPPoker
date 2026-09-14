import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeck} from '../src/poker/deck.ts';
import {dealInitialHand} from '../src/poker/initialHand.ts';
import {dealFrame,dealDelay} from '../src/poker/dealPresentation.ts';
test('Etapas iniciales y cobro secuencial de ciegas',()=>{const h=dealInitialHand([1000,1000,1000],10,20,0,createDeck());assert.deepEqual(dealFrame(h,0).stacks,[1000,1000,1000]);assert.equal(dealFrame(h,1).pot,0);assert.equal(dealFrame(h,2).pot,10);assert.equal(dealFrame(h,3).pot,30);});
test('Una carta por etapa, orden horario y estado intacto en todas las mesas',()=>{for(let n=2;n<=9;n++)for(let d=0;d<n;d++){const h=dealInitialHand(Array(n).fill(1000),10,20,d,createDeck()),before=JSON.stringify(h);for(let i=0;i<2*n;i++){const f=dealFrame(h,4+i);assert.equal(f.flyingSeat,h.dealOrder[i]);assert.equal(f.counts.reduce((a,b)=>a+b,0),i);}assert.deepEqual(dealFrame(h,4+2*n).counts,Array(n).fill(2));assert.equal(dealFrame(h,4+2*n).done,true);assert.equal(JSON.stringify(h),before);}});
test('Cada etapa conserva fichas incluso con ciegas cortas',()=>{for(const stacks of [[1000,1000],[100,7,12]]){const h=dealInitialHand(stacks,25,50,0,createDeck());for(let i=0;i<=4+stacks.length*2;i++){const f=dealFrame(h,i);assert.equal(f.stacks.reduce((a,b)=>a+b,0)+f.pot,stacks.reduce((a,b)=>a+b,0));}}});
test('Velocidades positivas sin omitir pasos',()=>{for(let i=0;i<22;i++){assert.ok(dealDelay('Rápida',i)>0);assert.ok(dealDelay('Rápida',i)<dealDelay('Normal',i));assert.ok(dealDelay('Normal',i)<dealDelay('Pausada',i));}});
