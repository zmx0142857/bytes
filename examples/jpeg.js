import fs from 'fs/promises'
import Bytes from '../lib/bytes.js'

const { str, uint8, uint16_big, uint32_big } = Bytes.types

const blockConfig = [
  { name: 'padding', length: 1, type: uint8 }, // 0xff
  // 段类型标记码
  {
    name: 'type',
    length: 1,
    type: {
      fromBytes (bytes) {
        const value = bytes[0]
        const res = blockTypeOptions.find(v => v.value === value)
        if (res) return res.label
        // if (value >= 0xc0 && value <= 0xc2) return 'SOF0'
        // if (value >= 0xd0 && value <= 0xd7) return 'RST0'
        // if (value >= 0xe0 && value <= 0xef) return 'APP0'
        return value
      },
    },
  },
]

const tiffConfig = [
  { name: 'byteOrder', length: 2, type: str }, // II (little endian) or MM (big endian)
  { name: 'magic', length: 2, type: uint16_big },
  { name: 'IFD_Offset', length: 4, type: uint32_big },
]

// image file directory
const ifdConfig = [
  { name: 'fieldTag', length: 2, type: uint16_big },
  { name: 'fieldType', length: 2, type: uint16_big },
  { name: 'count', length: 4, type: uint32_big },
  { name: 'valueOffset', length: 4, type: uint32_big },
]

const blockTypeOptions = [
  {
    value: 0xd8,
    label: 'SOI',
  },
  {
    value: 0xd9,
    label: 'EOI',
  },
  {
    value: 0xe0,
    label: 'APP0',
    config: [
      { name: 'length', length: 2, type: uint16_big },
      { name: 'format', length: 5, type: str },
      { name: 'majorVersion', length: 1, type: uint8 },
      { name: 'minorVersion', length: 1, type: uint8 },
      { name: 'densityUnit', length: 1, type: uint8 },
      { name: 'densityX', length: 2, type: uint16_big },
      { name: 'densityY', length: 2, type: uint16_big },
      { name: 'thumbnailW', length: 1, type: uint8 },
      { name: 'thumbnailH', length: 1, type: uint8 },
    ],
  },
  {
    value: 0xe1,
    label: 'APP1', // Exif
    config: [
      { name: 'length', length: 2, type: uint16_big },
      { name: 'format', length: 6, type: str },
      ...tiffConfig,
      ...ifdConfig,
    ],
  },
  {
    value: 0xdb,
    label: 'DQT', // 定义量化表
    config: [
      { name: 'length', length: 2, type: uint16_big },
      {
        name: 'info',
        length: 1,
        type: {
          fromBytes ([value]) {
            return {
              qtId: value & 0xf,
              bytesPerComponent: (value >> 4 &0xf) ? 2 : 1,
            }
          },
        },
      },
      {
        name: 'qt',
        length: (obj) => 64 * obj.info.bytesPerComponent,
      },
    ],
  },
  {
    value: 0xc0,
    label: 'SOF0',
    config: [
      { name: 'length', length: 2, type: uint16_big },
      { name: 'bitsPerComponent', length: 1, type: uint8 },
      { name: 'imgHeight', length: 2, type: uint16_big },
      { name: 'imgWidth', length: 2, type: uint16_big },
      { name: 'nComponents', length: 1, type: uint8 },
    ],
  },
  {
    value: 0xc4,
    label: 'DHT',
    config: [
      { name: 'length', length: 2, type: uint16_big },
    ],
  },
  {
    value: 0xda,
    label: 'SOS',
    config: [
      { name: 'length', length: 2, type: uint16_big },
      { name: 'nComponents', length: 1, type: uint8 },
    ],
  },
  {
    value: 0xfe,
    label: 'COM',
    config: [
      { name: 'length', length: 2, type: uint16_big },
    ],
  },
  {
    value: 0xdd,
    label: 'DRI',
    config: [
      { name: 'length', length: 2, type: uint16_big },
      { name: 'interval', length: 2, type: uint16_big },
    ],
  },
  {
    value: 0xd0,
    label: 'RST0',
  },
]

const Jpeg = {
  info(bytes) {
    const res = []
    let offset = 0
    let SOF0
    while (offset < bytes.length) {
      const block = Bytes.toObj(blockConfig, bytes, offset)
      if (block.padding !== 0xff) {
        console.error('err:', block)
        break
      }
      delete block.padding

      const type = blockTypeOptions.find(v => v.label === block.type)
      if (block.type == 'SOI' || block.type == 'EOI') {
        block.length = 0
      } else {
        if (type) {
          if (type.config) {
            Object.assign(block, Bytes.toObj(type.config, bytes, offset + 2))
          }
        } else {
          block.length = uint16_big.fromBytes(bytes.slice(offset + 2, offset + 4))
        }
      }

      res.push(block)
      offset += block.length + 2
      if (block.type === 'SOF0') {
        SOF0 = block
      } else if (block.type === 'SOS') {
        const { imgWidth, imgHeight, nComponents } = SOF0
        offset += nComponents * imgWidth * imgHeight
      }
    }
    return res
  },
  async cli (argv) {
    if (argv[2] === 'info') {
      const bytes = await fs.readFile(argv[3])
      console.dir(this.info(bytes), { depth: null })
    } else {
      console.log(`
usage: node index.js COMMAND PATH

command:
  info      show jpeg info
`)
    }
  }
}

export default Jpeg