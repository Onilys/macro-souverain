import type {Target,LookIndex,Snapshot} from '../core/types';
import type {MascotMachine} from '../core/machine.js';
export class StateMachinePlayer {
 constructor(canvas:HTMLCanvasElement,options?:{onChange?:(snapshot:Snapshot)=>void});
 machine?:MascotMachine;
 load(url:string,options?:{initial?:Target}):Promise<this>;
 request(target:Target):void; look(index:LookIndex|null):void; blink():void;
 pause():void; resume():void; destroy():void;
}
