import {UserError} from '../errors.js';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import sharp from 'sharp';
import {outlineDistances,outlineCoverage} from './outline-mask.js';

GlobalFonts.registerFromPath('assets/fonts/MochiyPopOne-Regular.ttf','Mochiy');
GlobalFonts.registerFromPath('assets/fonts/NotoSerifJP-Black.ttf','NotoSerif');
interface Mask {width:number;height:number;data:Buffer}
let rainbowRows:Promise<Buffer>|undefined;

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
function stampMask(text:string,side:number,padding:number,angle=0,shear=0):Mask {
  const probe=createCanvas(1,1).getContext('2d');probe.font='110px Mochiy';
  const a=Math.cos(angle),b=Math.sin(angle),c=shear*a-b,d=a+shear*b;
  let cursor=0,left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  const glyphs=[...text].map(char=>{
    const metric=probe.measureText(char),x=cursor+Math.max(0,metric.actualBoundingBoxLeft);
    cursor+=metric.width-15;
    if(metric.actualBoundingBoxAscent+metric.actualBoundingBoxDescent>0) {
      for(const gx of [x-metric.actualBoundingBoxLeft,x+metric.actualBoundingBoxRight])for(const gy of [-metric.actualBoundingBoxAscent,metric.actualBoundingBoxDescent]) {
        const tx=a*gx+c*gy,ty=b*gx+d*gy;
        left=Math.min(left,tx);right=Math.max(right,tx);top=Math.min(top,ty);bottom=Math.max(bottom,ty);
      }
    }
    return {char,x};
  });
  if(!Number.isFinite(left)||right<=left||bottom<=top)throw new UserError('表示する文字がありません。');
  const sx=(side-padding*2)/(right-left),sy=(side-padding*2)/(bottom-top);
  const canvas=createCanvas(side,side),ctx=canvas.getContext('2d');
  ctx.setTransform(sx*a,sy*b,sx*c,sy*d,padding-left*sx,padding-top*sy);
  ctx.font=probe.font;ctx.fillStyle='white';ctx.textBaseline='alphabetic';
  for(const glyph of glyphs)ctx.fillText(glyph.char,glyph.x,0);
  const pixels=ctx.getImageData(0,0,side,side).data,data=Buffer.alloc(side*side);
  for(let i=0;i<data.length;i++)data[i]=pixels[i*4+3]!;
  if(angle||shear) {
    const box=bounds({width:side,height:side,data});
    const fx=(side-padding*2)/box.width,fy=(side-padding*2)/box.height;
    ctx.resetTransform();ctx.clearRect(0,0,side,side);
    ctx.setTransform(sx*a*fx,sy*b*fy,sx*c*fx,sy*d*fy,(padding-left*sx-box.left)*fx+padding,(padding-top*sy-box.top)*fy+padding);
    for(const glyph of glyphs)ctx.fillText(glyph.char,glyph.x,0);
    const fitted=ctx.getImageData(0,0,side,side).data;
    for(let i=0;i<data.length;i++)data[i]=fitted[i*4+3]!;
  }
  return {width:side,height:side,data};
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
    const scale=4,side=500*scale;
    const mask=stampMask(text,side,12*scale,5.5*Math.PI/180,-.2);
    const output=outlined(mask,[230,116,220],[255,255,255],12*scale,0);
    return sharp(output,{raw:{width:side,height:side,channels:4}}).resize(500,500,{kernel:'lanczos3'}).png().toBuffer();
  }
  if(kind==='text5') {
    const rainbow=await(rainbowRows??=sharp('assets/text5/gradient.svg').resize(1,2000,{fit:'fill'}).removeAlpha().raw().toBuffer());
    const colors=rainbow.length/3;
    const scale=4,side=500*scale,padding=4*scale,mask=stampMask(text,side,padding);
    const rgba=Buffer.alloc(side*side*4);
    for(let y=0;y<side;y++) {
      const progress=Math.min(1,Math.max(0,(y-padding)/(side-padding*2-1)))*(colors-1),a=Math.floor(progress),b=Math.min(a+1,colors-1),fraction=progress-a;
      for(let x=0;x<side;x++) {
        const i=y*side+x;
        for(let c=0;c<3;c++)rgba[i*4+c]=Math.round(rainbow[a*3+c]!*(1-fraction)+rainbow[b*3+c]!*fraction);
        rgba[i*4+3]=mask.data[i]!;
      }
    }
    return sharp(rgba,{raw:{width:side,height:side,channels:4}}).resize(500,500,{kernel:'lanczos3'}).png().toBuffer();
  }
  const font=kind==='text3'?'NotoSerif':'Mochiy';
  const fill=kind==='text1'||kind==='text'?[255,255,0]:kind==='text2'?[50,150,255]:[195,2,3];
  const innerColor=kind==='text3'?[255,255,255]:[0,0,0];
  if(square) {
    const supersample=4,target=470;
    return stampOutlined(stretchedMask(text,font,-17,target*supersample),fill,innerColor,(kind==='text3'?7:15)*supersample,(kind==='text3'?0:12)*supersample,target);
  }
  return strokeOutlined(text,font,110,0,fill,innerColor,7,kind==='text3'?0:5);
}
