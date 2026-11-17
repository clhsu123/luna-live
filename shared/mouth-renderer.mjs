// Local visual approximation. No inference, network, or phoneme claims.
export function createMouthRenderer(canvas) {
 const gl=canvas.getContext('webgl',{alpha:false,antialias:false});
 if(!gl)throw Error('webgl_unavailable');
 const vertex=`attribute vec2 p; varying vec2 uv; void main(){uv=vec2((p.x+1.)*.5,(1.-p.y)*.5);gl_Position=vec4(p,0.,1.);}`;
 const fragment=`precision highp float; varying vec2 uv; uniform sampler2D frame; uniform vec2 size; uniform vec4 mouth; uniform float gap; uniform float level;
 void main(){vec2 px=uv*size;vec2 d=px-mouth.xy;float c=cos(mouth.w),s=sin(mouth.w);vec2 q=vec2(c*d.x+s*d.y,-s*d.x+c*d.y);float halfWidth=mouth.z*.6;
 if(halfWidth>1. && abs(q.x)<halfWidth){float edge=sqrt(max(0.,1.-pow(q.x/halfWidth,2.)));float radius=mouth.z*.75;float oldGap=min(gap,radius*.65)*edge;float newGap=(.6+mouth.z*.13*level)*edge;float y=abs(q.y);
 if(y<radius){float mapped=y<newGap?y*oldGap/max(newGap,.001):oldGap+(y-newGap)*(radius-oldGap)/max(radius-newGap,.001);q.y=sign(q.y)*mix(y,mapped,smoothstep(0.,.25,edge));px=mouth.xy+vec2(c*q.x-s*q.y,s*q.x+c*q.y);}}
 gl_FragColor=texture2D(frame,clamp(px/size,vec2(0.),vec2(1.)));}`;
 const shaders=[];
 function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('mouth_shader_failed');shaders.push(s);return s;}
 const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('mouth_program_failed');gl.useProgram(program);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
 const p=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
 const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 const uniforms=Object.fromEntries(['size','mouth','gap','level'].map(n=>[n,gl.getUniformLocation(program,n)]));
 return {draw(video,track,level){if(video.readyState<2)return;const w=video.videoWidth,h=video.videoHeight;if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);gl.uniform2f(uniforms.size,w,h);gl.uniform4f(uniforms.mouth,...(track?track.slice(0,4):[0,0,0,0]));gl.uniform1f(uniforms.gap,track?.[4]??0);gl.uniform1f(uniforms.level,Math.min(1,Math.max(0,level)));gl.drawArrays(gl.TRIANGLES,0,6);},dispose(){gl.deleteTexture(texture);gl.deleteBuffer(buffer);gl.deleteProgram(program);shaders.forEach(s=>gl.deleteShader(s));}};
}
