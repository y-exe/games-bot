export const textFontCatalog={
  mochiy:{label:'もっちーぽっぷ',family:'Mochiy',file:'MochiyPopOne-Regular.ttf'},
  serif:{label:'明朝体(NotoSerifJP)',family:'NotoSerif',file:'NotoSerifJP-Black.ttf'},
  gothic:{label:'ゴシック',family:'TextMplusBold',file:'megamoji/Mplus1-Bold.woff'},
  gothicblack:{label:'ゴシック極太',family:'TextMplusBlack',file:'megamoji/Mplus1-Black.woff'},
  rounded:{label:'丸ゴ',family:'TextRoundedBold',file:'megamoji/m-plus-rounded-1c-v10-latin_japanese-700.woff'},
  roundedblack:{label:'丸ゴ極太',family:'TextRoundedBlack',file:'megamoji/m-plus-rounded-1c-v10-latin_japanese-900.woff'},
  dela:{label:'デラゴシック',family:'TextDela',file:'megamoji/DelaGothicOne-Regular.woff'},
  akazukin:{label:'あかずきんポップ',family:'TextAkazukin',file:'megamoji/AkazukiPOP.woff'},
  zero:{label:'零ゴシック',family:'TextZero',file:'megamoji/ZeroGothic.woff'},
  kurobara:{label:'黒薔薇シンデレラ',family:'TextKurobara',file:'megamoji/kurobara-cinderella.woff'},
  hachimarupop:{label:'はちまるポップ',family:'TextHachiMaru',file:'megamoji/HachiMaruPop-Regular.woff'},
  chikarayowaku:{label:'851チカラヨワク',family:'TextChikara',file:'megamoji/ChikaraYowaku.woff'},
  tamanegi:{label:'玉ねぎ楷書「激」',family:'TextTamanegi',file:'TamanegiKaishoGeki.ttf',external:true},
  pixelmplus:{label:'PixelMplus',family:'TextPixelMplus',file:'megamoji/PixelMplus12-Bold.woff'},
  togetoge:{label:'極太トゲトゲ',family:'TextTogeToge',file:'megamoji/GokubutoTogeToge.woff'},
  rampart:{label:'ランパート',family:'TextRampart',file:'megamoji/RampartOne-Regular.woff'},
} as const;
export type TextFont=keyof typeof textFontCatalog;
export const textFonts=Object.fromEntries(Object.entries(textFontCatalog).map(([key,font])=>[key,font.label])) as Record<TextFont,string>;
export const isTextFont=(value:unknown):value is TextFont=>typeof value==='string'&&Object.hasOwn(textFontCatalog,value);
