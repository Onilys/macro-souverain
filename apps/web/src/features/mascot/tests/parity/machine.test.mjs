import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MascotMachine,validateManifest} from '../../core/machine.js';
const manifest=JSON.parse(fs.readFileSync(new URL('../../fixtures/manifest.json',import.meta.url)));
const advance=m=>m.advance(10000);
test('logo → idle → thinking → failure → logo routes through neutral',()=>{
 const m=new MascotMachine(manifest);m.request('thinking');assert.equal(m.state.clip,'intro');advance(m);assert.equal(m.state.pose,'thinking');
 m.request('failure');assert.equal(m.state.clip,'thinking');assert.equal(m.state.direction,-1);m.advance(manifest.clips.thinking.duration);assert.equal(m.state.clip,'failure');advance(m);assert.equal(m.state.pose,'failure');m.request('logo');advance(m);assert.equal(m.state.kind,'logo');
});
test('interruption preserves progress; latest target wins without restarting clip',()=>{
 const m=new MascotMachine(manifest,{initial:'idle'});advance(m);m.request('thinking');m.advance(150);const frame=m.frame(),time=m.state.time;m.request('failure');assert.equal(m.state.time,time);assert.deepEqual(m.frame(),frame);assert.equal(m.state.direction,-1);m.request('thinking');assert.equal(m.state.direction,1);assert.equal(m.state.time,time);m.request('smile');advance(m);assert.equal(m.state.pose,'smile');
});
test('intro reverses in place and can reverse again',()=>{
 const m=new MascotMachine(manifest);m.request('idle');m.advance(200);m.request('logo');assert.equal(m.state.time,200);assert.equal(m.state.direction,-1);m.advance(100);m.request('idle');assert.equal(m.state.time,100);advance(m);assert.equal(m.state.kind,'idle');
});
test('repeated working events do not restart; blink exits to newest target; look is idle-only',()=>{
 const m=new MascotMachine(manifest,{initial:'thinking'});advance(m);m.request('thinking');assert.equal(m.state.kind,'hold');assert.equal(m.blink(),false);m.request('idle');advance(m);assert.equal(m.blink(),true);m.request('failure');advance(m);assert.equal(m.state.pose,'failure');m.request('look:3');advance(m);assert.equal(m.state.kind,'look');assert.deepEqual(m.frame(),manifest.looks[3]);m.request('idle');assert.equal(m.state.kind,'idle');
});
test('reduced motion settles targets; invalid sheets rejected',()=>{
 const m=new MascotMachine(manifest,{reducedMotion:true});m.request('thinking');assert.equal(m.state.kind,'hold');assert.equal(m.active,false);assert.equal(m.blink(),false);m.request('logo');assert.equal(m.state.kind,'logo');const bad=structuredClone(manifest);bad.clips.intro.frames[0].x=-1;assert.throws(()=>validateManifest(bad));assert.throws(()=>m.request('unknown'));
});
