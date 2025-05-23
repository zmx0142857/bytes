import fs from 'fs'
import readline from 'readline'
import Bytes from '../lib/bytes.js'

const { str, uint32 } = Bytes.types

// https://www.cnblogs.com/onsummer/p/13252898.html
// https://github.com/CesiumGS/3d-tiles/tree/main/specification/TileFormats/PointCloud
const pntsConfig = [
  { name: 'magic', length: 4, type: str },
  { name: 'version', length: 4, type: uint32 },
  { name: 'byteLength', length: 4, type: uint32 },
  { name: 'featureTableJSONByteLength', length: 4, type: uint32 },
  { name: 'featureTableBinaryByteLength', length: 4, type: uint32 },
  { name: 'batchTableJSONByteLength', length: 4, type: uint32 },
  { name: 'batchTableBinaryByteLength', length: 4, type: uint32 },
]

// node.js buffer
const makeBuffer = (arr) => {
  return Buffer.from(new Float32Array(arr).buffer)
}

const makeStrBuffer = (json) => {
  let str = JSON.stringify(json)
  // 对齐 4 字节, 不足补空格
  if (str.length % 4 !== 0) {
    str += ' '.repeat(4 - str.length % 4)
  }
  return Bytes.fromStr(str)
}

const lineReader = async (filePath, onRead) => {
  const stream = fs.createReadStream(filePath)
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  })
  reader.on('line', onRead)
  return new Promise((resolve) => {
    reader.on('close', resolve)
  })
}

const Box3 = () => ({
  min: [Infinity, Infinity, Infinity],
  max: [-Infinity, -Infinity, -Infinity],
  expandByPoint(point) {
    for (let i = 0; i < 3; i++) {
      this.min[i] = Math.min(this.min[i], point[i])
      this.max[i] = Math.max(this.max[i], point[i])
    }
  },
  center() {
    return [
      (this.min[0] + this.max[0]) / 2,
      (this.min[1] + this.max[1]) / 2,
      (this.min[2] + this.max[2]) / 2,
    ]
  },
  size() {
    return [
      this.max[0] - this.min[0],
      this.max[1] - this.min[1],
      this.max[2] - this.min[2],
    ]
  },
  boundingVolume() {
    const size = this.size()
    return {
      box: [
        ...this.center(),
        size[0] / 2, 0, 0,
        0, size[1] / 2, 0,
        0, 0, size[2] / 2
      ]
    }
  }
})

const Pnts = {
  outputPnts ({ points, box }) {
    console.log('points count:', points.length)
    console.log('boundingVolume:', JSON.stringify(box.boundingVolume()))
    const featureTable = {
      json: makeStrBuffer({
        POINTS_LENGTH: points.length,
        POSITION: {
          byteOffset: 0,
        }
      }),
      binary: makeBuffer(points.flat()),
    }
    const headerLen = 28
    const header = Bytes.fromObj(pntsConfig, {
      magic: 'pnts',
      version: 1,
      byteLength: headerLen + featureTable.json.length + featureTable.binary.length,
      featureTableJSONByteLength: featureTable.json.length,
      featureTableBinaryByteLength: featureTable.binary.length,
      batchTableJSONByteLength: 0,
      batchTableBinaryByteLength: 0,
    })
    return Bytes.concat([header, featureTable.json, featureTable.binary])
  },
  debugAxes({ size = 10, count = 30000 }) {
    const box = Box3()
    const points = []
    count = count / 3 | 0
    const step = size / count
    for (let i = 0; i < count; i++) {
      const x = i * step
      points.push([x, 0, 0])
      points.push([0, x, 0])
      points.push([0, 0, x])
    }
    box.min = [0, 0, 0]
    box.max = [size, size, size]
    return this.outputPnts({ points, box })
  },
  // 提取 txt 文件 (例如 cloud compare 的输出文件) 中的 xyz 坐标
  async fromTxt(filePath) {
    const points = []
    const box = Box3()
    await lineReader(filePath, line => {
      line = line.trim()
      if (line) {
        const [x, y, z, r, g, b, nx, ny, nz] = line.trim().split(/\s+/g).map(Number)
        const point = [x / 1000, y / 1000, z / 1000]
        box.expandByPoint(point)
        points.push(point)
      }
    })
    return this.outputPnts({ points, box })
  },
  // 提取 obj 模型中的顶点如 v 78330.000009 52199.968566 -60.000000
  async fromObj(filePath) {
    const points = []
    const box = Box3()
    await lineReader(filePath, line => {
      if (line.startsWith('v ')) {
        const [x, y, z] = line.split(/\s+/g).slice(1).map(Number)
        const point = [x / 1000, y / 1000, z / 1000]
        box.expandByPoint(point)
        points.push(point)
      }
    })
    return this.outputPnts({ points, box })
  },
  async cli(argv) {
    if (argv.length >= 3 && argv[0] === 'fromTxt') {
      const buffer = await Pnts.fromTxt(argv[1])
      await fs.promises.writeFile(argv[2], buffer)
    } else if (argv.length >= 3 && argv[0] === 'fromObj') {
      const buffer = await Pnts.fromObj(argv[1])
      await fs.promises.writeFile(argv[2], buffer)
    } else {
      console.log(`
usage: bytes pnts COMMAND FIN [FOUT]

command:
  fromTxt   convert points.txt to points.pnts
  fromObj   convert points.obj to points.pnts
`)
    }
  },
}

export default Pnts