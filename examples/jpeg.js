import fs from 'fs/promises'
import Bytes from '../lib/bytes.js'

// http://www.fifi.org/doc/jhead/exif-e.html

const { str, uint8, uint16_big, uint32_big } = Bytes.types

const markerConfig = [
  { name: 'padding', length: 1, type: uint8 }, // 0xff
  // 段类型标记码
  {
    name: 'type',
    length: 1,
    type: {
      fromBytes (bytes) {
        const value = bytes[0]
        const res = markerTypeOptions.find(v => v.value === value)
        if (res) return res.label
        // if (value >= 0xc0 && value <= 0xc2) return 'SOF0'
        // if (value >= 0xd0 && value <= 0xd7) return 'RST0'
        // if (value >= 0xe0 && value <= 0xef) return 'APP0'
        return value
      },
    },
  },
]

const ifdTagDict = {
  // IFD0 (main image)
  [0x010e]: 'ImageDescription',
  [0x010f]: 'Make',
  [0x0110]: 'Model',
  [0x0112]: 'Orientation',
  [0x011a]: 'XResolution',
  [0x011b]: 'YResolution',
  [0x0128]: 'ResolutionUnit',
  [0x0131]: 'Software',
  [0x0132]: 'DateTime',
  [0x013e]: 'WhitePoint',
  [0x013f]: 'PrimaryChromaticities',
  [0x0211]: 'YCbCrCoefficients',
  [0x0213]: 'YCbCrPositioning',
  [0x0214]: 'ReferenceBlackWhite',
  [0x8298]: 'Copyright',
  [0x8769]: 'ExifOffset',
  // IFD1 (thumbnail)
  [0x0100]: 'ImageWidth',
  [0x0101]: 'ImageLength',
  [0x0102]: 'BitsPerSample',
  [0x0103]: 'Compression',
  [0x0106]: 'PhotometricInterpretation',
  [0x0111]: 'StripOffsets',
  [0x0115]: 'SamplesPerPixel',
  [0x0116]: 'RowsPerStrip',
  [0x0117]: 'StripByteCounts',
  [0x0201]: 'JpegIFOffset',
  [0x0202]: 'JpegIFByteCount',

  // exif subIFD
  [0xa001]: 'ColorSpace',
  [0xa002]: 'ExifImageWidth',
  [0xa003]: 'ExifImageHeight',
  [0xa005]: 'ExifInteroperabilityOffset',
  // misc
  [0x8825]: 'GPSInfo',
}

const ifdDataformatDict = {
  1: { label: 'unsigned byte', length: 1 }, // length: bytes per component
  2: { label: 'ascii strings', length: 1 },
  3: { label: 'unsigned short', length: 2 },
  4: { label: 'unsigned long', length: 4 },
  5: { label: 'unsigned rational', length: 8 },
  6: { label: 'signed byte', length: 1 },
  7: { label: 'undefined', length: 1 },
  8: { label: 'signed short', length: 2 },
  9: { label: 'signed long', length: 4 },
  10: { label: 'signed rational', length: 8 },
  11: { label: 'single float', length: 4 },
  12: { label: 'double float', length: 8 },
}

const ifdEntryConfig = [
  {
    name: 'tag',
    length: 2,
    type: {
      fromBytes(bytes) {
        const value = Bytes.types.uint16_big.fromBytes(bytes)
        return ifdTagDict[value] ?? value
      },
    },
  },
  {
    name: 'format',
    length: 2,
    type: {
      fromBytes(bytes) {
        const value = Bytes.types.uint16_big.fromBytes(bytes)
        return ifdDataformatDict[value] ?? value
      },
    },
  },
  { name: 'count', length: 4, type: uint32_big },
  { name: 'valueOffset', length: 4, type: uint32_big },
]

// image file directory
const ifdConfig = [
  { name: 'entryCount', length: 2, type: uint16_big },
  {
    name: 'entries',
    length: 12,
    n: obj => obj.entryCount,
    type: {
      fromBytes (bytes) {
        const entry = Bytes.toObj(ifdEntryConfig, bytes, 0)
        const length = entry.count * entry.format?.length
        if (length <= 4) {
          entry.value = entry.valueOffset >> (4 - length) * 8
          delete entry.valueOffset
        } else {
          entry.length = length
        }
        return entry
      },
    }
  },
  { name: 'nextOffset', length: 4, type: uint32_big },
]

const tiffConfig = [
  { name: 'byteOrder', length: 2, type: str }, // II (intel, little endian) or MM (motorola, big endian)
  { name: 'magic', length: 2, type: uint16_big }, // 42; TODO: byte order
  { name: 'ifdOffset', length: 4, type: uint32_big }, // offsets used in TIFF start from TIFF header (II or MM)
]

const exifConfig = [
  { name: 'length', length: 2, type: uint16_big },
  { name: 'format', length: 6, type: str },
  {
    name: 'tiffHeader',
    length: undefined,
    type: {
      fromBytes (bytes) {
        const tiffHeader = Bytes.toObj(tiffConfig, bytes, 0)
        const ifds = []
        let offset = tiffHeader.ifdOffset
        while (offset) {
          const ifd = Bytes.toObj(ifdConfig, bytes, offset)
          ifds.push(ifd)
          // resolve entry value
          ifd.entries?.forEach(entry => {
            if (entry.valueOffset && entry.value === undefined) {
              const value = bytes.slice(entry.valueOffset, entry.valueOffset + entry.length)
              if (entry.format.label === 'ascii strings') {
                entry.value = str.fromBytes(value)
              } else if (entry.format.label === 'unsigned rational') {
                entry.value = [
                  uint32_big.fromBytes(value.slice(0, 4)),
                  uint32_big.fromBytes(value.slice(4, 8)),
                ]
              } else {
                entry.value = value
              }
              delete entry.valueOffset
            }
          })
          offset = ifd.nextOffset
        }
        tiffHeader.ifds = ifds
        return tiffHeader
      }
    }
  }
]

const markerTypeOptions = [
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
    config: exifConfig,
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
      const marker = Bytes.toObj(markerConfig, bytes, offset)
      if (marker.padding !== 0xff) {
        console.error('err:', marker)
        break
      }
      delete marker.padding

      const type = markerTypeOptions.find(v => v.label === marker.type)
      if (marker.type == 'SOI' || marker.type == 'EOI') {
        marker.length = 0
      } else {
        if (type) {
          if (type.config) {
            Object.assign(marker, Bytes.toObj(type.config, bytes, offset + 2))
          }
        } else {
          marker.length = uint16_big.fromBytes(bytes.slice(offset + 2, offset + 4))
        }
      }

      res.push(marker)
      offset += marker.length + 2
      if (marker.type === 'SOF0') {
        SOF0 = marker
      } else if (marker.type === 'SOS') {
        const { imgWidth, imgHeight, nComponents } = SOF0
        offset += nComponents * imgWidth * imgHeight
      }
    }
    return res
  },
  async cli (argv) {
    if (argv[0] === 'info') {
      const bytes = await fs.readFile(argv[1])
      console.dir(this.info(bytes), { depth: null })
    } else {
      console.log(`
usage: bytes jpeg COMMAND FIN

command:
  info      show jpeg info
`)
    }
  }
}

export default Jpeg