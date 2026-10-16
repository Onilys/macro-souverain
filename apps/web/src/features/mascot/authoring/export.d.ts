import type {Project,Manifest,Layout} from '../core/types';
export type BakeResult = {atlas:HTMLCanvasElement;manifest:Manifest;png:Blob;webp:Blob;json:string;archive:Blob;plan:Layout};
export function bake(project:Project,format:'variant',options?:{signal?:AbortSignal;onProgress?:(progress:number,label:string)=>void;fit?:boolean}):Promise<BakeResult>;
