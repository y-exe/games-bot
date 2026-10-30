import {createCanvas} from '@napi-rs/canvas';
import sharp from 'sharp';
import {validateTextStyle,type TextStyle} from '../data/text-style.js';
import {UserError} from '../errors.js';
import {outlineDistances,outlineCoverage} from './outline-mask.js';
import {generateTextImage} from './text-image.js';
import {ensureTextFont} from './text-fonts.js';

const rgb=(color:string)=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
function paint(out:Buffer,mask:Uint8Array,color:(x:number,y:number)=>number[],width:number,opacity=1,dx=0,dy=0) {
  const height=mask.length/width;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const tx=x+dx,ty=y+dy;if(tx<0||tx>=width||ty<0||ty>=height)continue;
    const alpha=mask[y*width+x]!/255*opacity;if(!alpha)continue;
    const i=(ty*width+tx)*4,bg=out[i+3]!/255,total=alpha+bg*(1-alpha),fill=color(x,y);
    for(let c=0;c<3;c++)out[i+c]=Math.round((fill[c]!*alpha+out[i+c]!*bg*(1-alpha))/total);
    out[i+3]=Math.round(total*255);
  }
}
export async function generateCustomTextImage(text:string,input:TextStyle) {
  if(!text.trim()||text.length>200)throw new UserError('文字は1〜200文字で指定してください。');
  const style=validateTextStyle(input);
  if(style.builtin)return generateTextImage(style.builtin.kind,text,style.builtin.square);
  const outline=style.layers.reduce((n,l)=>n+(l.kind==='outline'?l.width:0),0);
  let leftEffect=outline,rightEffect=outline,topEffect=outline,bottomEffect=outline;
  for(const layer of style.layers)if(layer.kind==='shadow') {
    const spread=outline+layer.spread+layer.blur*3;
    leftEffect=Math.max(leftEffect,spread-layer.x);rightEffect=Math.max(rightEffect,spread+layer.x);
    topEffect=Math.max(topEffect,spread-layer.y);bottomEffect=Math.max(bottomEffect,spread+layer.y);
  }
  const grow=(extent:number)=>Math.max(0,Math.ceil(extent-style.padding));
  const growLeft=grow(leftEffect),growRight=grow(rightEffect),growTop=grow(topEffect),growBottom=grow(bottomEffect);
  const scale=Math.max(1,Math.min(4,Math.floor(2400/Math.max(style.width+growLeft+growRight,style.height+growTop+growBottom))));
  const baseWidth=style.width*scale,baseHeight=style.height*scale,offsetX=growLeft*scale,offsetY=growTop*scale;
  const width=(style.width+growLeft+growRight)*scale,height=(style.height+growTop+growBottom)*scale;
  const margin=style.padding*scale+2;
  if(margin*2>=Math.min(baseWidth,baseHeight)-32)throw new UserError('余白が大きすぎます。小さくするか画像サイズを広げてください。');
  const canvas=createCanvas(width,height),ctx=canvas.getContext('2d');
  ctx.font=`200px ${ensureTextFont(style.font)}`;ctx.textBaseline='alphabetic';
  const lines=text.replaceAll(',','\n').split('\n');
  if(lines.length>10)throw new UserError('改行は10行以内にしてください。');
  const lineWidths=lines.map(line=>[...line].reduce((n,char)=>n+ctx.measureText(char).width+style.spacing,0));
  if(lineWidths.some(n=>!Number.isFinite(n)))throw new UserError('字間が大きすぎて文字の位置を計算できません。値を小さくしてください。');
  const maxWidth=Math.max(...lineWidths),lineHeight=230*style.lineHeight;
  const angle=style.rotation*Math.PI/180,shear=style.skew+(style.italic?-.2:0);
  const a=Math.cos(angle),b=Math.sin(angle),c=shear*a-b,d=a+shear*b;
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  const glyphs:{char:string;x:number;y:number}[]=[];
  for(const [row,line] of lines.entries()) {
    let x=style.align==='center'?(maxWidth-lineWidths[row]!)/2:style.align==='right'?maxWidth-lineWidths[row]!:0;
    for(const char of [...line]) {
      const metric=ctx.measureText(char),y=row*lineHeight;
      if(metric.actualBoundingBoxAscent+metric.actualBoundingBoxDescent>0)for(const gx of [x-metric.actualBoundingBoxLeft,x+metric.actualBoundingBoxRight])for(const gy of [y-metric.actualBoundingBoxAscent,y+metric.actualBoundingBoxDescent]) {
        const tx=a*gx+c*gy,ty=b*gx+d*gy;
        left=Math.min(left,tx);right=Math.max(right,tx);top=Math.min(top,ty);bottom=Math.max(bottom,ty);
      }
      glyphs.push({char,x,y});x+=metric.width+style.spacing;
    }
  }
  if(![left,right,top,bottom].every(Number.isFinite)||right<=left||bottom<=top)throw new UserError('表示する文字がないか、字間の値から文字の位置を計算できません。');
  let sx=(baseWidth-margin*2)/(right-left),sy=(baseHeight-margin*2)/(bottom-top);
  if(style.fit==='contain')sx=sy=Math.min(sx,sy);
  const tx=offsetX+(baseWidth-(right-left)*sx)/2-left*sx,ty=offsetY+(baseHeight-(bottom-top)*sy)/2-top*sy;
  ctx.setTransform(sx*a,sy*b,sx*c,sy*d,tx,ty);ctx.fillStyle='white';
  for(const glyph of glyphs)ctx.fillText(glyph.char,glyph.x,glyph.y);
  const pixels=ctx.getImageData(0,0,width,height).data,mask=Buffer.alloc(width*height);
  for(let i=0;i<mask.length;i++)mask[i]=pixels[i*4+3]!;
  const distances=style.layers.length?outlineDistances(mask,width,height):undefined,out=Buffer.alloc(width*height*4);
  let cumulative=0;
  const radii=style.layers.map(layer=>layer.kind==='outline'?(cumulative+=layer.width)*scale:0);
  for(let index=style.layers.length-1;index>=0;index--) {
    const layer=style.layers[index]!,color=rgb(layer.color);
    if(layer.kind==='outline')paint(out,outlineCoverage(distances!,radii[index]!),()=>color,width,layer.opacity);
    else {
      let alpha=outlineCoverage(distances!,(outline+layer.spread)*scale);
      if(layer.blur)alpha=await sharp(alpha,{raw:{width,height,channels:1}}).blur(Math.max(.3,layer.blur*scale)).toColourspace('b-w').raw().toBuffer();
      paint(out,alpha,()=>color,width,layer.opacity,Math.round(layer.x*scale),Math.round(layer.y*scale));
    }
  }
  const colors=style.fill.colors.map(rgb),radians=style.fill.angle*Math.PI/180,vx=Math.cos(radians),vy=Math.sin(radians);
  let rainbow:Buffer|undefined;
  if(style.fill.kind==='rainbow')rainbow=await sharp('assets/text5/gradient.svg').resize(1,baseHeight,{fit:'fill'}).removeAlpha().raw().toBuffer();
  const fill=(x:number,y:number)=>{
    if(rainbow){const row=Math.min(baseHeight-1,Math.max(0,y-offsetY));return [...rainbow.subarray(row*3,row*3+3)];}
    if(style.fill.kind==='solid')return colors[0]!;
    const extent=Math.abs(vx)*(baseWidth-margin*2)+Math.abs(vy)*(baseHeight-margin*2);
    const progress=Math.min(1,Math.max(0,.5+((x-offsetX-baseWidth/2)*vx+(y-offsetY-baseHeight/2)*vy)/extent))*(colors.length-1),first=Math.floor(progress),last=Math.min(first+1,colors.length-1),fraction=progress-first;
    return [0,1,2].map(c=>Math.round(colors[first]![c]!*(1-fraction)+colors[last]![c]!*fraction));
  };
  paint(out,mask,fill,width);
  const background=style.background?rgb(style.background):undefined;
  for(let i=0;i<mask.length;i++) {
    const alpha=out[i*4+3]!/255*style.opacity;
    if(background){for(let c=0;c<3;c++)out[i*4+c]=Math.round(out[i*4+c]!*alpha+background[c]!*(1-alpha));out[i*4+3]=255;}
    else out[i*4+3]=Math.round(alpha*255);
  }
  return sharp(out,{raw:{width,height,channels:4}}).resize(style.width,style.height,{fit:'contain',kernel:'lanczos3',background:style.background??{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
}
