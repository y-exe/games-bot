import {UserError} from '../errors.js';
import { spawn } from 'node:child_process';
import { access,copyFile,mkdir,mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,isAbsolute } from 'node:path';
import { settings } from '../config.js';

export async function runProcess(executable:string,args:string[],options:{cwd?:string;env?:NodeJS.ProcessEnv;timeout?:number}={}) {
  return new Promise<string>((resolveResult,reject)=>{
    const child=spawn(executable,args,{cwd:options.cwd,env:options.env??process.env,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});let output='';
    const timer=setTimeout(()=>{child.kill();reject(new Error('音声処理が時間切れになりました。短い音声で再試行してください。'));},options.timeout??120_000);
    child.stdout.on('data',(data:Buffer)=>{if(output.length<100_000)output+=data.toString();});child.stderr.resume();
    child.once('error',()=>{clearTimeout(timer);reject(new Error('音声処理を開始できませんでした。管理者に音声処理環境の確認を依頼してください。'));});
    child.once('close',code=>{clearTimeout(timer);if(code===0)resolveResult(output);else {console.error(`音声処理終了コード: ${code}`);reject(new Error('音声を処理できませんでした。別の音声、または短い音声で再試行してください。'));}});
  });
}
let running=false;
export async function processAudio(source:Buffer,extension:string,convert:boolean) {
  if(running)throw new UserError('別の音声を処理中です。完了してから再試行してください。');
  if(!['wav','mp3','flac','m4a','ogg'].includes(extension))throw new UserError('音声はwav・mp3・flac・m4a・oggに対応しています。');
  if(source.length>10_000_000)throw new UserError('音声は10MB以下にしてください。');
  running=true;let directory:string|undefined;
  try{
    directory=await mkdtemp(join(tmpdir(),'games-bot-audio-'));
    const input=join(directory,`input.${extension}`);await writeFile(input,source);
    const probe=await runProcess(settings.ffprobe,['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',input]);const duration=Number(probe.trim());
    if(!Number.isFinite(duration)||duration<=0||duration>45)throw new UserError('音声は45秒以内にしてください。');
    if(!convert)return {bytes:source,extension,duration};
    try{if(isAbsolute(settings.rvcPython))await access(settings.rvcPython);await access(join(settings.rvcAssets,'ymkw.pth'));}catch{throw new UserError('ボイチェンの推論環境がまだ準備できていません。読み上げのみなら convert:false で使えます。');}
    const hubert=join(settings.rvcRoot,'assets','hubert');await mkdir(hubert,{recursive:true});
    try{await access(join(hubert,'hubert_base.pt'));}catch{await copyFile(join(settings.rvcAssets,'hubert_base.pt'),join(hubert,'hubert_base.pt'));}
    const output=join(directory,'output.wav');
    await runProcess(settings.rvcPython,['tools/infer_cli.py','--device','cpu','--f0up_key','0','--input_path',input,'--opt_path',output,'--model_name','ymkw.pth'],{cwd:settings.rvcRoot,env:{...process.env,weight_root:settings.rvcAssets,OMP_NUM_THREADS:'1',MKL_NUM_THREADS:'1'},timeout:180_000});
    const bytes=await readFile(output);if(bytes.length>7_800_000)throw new UserError('変換後の音声が大きすぎます。');return {bytes,extension:'wav',duration};
  }finally{running=false;if(directory)await rm(directory,{recursive:true,force:true});}
}
