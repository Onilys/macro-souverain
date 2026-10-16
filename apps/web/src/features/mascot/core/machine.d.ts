import type {Expression,Target,Manifest,MachineState,Snapshot,Rectangle} from './types';
export const EXPRESSIONS: Expression[];
export function validateManifest(value:unknown):Manifest;
export class MascotMachine {
 constructor(manifest:unknown,options?:{initial?:Target;reducedMotion?:boolean});
 manifest:Manifest; target:Target; state:MachineState; reducedMotion:boolean;
 request(target:Target):void; settle(target:Target):void;
 blink():boolean; setReducedMotion(value:boolean):void;
 advance(milliseconds:number):void; frame():Rectangle;
 readonly active:boolean; snapshot():Snapshot;
}
