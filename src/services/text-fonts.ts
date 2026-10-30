import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {GlobalFonts} from '@napi-rs/canvas';
import {settings} from '../config.js';
import {textFontCatalog,type TextFont} from '../data/text-fonts.js';
import {UserError} from '../errors.js';

const registered=new Set<TextFont>();
export function textFontFile(key:TextFont) {
  const font=textFontCatalog[key];return 'external' in font?join(settings.dataDir,'fonts',font.file):join('assets/fonts',font.file);
}
export function ensureTextFont(key:TextFont) {
  const font=textFontCatalog[key];
  if(!registered.has(key)) {
    const path=textFontFile(key);
    if(!existsSync(path)||!GlobalFonts.registerFromPath(path,font.family))throw new UserError(`${font.label}のフォントを読み込めません。管理者にフォントの配置を確認してもらってください。`);
    registered.add(key);
  }
  return font.family;
}
