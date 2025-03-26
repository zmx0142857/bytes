import fs from 'fs/promises'
import Bytes from '../lib/bytes.js'

const { str, uint8, uint16, uint32 } = Bytes.types

// 文件头, 14bytes
// https://www.cnblogs.com/wainiwann/p/7086844.html
const bmpHeaderConfig = [
  { name: 'type', length: 2, type: str }, // 文件类型: BM|BA|CI|CP|IC|PT
  { name: 'fileSize', length: 4, type: uint32 }, // 文件大小
  { name: 'reserved1', length: 2, type: uint16 }, // 保留字段, 为 0
  { name: 'reserved2', length: 2, type: uint16 }, // 保留字段, 为 0
  { name: 'offset', length: 4, type: uint32 }, // 图像数据的偏移量
]

// 信息头
const infoHeaderConfig = [
  { name: 'size', length: 4, type: uint32 }, // 信息头大小: 12|40|64|108|124, 常见为 40
  { name: 'width', length: 4, type: uint32 }, // 图像宽度
  { name: 'height', length: 4, type: uint32 }, // 图像高度
  { name: 'planes', length: 2, type: uint16 }, // 颜色平面数, 为 1
  { name: 'bitCount', length: 2, type: uint16 }, // 每个像素的位数: 1|4|8|16|24|32
  { name: 'compression', length: 4, type: uint32 }, // 压缩类型: 0-5
  { name: 'imageSize', length: 4, type: uint32 }, // 图像数据大小. 当 compression=0 时, sizeImage 可能为 0
  { name: 'resolutionX', length: 4, type: uint32 }, // 水平分辨率 (像素/米)
  { name: 'resolutionY', length: 4, type: uint32 }, // 垂直分辨率 (像素/米)
  { name: 'colorUsed', length: 4, type: uint32 }, // 使用的颜色数
  { name: 'colorImportant', length: 4, type: uint32 }, // 重要的颜色数
]

// 调色板
const paletteConfig = [
  { name: 'blue', length: 1, type: uint8 },
  { name: 'green', length: 1, type: uint8 },
  { name: 'red', length: 1, type: uint8 },
  { name: 'alpha', length: 1, type: uint8 }, // 0 表示不透明
]

const Bmp = {
  info (bytes) {
    const config = [
      { name: 'bmpHeader', length: 14, type: bmpHeaderConfig },
      { name: 'infoHeader', length: 40, type: infoHeaderConfig },
      {
        name: 'palette',
        length: 4,
        type: paletteConfig,
        offset: (obj) => 14 + obj.infoHeader.size,
        n: (obj) => (obj.bmpHeader.offset - (14 + obj.infoHeader.size)) / 4 | 0,
      },
      { name: 'data' }, // 像素从图片左下角开始按行排列, 如果有调色板, 则像素表示颜色索引, 否则表示 RGB
    ]
    return Bytes.toObj(config, bytes, 0)
  },
  async cli (argv) {
    if (argv[2] === 'info' && argv[3]) {
      const bytes = await fs.readFile(argv[3])
      console.dir(Bmp.info(bytes), { depth: 10 })
    } else {
      console.log(`
usage: node index.js COMMAND PATH

command:
  info  show bmp info
`)
    }
  }
}

export default Bmp