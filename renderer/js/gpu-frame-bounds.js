import { boundsFromTiles } from './frame-bounds.mjs';
// Reduce on the same WebGL device as Live2D. Only 1/64 of full-frame bytes return to CPU.
export function createGpuFrameBounds(renderer, width, height) {
  const columns=Math.ceil(width/8), rows=Math.ceil(height/8);
  const source=PIXI.RenderTexture.create({width,height,scaleMode:PIXI.SCALE_MODES.NEAREST});
  const reduced=PIXI.RenderTexture.create({width:columns,height:rows,scaleMode:PIXI.SCALE_MODES.NEAREST});
  const geometry=new PIXI.Geometry().addAttribute('aVertexPosition',[0,0,columns,0,columns,rows,0,rows],2).addIndex([0,1,2,0,2,3]);
  const shader=PIXI.Shader.from(`
    precision highp float;
    attribute vec2 aVertexPosition;
    uniform mat3 translationMatrix;
    uniform mat3 projectionMatrix;
    void main(){gl_Position=vec4((projectionMatrix*translationMatrix*vec3(aVertexPosition,1.0)).xy,0.0,1.0);}
  `,`
    precision highp float;
    uniform sampler2D uSource;
    uniform vec2 uSize;
    void main(){
      vec2 origin=floor(gl_FragCoord.xy)*8.0;
      vec2 lo=vec2(9.0), hi=vec2(0.0);
      for(int y=0;y<8;y++) for(int x=0;x<8;x++) {
        vec2 p=origin+vec2(float(x),float(y));
        if(p.x<uSize.x && p.y<uSize.y && texture2D(uSource,(p+0.5)/uSize).a>0.0){
          vec2 point=vec2(float(x+1),float(y+1)); lo=min(lo,point);hi=max(hi,point);
        }
      }
      gl_FragColor=hi.y==0.0?vec4(0.0):vec4(lo,hi)/255.0;
    }
  `,{uSource:source,uSize:new Float32Array([width,height])});
  const mesh=new PIXI.Mesh(geometry,shader); mesh.state.blend=false;
  const bytes=new Uint8Array(columns*rows*4);
  return {
    render(stage){renderer.render(stage,{renderTexture:source,clear:true});},
    read(){
      renderer.render(mesh,{renderTexture:reduced,clear:true});
      renderer.renderTexture.bind(reduced);
      renderer.gl.readPixels(0,0,columns,rows,renderer.gl.RGBA,renderer.gl.UNSIGNED_BYTE,bytes);
      return boundsFromTiles(bytes,columns,rows);
    },
    destroy(){mesh.destroy();geometry.destroy();shader.destroy();source.destroy(true);reduced.destroy(true);},
  };
}
