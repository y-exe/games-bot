import {UserError} from '../errors.js';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import sharp from 'sharp';
import {outlineDistances,outlineCoverage} from './outline-mask.js';

GlobalFonts.registerFromPath('assets/fonts/MochiyPopOne-Regular.ttf','Mochiy');
GlobalFonts.registerFromPath('assets/fonts/NotoSerifJP-Black.ttf','NotoSerif');
interface Mask {width:number;height:number;data:Buffer}
const rainbow=['#fd57d8','#fb0af2','#fa01fd','#fd31f1','#fc91b0','#fdfa38','#e8ee38','#d0f457','#6af097','#6ee9b4','#9ad0f2','#9997fd','#8d81fb','#883cfe'].map(c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)));

function bounds(mask:Mask) {
  let left=mask.width,top=mask.height,right=-1,bottom=-1;
  for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++)if(mask.data[y*mask.width+x]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=y;}
  if(right<0)throw new UserError('表示する文字がありません。');
  return {left,top,width:right-left+1,height:bottom-top+1};
}
function pad(mask:Mask,padding:number):Mask {
  const width=mask.width+padding*2,height=mask.height+padding*2,data=Buffer.alloc(width*height);
  for(let y=0;y<mask.height;y++)mask.data.copy(data,(y+padding)*width+padding,y*mask.width,(y+1)*mask.width);
  return {width,height,data};
}
function stretchedMask(text:string,font:string,spacing:number,target:number):Mask {
  const size=110;
  const probe=createCanvas(1,1).getContext('2d');probe.font=`${size}px ${font}`;
  const lines=text.split(/[,\n]/).filter(line=>line.trim()).map(line=>{
    const chars=[...line];
    const width=chars.reduce((n,c)=>n+probe.measureText(c).width,0)+Math.max(0,chars.length-1)*spacing;
    const glyphs=chars.map(c=>probe.measureText(c)),ascent=Math.max(...glyphs.map(m=>m.actualBoundingBoxAscent)),descent=Math.max(...glyphs.map(m=>m.actualBoundingBoxDescent));
    return {chars,width,height:ascent+descent,ascent};
  }).filter(line=>line.width>0&&line.height>0);
  if(!lines.length)throw new UserError('表示する文字がありません。');
  const textWidth=Math.max(...lines.map(line=>line.width)),textHeight=lines.reduce((n,line)=>n+line.height,0);
  const scaleX=target/textWidth,scaleY=target/textHeight,pad=4;
  const canvas=createCanvas(Math.ceil((textWidth+pad*2)*scaleX),Math.ceil((textHeight+pad*2)*scaleY)),ctx=canvas.getContext('2d');
  ctx.setTransform(scaleX,0,0,scaleY,pad*scaleX,pad*scaleY);
  ctx.font=`${size}px ${font}`;ctx.fillStyle='white';ctx.textBaseline='alphabetic';
  let y=0;
  for(const line of lines) {
    let x=(textWidth-line.width)/2;
    const baseline=y+line.ascent;
    for(const char of line.chars) {
      const metric=probe.measureText(char);
      ctx.fillText(char,x+Math.max(0,metric.actualBoundingBoxLeft),baseline);
      x+=metric.width+spacing;
    }
    y+=line.height;
  }
  const width=canvas.width,height=canvas.height,pixels=ctx.getImageData(0,0,width,height).data,data=Buffer.alloc(width*height);
  for(let i=0;i<data.length;i++)data[i]=pixels[i*4+3]!;
  return {width,height,data};
}
function render(text:string,font:string,size:number,spacing:number,multiline=true,individualBounds=true):Mask {
  const probe=createCanvas(1,1).getContext('2d');probe.font=`${size}px ${font}`;
  const lines=(multiline?text.split(/[,\n]/):[text]).filter(line=>line.trim());
  const masks=lines.map((line):Mask|undefined=>{
    const chars=[...line],glyphs=chars.map(c=>probe.measureText(c)),lineMetric=probe.measureText(line);
    const ascent=individualBounds?Math.max(...glyphs.map(m=>m.actualBoundingBoxAscent)):lineMetric.actualBoundingBoxAscent;
    const descent=individualBounds?Math.max(...glyphs.map(m=>m.actualBoundingBoxDescent)):lineMetric.actualBoundingBoxDescent;
    const width=Math.floor(chars.reduce((n,c)=>n+probe.measureText(c).width,0)+Math.max(0,chars.length-1)*spacing);
    const height=Math.ceil(ascent+descent);
    if(width<=0||height<=0)return undefined;
    if(width*height>30_000_000)throw new UserError('文字画像が大きすぎます。文字数を減らしてください。');
    const canvas=createCanvas(width+20,height+20),ctx=canvas.getContext('2d');ctx.font=probe.font;ctx.fillStyle='white';ctx.textBaseline='alphabetic';
    let x=10;for(const char of chars){const m=probe.measureText(char);ctx.fillText(char,x+(individualBounds?0:10)+Math.max(0,m.actualBoundingBoxLeft),ascent+10);x+=m.width+spacing;}
    const pixels=ctx.getImageData(0,0,width+20,height+20).data,data=Buffer.alloc((width+20)*(height+20));for(let i=0;i<data.length;i++)data[i]=pixels[i*4+3]!;
    return {width:width+20,height:height+20,data};
  }).filter((m):m is Mask=>Boolean(m));
  if(!masks.length)throw new UserError('表示する文字がありません。');
  const width=Math.max(...masks.map(m=>m.width)),height=masks.reduce((n,m)=>n+m.height,0);
  if(width*height>30_000_000)throw new UserError('文字画像が大きすぎます。行数や文字数を減らしてください。');
  const data=Buffer.alloc(width*height);let y=0;
  for(const m of masks){const x=Math.floor((width-m.width)/2);for(let r=0;r<m.height;r++)m.data.copy(data,(y+r)*width+x,r*m.width,(r+1)*m.width);y+=m.height;}
  return {width,height,data};
}
export function maximumMask(data:Uint8Array,width:number,height:number,radius:number) {
  const horizontal=Buffer.alloc(width*height),out=Buffer.alloc(width*height);
  function scan(length:number,read:(i:number)=>number,write:(i:number,v:number)=>void){const deque=new Int32Array(length);let head=0,tail=0,next=0;for(let i=0;i<length;i++){while(next<length&&next<=i+radius){while(tail>head&&read(deque[tail-1]!)<=read(next))tail--;deque[tail++]=next++;}while(tail>head&&deque[head]!<i-radius)head++;write(i,read(deque[head]!));}}
  for(let y=0;y<height;y++)scan(width,x=>data[y*width+x]!, (x,v)=>{horizontal[y*width+x]=v;});
  for(let x=0;x<width;x++)scan(height,y=>horizontal[y*width+x]!, (y,v)=>{out[y*width+x]=v;});
  return out;
}
function paste(output:Buffer,mask:Uint8Array,color:number[]) {
  for(let i=0;i<mask.length;i++)over(output,i,color,mask[i]!/255);
}
function over(output:Buffer,i:number,color:ArrayLike<number>,alpha:number) {
  if(!alpha)return;
  const background=output[i*4+3]!/255,total=alpha+background*(1-alpha);
  for(let c=0;c<3;c++)output[i*4+c]=Math.round((color[c]!*alpha+output[i*4+c]!*background*(1-alpha))/total);
  output[i*4+3]=Math.round(total*255);
}
function outlined(mask:Mask,fill:number[],innerColor:number[],inner:number,outer:number) {
  const output=Buffer.alloc(mask.width*mask.height*4),distances=outlineDistances(mask.data,mask.width,mask.height);
  if(outer)paste(output,outlineCoverage(distances,inner+outer),[255,255,255]);
  paste(output,outlineCoverage(distances,inner),innerColor);paste(output,mask.data,fill);
  return output;
}
async function strokeOutlined(text:string,font:string,size:number,spacing:number,fill:number[],innerColor:number[],inner:number,outer:number) {
  const probe=createCanvas(1,1).getContext('2d');probe.font=`${size}px ${font}`;
  const metrics=text.split(/[,\n]/).filter(line=>line.trim()).map(line=>{
    const chars=[...line];
    const width=Math.floor(chars.reduce((n,c)=>n+probe.measureText(c).width,0)+Math.max(0,chars.length-1)*spacing);
    const glyphs=chars.map(c=>probe.measureText(c)),ascent=Math.max(...glyphs.map(m=>m.actualBoundingBoxAscent)),descent=Math.max(...glyphs.map(m=>m.actualBoundingBoxDescent));
    return {chars,width,height:Math.ceil(ascent+descent),ascent};
  }).filter(m=>m.width>0&&m.height>0);
  if(!metrics.length)throw new UserError('表示する文字がありません。');
  const textWidth=Math.max(...metrics.map(m=>m.width)),textHeight=metrics.reduce((n,m)=>n+m.height,0);
  const pad=inner+outer+4,width=textWidth+pad*2,height=textHeight+pad*2;
  if(width*height>30_000_000)throw new UserError('文字画像が大きすぎます。文字数を減らしてください。');
  const scale=Math.max(1,Math.min(4,Math.floor(Math.sqrt(16_000_000/(width*height)))));
  const canvas=createCanvas(width*scale,height*scale),ctx=canvas.getContext('2d');ctx.scale(scale,scale);
  ctx.font=`${size}px ${font}`;ctx.textBaseline='alphabetic';ctx.fillStyle='white';
  let y=pad;
  for(const m of metrics) {
    let x=pad+Math.floor((textWidth-m.width)/2);
    const baseline=y+m.ascent;
    for(const char of m.chars) {
      const metric=probe.measureText(char),drawX=x+Math.max(0,metric.actualBoundingBoxLeft);
      ctx.fillText(char,drawX,baseline);
      x+=metric.width+spacing;
    }
    y+=m.height;
  }
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,data=Buffer.alloc(canvas.width*canvas.height);
  for(let i=0;i<data.length;i++)data[i]=pixels[i*4+3]!;
  const output=outlined({width:canvas.width,height:canvas.height,data},fill,innerColor,inner*scale,outer*scale);
  return sharp(output,{raw:{width:canvas.width,height:canvas.height,channels:4}}).resize(width,height,{kernel:'lanczos3'}).png().toBuffer();
}
async function stampOutlined(mask:Mask,fill:number[],innerColor:number[],inner:number,outer:number,targetWidth:number) {
  const padded=pad(mask,inner+outer+2),output=outlined(padded,fill,innerColor,inner,outer);
  const alpha=Buffer.alloc(padded.data.length);for(let i=0;i<alpha.length;i++)alpha[i]=output[i*4+3]!;
  const box=bounds({...padded,data:alpha});
  const factor=targetWidth/mask.width;
  return sharp(output,{raw:{width:padded.width,height:padded.height,channels:4}}).extract(box)
    .resize(Math.max(1,Math.round(box.width*factor)),Math.max(1,Math.round(box.height*factor)),{fit:'fill',kernel:'lanczos3'})
    .png().toBuffer();
}
export async function generateTextImage(kind:string,text:string,square:boolean) {
  if(!text.trim()||text.length>200)throw new UserError('文字は1〜200文字で指定してください。');
  if(kind==='text4') {
    const mask=render(text,'Mochiy',440,-60,false),padded=pad(mask,mask.height);
    const base=createCanvas(padded.width,padded.height),baseCtx=base.getContext('2d');const pixels=baseCtx.createImageData(padded.width,padded.height);
    for(let i=0;i<padded.data.length;i++){pixels.data[i*4]=249;pixels.data[i*4+1]=132;pixels.data[i*4+2]=242;pixels.data[i*4+3]=padded.data[i]!;}baseCtx.putImageData(pixels,0,0);
    const transformed=createCanvas(padded.width,padded.height),ctx=transformed.getContext('2d');ctx.transform(1,0,-.2,1,0,0);ctx.drawImage(base,0,0);
    const angle=5.5*Math.PI/180,w=Math.ceil(padded.width*Math.cos(angle)+padded.height*Math.sin(angle)),h=Math.ceil(padded.height*Math.cos(angle)+padded.width*Math.sin(angle));
    const rotated=createCanvas(w,h),r=rotated.getContext('2d');r.translate(w/2,h/2);r.rotate(angle);r.drawImage(transformed,-padded.width/2,-padded.height/2);
    const scale=4,side=500*scale;
    const rgba=await sharp(await rotated.encode('png')).trim().resize(476*scale,476*scale,{fit:'fill',kernel:'lanczos3'}).extend({top:12*scale,bottom:12*scale,left:12*scale,right:12*scale,background:{r:0,g:0,b:0,alpha:0}}).ensureAlpha().raw().toBuffer();
    const alpha=Buffer.alloc(side*side);for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3]!;
    const output=Buffer.alloc(rgba.length);paste(output,outlineCoverage(outlineDistances(alpha,side,side),12*scale),[255,255,255]);for(let i=0;i<alpha.length;i++)pastePixel(output,rgba,i);
    return sharp(output,{raw:{width:side,height:side,channels:4}}).resize(500,500,{kernel:'lanczos3'}).png().toBuffer();
  }
  if(kind==='text5') {
    const mask=render(text,'Mochiy',110,-15,false,false),rgba=Buffer.alloc(mask.width*mask.height*4);
    for(let y=0;y<mask.height;y++){const progress=y/Math.max(1,mask.height-1)*(rainbow.length-1),a=Math.floor(progress),b=Math.min(a+1,rainbow.length-1),fraction=progress-a;for(let x=0;x<mask.width;x++){const i=y*mask.width+x,alpha=mask.data[i]!/255;for(let c=0;c<3;c++)rgba[i*4+c]=Math.round(Math.trunc(rainbow[a]![c]!*(1-fraction)+rainbow[b]![c]!*fraction)*alpha);rgba[i*4+3]=mask.data[i]!;}}
    return sharp(rgba,{raw:{width:mask.width,height:mask.height,channels:4}}).resize(500,500,{fit:'fill',kernel:'lanczos3'}).png().toBuffer();
  }
  const font=kind==='text3'?'NotoSerif':'Mochiy';
  const fill=kind==='text'?[255,255,0]:kind==='text2'?[50,150,255]:[195,2,3];
  const innerColor=kind==='text3'?[255,255,255]:[0,0,0];
  if(square) {
    const supersample=4,target=470;
    return stampOutlined(stretchedMask(text,font,-17,target*supersample),fill,innerColor,15*supersample,12*supersample,target);
  }
  return strokeOutlined(text,font,110,0,fill,innerColor,7,kind==='text3'?0:5);
}
function pastePixel(output:Buffer,input:Buffer,i:number){over(output,i,input.subarray(i*4,i*4+3),input[i*4+3]!/255);}
