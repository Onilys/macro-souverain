import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {validate,layout,animation,evaluate,lookPose,back} from '../../core/model.js';
const p=JSON.parse(fs.readFileSync(new URL('../../fixtures/project.json',import.meta.url)));
test('current authored project validates, exact layout and endpoints preserved',()=>{
 assert.deepEqual(validate(p),p);const l=layout(p);assert.equal(l.width,2048);assert.equal(l.height,1792);assert.equal(l.frames.length,44+p.idle.length);assert.equal(new Set(l.frames.map(f=>f.row+','+f.col)).size,l.frames.length);
 for(const id of ['smile','failure','confused','thinking']){assert.deepEqual(animation(p,id,0),p.neutral);assert.deepEqual(animation(p,id,1),p.expressions[id]);}
 assert.deepEqual(animation(p,'intro',1),p.neutral);assert.deepEqual(animation(p,'blink',1),p.neutral);
 for(let i=0;i<=100;i++){const t=i/100;assert.ok(Math.abs(back(t,1.1)+back(1-t,1.1)-1)<1e-10);assert.ok(evaluate(p,animation(p,'intro',t)).poses.every(o=>o.scale.every(v=>v>0)));}
 const q=structuredClone(p);q.settings.lookGaze=4;validate(q);assert.equal(lookPose(q,2).motion.gazeX,4);
});
