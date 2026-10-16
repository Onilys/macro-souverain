import type {Rig,Transform} from '../core/types';
export class Renderer {
 constructor(canvas:HTMLCanvasElement);
 gl:WebGL2RenderingContext;
 draw(state:Rig,poses:Pick<Transform,'position'|'rotation'|'scale'>[]):void;
 destroy():void;
}
