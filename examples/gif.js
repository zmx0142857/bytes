import fs from 'fs'
import Bytes from '../lib/bytes.js'

const { str, uint8, uint16 } = Bytes.types

// 文件头
// https://blog.csdn.net/Swallow_he/article/details/76165202
// https://zhuanlan.zhihu.com/p/655933856
const headerConfig = [
  { name: 'signature', length: 3, type: str },
  { name: 'version', length: 3, type: str },
  { name: 'width', length: 2, type: uint16 }, // 像素宽
  { name: 'height', length: 2, type: uint16 }, // 像素高
  { name: 'flags', length: 1, type: uint8 }, // 标志位
  { name: 'backgroundIndex', length: 1, type: uint8 }, // 背景颜色索引
  { name: 'aspect', length: 1, type: uint8 }, // 宽高比
]

const imageDescriptorConfig = [
  { name: 'magic', length: 1, type: uint8 }, // 0x2c
  { name: 'left', length: 2, type: uint16 }, // 左边坐标
  { name: 'top', length: 2, type: uint16 }, // 上边坐标
  { name: 'width', length: 2, type: uint16 }, // 图像宽度
  { name: 'height', length: 2, type: uint16 }, // 图像高度
  { name: 'flags', length: 1, type: uint8 }, // 标志位
]

const extensionsDict = {
  [0xff]: {
    name: 'ApplicationExtension',
    type: [
      { name: 'vendor', type: str, length: (obj, bytes) => bytes.length - 4 },
      { name: 'blockSize', length: 1, type: uint8 },
      { name: 'appId', length: 1, type: uint8 },
      { name: 'loopCount', length: 2, type: uint16 },
    ]
  },
  [0xfe]: {
    name: 'CommentExtension',
  },
  [0xf9]: {
    name: 'GraphicControlExtension',
    type: [
      { name: 'flags', length: 1, type: uint8 }, // 标志位
      { name: 'delay', length: 2, type: uint16 }, // 延迟时间
      { name: 'transparentIndex', length: 1, type: uint8 }, // 透明颜色索引
    ],
  },
  [0x01]: {
    name: 'PlainTextExtension',
  },
  [0x2c]: {
    name: 'ImageDescriptor',
  },
  [0x3b]: {
    name: 'Trailer',
  },
}

const extensionsType = {
  fromBytes (bytes) {
    const extensions = []
    let offset = 0
    while (true) {
      const slice = bytes.slice(offset, offset + 3)
      const [magic, label, size] = slice
      if (magic !== 0x21) break
      const start = offset + 3
      offset += size + 3
      while (bytes[offset] !== 0x0) {
        offset += bytes[offset] + 1
      }
      const type = extensionsDict[label]?.type
      const content = bytes.slice(start, offset)
      const data = type ? Bytes.toObj(type, content, 0) : { data: content }
      extensions.push({
        label: extensionsDict[label]?.name || label,
        length: content.length + 4,
        ...data
      })
      ++offset // 跳过 0x0
    }
    return extensions
  },
}

const Gif = {
  info (bytes) {
    const config = [
      { name: 'header', length: 13, type: headerConfig },
      {
        name: 'globalColorTable',
        length: 3,
        n: (obj) => obj.header.flags & 0x80 ? 1 << ((obj.header.flags & 0x07) + 1) : 0,
        type: {
          fromBytes: (bytes) => [...bytes],
        },
      },
      {
        name: 'extensions',
        type: extensionsType,
      },
      {
        name: 'descriptor',
        length: 10,
        type: imageDescriptorConfig,
        offset: (obj) => obj.extensions.reduce((a, b) => a + b.length, 13 + obj.globalColorTable.length * 3),
      },
      {
        name: 'localColorTable',
        length: 3,
        n: (obj) => obj.descriptor.flags & 0x80 ? 1 << ((obj.descriptor.flags & 0x07) + 1) : 0,
        type: {
          fromBytes: (bytes) => [...bytes],
        },
      },
      {
        name: 'imageData',
        type: {
          fromBytes: (bytes) => bytes,
        }
      }
    ]
    return Bytes.toObj(config, bytes, 0)
  },
  async cli (argv) {
    if (argv[0] === 'info' && argv[1]) {
      const bytes = await fs.promises.readFile(argv[1])
      console.dir(Gif.info(bytes), { depth: 10 })
    } else {
      console.log(`
usage: bytes gif COMMAND FIN

command:
  info  show gif info
`)
    }
  }
}

export default Gif