import fs from 'fs'
import Bytes from '../lib/bytes.js'

// https://libpng.org/pub/png/spec/iso/index-object.html
// https://www.cnblogs.com/senior-engineer/p/9548347.html
const { str, uint8, uint32_big, raw } = Bytes.types

const colorTypeEnum = {
  0: '灰度',
  2: 'RGB',
  3: '调色板',
  4: '灰度+α',
  6: 'RGB+α',
}

const headerChunkConfig = [
  { name: 'width', length: 4, type: uint32_big },
  { name: 'height', length: 4, type: uint32_big },
  { name: 'bitDepth', length: 1, type: uint8 },
  { name: 'colorType', length: 1, type: uint8, enum: colorTypeEnum },
  { name: 'compressionMethod', length: 1, type: uint8 },
  { name: 'filterMethod', length: 1, type: uint8 },
  { name: 'interlaceMethod', length: 1, type: uint8 },
]

const paletteChunkConfig = [
  {
    name: 'palette',
    length: 3,
    n: (obj, bytes) => bytes.length / 3,
    type: raw,
  }
]

const chunkTypeEnum = {
  IHDR: {
    name: 'header',
    type: headerChunkConfig,
  },
  PLTE: {
    name: 'palette',
    type: paletteChunkConfig,
  },
  IDAT: { name: 'data' },
  IEND: { name: 'end' }, // 00 00 00 00 49 45 4E 44 AE 42 60 82
  bKGD: { name: 'background' },
  cHRM: { name: 'chromaticity' },
  gAMA: { name: 'gamma' },
  hIST: { name: 'histogram' },
  pHYs: { name: 'physical' },
  sBIT: { name: 'significant' },
  tTXt: { name: 'text' },
  tIME: { name: 'time' },
  tRNS: { name: 'transparency' },
  zTXt: { name: 'compressed text' },
}

const chunkConfig = [
  { name: 'length', length: 4, type: uint32_big },
  { name: 'type', length: 4, type: str },
  {
    name: 'data',
    length: (obj) => obj.length,
    type: {
      fromBytes (bytes, obj) {
        const chunkType = chunkTypeEnum[obj.type]?.type
        if (chunkType) {
          return Bytes.toObj(chunkType, bytes, 0)
        }
        return bytes
      },
    },
  },
  { name: 'crc', length: 4, type: raw }, // crc32(data=type+data, poly=04c11db7, in=ffffffff, out=ffffffff, refin=true, refout=true)
]

const Png = {
  info (bytes) {
    const config = [
      { name: 'signature', length: 8, type: str }, // '\x89PNG\r\n\x1a\n'
      { name: 'chunks', type: chunkConfig },
    ]
    const obj = Bytes.toObj(config, bytes, 0)
    let chunk = obj.chunks
    obj.chunks = [chunk]
    let offset = 8
    while (true) {
      offset += chunk.length + 12
      if (offset >= bytes.length || chunk.type === 'IEND') break
      chunk = Bytes.toObj(chunkConfig, bytes, offset)
      obj.chunks.push(chunk)
    }
    return obj
  },
  async cli (argv) {
    if (argv[0] === 'info' && argv[1]) {
      const bytes = await fs.promises.readFile(argv[1])
      console.dir(Png.info(bytes), { depth: 10 })
    } else {
      console.log(`
usage: bytes png COMMAND FIN

command:
  info  show png info
`)
    }
  }
}

export default Png