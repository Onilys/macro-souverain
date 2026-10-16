// Batch-renderer snapshot: same SDF material, with independent eye expressions.
const vertex = `#version 300 es
layout(location=0) in vec2 aPosition;
void main(){gl_Position=vec4(aPosition,0.,1.);}`;
const fragment = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uResolution;
uniform int uCount;
uniform vec3 uPos[12],uRot[12],uSize[12];
uniform float uRadius[12];
uniform vec3 uDark,uLight,uGradient,uGradientRotation,uBackground,uRim;
uniform float uOffset,uSpan,uFresnel,uPower,uBlend,uExposure,uYaw,uPitch,uZoom;
uniform bool uTransparent;
uniform float uClay,uClayScale;
uniform int uEyeObject;
uniform vec4 uEyeLeft,uEyeRight;
uniform float uEyeSmile,uEyeAmount,uEyeRadius,uEyeSpacing,uEyeOffsetY,uEyeOffsetZ;
float bodyScene(vec3 p);
mat3 rx(float a){float c=cos(a),s=sin(a);return mat3(1,0,0,0,c,s,0,-s,c);}
mat3 ry(float a){float c=cos(a),s=sin(a);return mat3(c,0,-s,0,1,0,s,0,c);}
mat3 rz(float a){float c=cos(a),s=sin(a);return mat3(c,s,0,-s,c,0,0,0,1);}
float smoothMinimum(float a,float b,float k){
 if(k<=0.)return min(a,b);
 float h=clamp(.5+.5*(b-a)/k,0.,1.);
 return mix(b,a,h)-k*h*(1.-h);
}
float clayHash(vec3 p){
 p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);
}
float clayNoise(vec3 p){
 vec3 cell=floor(p),f=fract(p);
 // Quintic interpolation keeps displaced normals smooth at cell boundaries.
 vec3 u=f*f*f*(f*(f*6.-15.)+10.);
 return 2.*mix(
  mix(mix(clayHash(cell),clayHash(cell+vec3(1,0,0)),u.x),mix(clayHash(cell+vec3(0,1,0)),clayHash(cell+vec3(1,1,0)),u.x),u.y),
  mix(mix(clayHash(cell+vec3(0,0,1)),clayHash(cell+vec3(1,0,1)),u.x),mix(clayHash(cell+vec3(0,1,1)),clayHash(cell+vec3(1,1,1)),u.x),u.y),u.z)-1.;
}
float clayDisplacement(vec3 p){
 vec3 q=p*uClayScale+vec3(3.7,-1.2,8.4);
 return .75*clayNoise(q)+.25*clayNoise(q*2.7+vec3(11.8,2.5,-4.1));
}
float bodyScene(vec3 p){
 float d=1000.;
 for(int i=0;i<12;i++){
  if(i>=uCount)break;
  vec3 q=transpose(rz(uRot[i].z)*ry(uRot[i].y)*rx(uRot[i].x))*(p-uPos[i]);
  vec3 halfSize=uSize[i]*.5;
  float r=min(uRadius[i],min(halfSize.x,min(halfSize.y,halfSize.z))*.98);
  vec3 b=abs(q)-(halfSize-r);
  float n=length(max(b,0.))+min(max(b.x,max(b.y,b.z)),0.)-r;
  // Local coordinates keep the imperfections attached during translation/rotation.
  if(uClay>0.){
   float amplitude=uClay*min(.14,min(halfSize.x,min(halfSize.y,halfSize.z))*.2);
   n+=amplitude*clayDisplacement(q);
  }
  d=smoothMinimum(d,n,uBlend);
 }
 return d;
}
// Morph each sphere into a rounded upward arc in the local face plane.
float eyeShape(vec3 p,float radius,vec4 expression){
 float ca=cos(expression.z),sa=sin(expression.z);
 p.yz=mat2(ca,-sa,sa,ca)*p.yz;
 float aspect=max(.15,expression.y);
 p.y/=aspect;
 if(expression.x<0.)p.y=-p.y;
 float safety=min(aspect,1.);
 if(expression.w>.5){
  float ring=length(vec2(length(p.yz)-radius*.76,p.x))-radius*.24;
  return ring*safety;
 }
 vec2 v=vec2(p.z,p.y+radius*.4);
 float angle=clamp(atan(v.x,v.y),-1.1,1.1);
 vec2 closest=radius*vec2(sin(angle),cos(angle));
 float arc=length(vec3(p.x,v-closest))-radius*.28;
 return mix(length(p)-radius,arc,clamp(abs(expression.x),0.,1.))*safety;
}
// Eyes are children of the face cuboid's negative-X face.
// Applying the same inverse transform gives true depth occlusion and attachment.
float eyesDistance(vec3 p){
 if(uEyeAmount<=.0001||uEyeObject<0||uEyeObject>=uCount)return 1000.;
 int i=uEyeObject;
 vec3 q=transpose(rz(uRot[i].z)*ry(uRot[i].y)*rx(uRot[i].x))*(p-uPos[i]);
 float radius=uEyeRadius*uEyeAmount;
 vec3 left=vec3(-uSize[i].x*.5-.012,uEyeOffsetY,uEyeOffsetZ-uEyeSpacing*.5);
 vec3 right=vec3(left.xy,uEyeOffsetZ+uEyeSpacing*.5);
 return min(eyeShape(q-left,radius,uEyeLeft),eyeShape(q-right,radius,uEyeRight));
}
float scene(vec3 p){return min(bodyScene(p),eyesDistance(p));}
vec3 normalAt(vec3 p){vec2 e=vec2(.001,0.);return normalize(vec3(scene(p+e.xyy)-scene(p-e.xyy),scene(p+e.yxy)-scene(p-e.yxy),scene(p+e.yyx)-scene(p-e.yyx)));}
void main(){
 vec2 uv=(gl_FragCoord.xy-.5*uResolution)/uResolution.y;
 vec3 ro=vec3(sin(uYaw)*cos(uPitch),sin(uPitch),cos(uYaw)*cos(uPitch))*12.;
 vec3 forward=normalize(-ro),right=normalize(cross(forward,vec3(0,1,0))),up=cross(right,forward);
 ro+=(right*uv.x+up*uv.y)*uZoom;
 vec3 rd=forward;
 float t=0.,d=0.;bool hit=false;
 // Noise is not an exact distance field: bound its slope for safe ray steps.
 float stepSafety=.85/(1.+uClay*.14*uClayScale*10.);
 for(int i=0;i<256;i++){vec3 p=ro+rd*t;d=scene(p);if(d<.0009){hit=true;break;}t+=max(d*stepSafety,.0001);if(t>30.)break;}
 if(!hit){fragColor=uTransparent?vec4(0.):vec4(uBackground,1.);return;}
 vec3 p=ro+rd*t;
 if(uEyeAmount>0.&&eyesDistance(p)<bodyScene(p)){fragColor=vec4(1.);return;}
 vec3 n=normalAt(p);
 vec3 direction=length(uGradient)>.0001?normalize(uGradient):vec3(1,0,0);
 direction=rz(uGradientRotation.z)*ry(uGradientRotation.y)*rx(uGradientRotation.x)*direction;
 float gradient=clamp(dot(p,direction)/max(uSpan,.01)+.5+uOffset,0.,1.);
 vec3 base=mix(uDark,uLight,smoothstep(0.,1.,gradient));
 float rim=pow(clamp(1.-dot(n,-rd),0.,1.),uPower)*uFresnel;
 vec3 color=base+uRim*rim;
 color=clamp(color*uExposure,0.,1.);
 fragColor=vec4(color,1.);
}`;
// Resolve supersamples with coverage-weighted RGB, then return straight alpha.
// Averaging transparent background RGB directly would create dark/colored fringes.
const resolveFragment = `#version 300 es
precision highp float;
uniform sampler2D uImage;
uniform int uScale;
out vec4 fragColor;
void main(){
 ivec2 origin=ivec2(gl_FragCoord.xy)*uScale;
 vec4 total=vec4(0.);
 for(int y=0;y<4;y++)for(int x=0;x<4;x++){
  if(x>=uScale||y>=uScale)continue;
  vec4 sampleColor=texelFetch(uImage,origin+ivec2(x,y),0);
  total+=vec4(sampleColor.rgb*sampleColor.a,sampleColor.a);
 }
 float coverage=total.a/float(uScale*uScale);
 fragColor=vec4(total.a>0.?total.rgb/total.a:vec3(0.),coverage);
}`;
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', {
      alpha: true,
      preserveDrawingBuffer: true,
      antialias: false,
      premultipliedAlpha: false,
    });
    if (!this.gl)
      throw Error(
        'WebGL 2 is unavailable. Please open this tool in a browser with hardware acceleration enabled.'
      );
    const gl = this.gl;
    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw Error(gl.getShaderInfoLog(s));
      return s;
    };
    const program = (source) => {
      const p = gl.createProgram(),
        vs = shader(gl.VERTEX_SHADER, vertex),
        fs = shader(gl.FRAGMENT_SHADER, source);
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        throw Error(gl.getProgramInfoLog(p));
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return p;
    };
    this.program = program(fragment);
    this.resolveProgram = program(resolveFragment);
    this.resolveImage = gl.getUniformLocation(this.resolveProgram, 'uImage');
    this.resolveScale = gl.getUniformLocation(this.resolveProgram, 'uScale');
    this.target = gl.createFramebuffer();
    this.texture = gl.createTexture();
    this.targetSize = 0;
    this.maxTargetSize = Math.min(
      4096,
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)
    );
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.locations = {};
    this.buffer = b;
  }
  loc(n) {
    if (!(n in this.locations))
      this.locations[n] = this.gl.getUniformLocation(this.program, n);
    return this.locations[n];
  }
  prepareTarget(size) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    if (this.targetSize === size) return;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      size,
      size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.texture,
      0
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw Error(
        'Could not allocate the antialiasing buffer. Try a smaller canvas.'
      );
    this.targetSize = size;
  }
  draw(state, poses) {
    const gl = this.gl,
      s = state.surface,
      c = state.camera;
    const vec = (n, v) => gl.uniform3fv(this.loc(n), v);
    const num = (n, v) => gl.uniform1f(this.loc(n), v);
    const color = (h) =>
      [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    if (this.canvas.width !== state.size) {
      this.canvas.width = state.size;
      this.canvas.height = state.size;
    }
    const scale = Math.max(
        1,
        Math.min(
          state.antialias ?? 2,
          Math.floor(this.maxTargetSize / state.size)
        )
      ),
      renderSize = state.size * scale;
    if (scale > 1) this.prepareTarget(renderSize);
    else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, renderSize, renderSize);
    gl.useProgram(this.program);
    gl.uniform2f(this.loc('uResolution'), renderSize, renderSize);
    gl.uniform1i(this.loc('uCount'), poses.length);
    const flatten = (k) => {
      const a = new Float32Array(36);
      poses.forEach((p, i) => a.set(p[k], i * 3));
      return a;
    };
    vec('uPos[0]', flatten('position'));
    vec('uSize[0]', flatten('scale'));
    const rot = flatten('rotation').map((x) => (x * Math.PI) / 180);
    vec('uRot[0]', rot);
    const radii = new Float32Array(12);
    state.objects.forEach((o, i) => (radii[i] = o.radius));
    gl.uniform1fv(this.loc('uRadius[0]'), radii);
    for (const [n, k] of [
      ['uDark', 'dark'],
      ['uLight', 'light'],
      ['uRim', 'rim'],
      ['uBackground', 'background'],
    ])
      vec(n, color(s[k]));
    vec('uGradient', s.direction);
    vec(
      'uGradientRotation',
      (s.gradientRotation ?? [0, 0, 0]).map((v) => (v * Math.PI) / 180)
    );
    for (const [n, k] of [
      ['uOffset', 'offset'],
      ['uSpan', 'span'],
      ['uFresnel', 'fresnel'],
      ['uPower', 'power'],
      ['uBlend', 'blend'],
      ['uExposure', 'exposure'],
    ])
      num(n, s[k]);
    num('uClay', s.clay ?? 0);
    num('uClayScale', s.clayScale ?? 2.3);
    const eyes = state.eyes;
    gl.uniform1i(this.loc('uEyeObject'), eyes?.objectIndex ?? -1);
    num('uEyeAmount', eyes?.amount ?? 0);
    num('uEyeSmile', eyes?.smile ?? 0);
    gl.uniform4fv(
      this.loc('uEyeLeft'),
      eyes?.left ?? [eyes?.smile ?? 0, 1, 0, 0]
    );
    gl.uniform4fv(
      this.loc('uEyeRight'),
      eyes?.right ?? [eyes?.smile ?? 0, 1, 0, 0]
    );
    num('uEyeRadius', eyes?.radius ?? 0.12);
    num('uEyeSpacing', eyes?.spacing ?? 0.48);
    num('uEyeOffsetY', eyes?.offsetY ?? 0);
    num('uEyeOffsetZ', eyes?.offsetZ ?? 0);
    num('uYaw', c.yaw);
    num('uPitch', c.pitch);
    num('uZoom', c.zoom);
    gl.uniform1i(this.loc('uTransparent'), state.transparent ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (scale > 1) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, state.size, state.size);
      gl.useProgram(this.resolveProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.uniform1i(this.resolveImage, 0);
      gl.uniform1i(this.resolveScale, scale);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }
  destroy() {
    const gl = this.gl;
    gl.deleteBuffer(this.buffer);
    gl.deleteTexture(this.texture);
    gl.deleteFramebuffer(this.target);
    gl.deleteProgram(this.program);
    gl.deleteProgram(this.resolveProgram);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.width = this.canvas.height = 1;
  }
}
