import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {processAudio,normalizeAudio,runProcess} from '../src/services/audio.ts';
import {settings} from '../src/config.ts';

const available=spawnSync(settings.ffmpeg,['-version'],{stdio:'ignore'}).status===0&&spawnSync(settings.ffprobe,['-version'],{stdio:'ignore'}).status===0;

test('外部URLを読む偽装音声プレイリストを拒否する',{skip:!available},async()=>{
  let requests=0;
  const server=createServer((_req,res)=>{requests++;res.end();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const directory=await mkdtemp(join(tmpdir(),'games-bot-audio-test-'));
  try {
    const playlist=Buffer.from(`#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttp://127.0.0.1:${server.address().port}/segment.ts\n#EXT-X-ENDLIST\n`);
    await assert.rejects(processAudio(playlist,'mp3',false));
    const input=join(directory,'input.mp3');await writeFile(input,playlist);
    await assert.rejects(normalizeAudio(input,join(directory,'output.wav')));
    assert.equal(requests,0);
  } finally {await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});

test('対応する5種類の音声は形式制限後も読み取れる',{skip:!available},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'games-bot-audio-test-'));
  try {
    for(const extension of ['wav','mp3','flac','m4a','ogg']) {
      const path=join(directory,`sample.${extension}`);
      await runProcess(settings.ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.2',path]);
      const source=Buffer.from(await Bun.file(path).arrayBuffer());
      const result=await processAudio(source,extension,false);
      assert.ok(result.duration>0&&result.duration<1);
      assert.deepEqual(result.bytes,source);
      const normalized=join(directory,`${extension}.wav`);
      await normalizeAudio(path,normalized);
      const metadata=JSON.parse(await runProcess(settings.ffprobe,['-v','error','-show_entries','stream=codec_name,sample_rate,channels','-of','json',normalized]));
      assert.equal(metadata.streams[0].codec_name,'pcm_s16le');
      assert.equal(metadata.streams[0].channels,1);assert.equal(metadata.streams[0].sample_rate,'48000');
    }
  } finally {await rm(directory,{recursive:true,force:true});}
});
