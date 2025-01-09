import { promises as fs } from 'fs'
import path from 'path'
import Bytes from '../lib/bytes.js'
import Progress from '../lib/progress.js'

// spec: https://github.com/CesiumGS/3d-tiles
const configs = {
  cmpt: [
    { name: 'magic', length: 4, type: 'string' },
    { name: 'version', length: 4, type: 'number' },
    { name: 'byteLength', length: 4, type: 'number' },
    { name: 'tilesLength', length: 4, type: 'number' },
  ],
  b3dm: [
    { name: 'magic', length: 4, type: 'string' },
    { name: 'version', length: 4, type: 'number' },
    { name: 'byteLength', length: 4, type: 'number' },
    { name: 'featureTableJSONByteLength', length: 4, type: 'number' },
    { name: 'featureTableBinaryByteLength', length: 4, type: 'number' },
    { name: 'batchTableJSONByteLength', length: 4, type: 'number' },
    { name: 'batchTableBinaryByteLength', length: 4, type: 'number' },
  ],
}

configs.i3dm = [
  ...configs.b3dm,
  { name: 'gltfFormat', length: 4, type: 'number' },
]

const Cmpt = {
  /**
   * @returns {Array<CmptHeader | B3dmHeader | I3dmHeader>}
   */
  info (bytes) {
    const headers = []
    const config = configs[Bytes.magic(bytes, 0, 4)]
    const mainHeader = Bytes.toObj(config, bytes, 0)
    headers.push(mainHeader)
    if (mainHeader.magic === 'cmpt') {
      let offset = 16
      for (let i = 0; i < mainHeader.tilesLength; i++) {
        const config = configs[Bytes.magic(bytes, offset, offset + 4)]
        const header = Bytes.toObj(config, bytes, offset)
        headers.push(header)
        offset += header.byteLength
      }
    }
    return headers
  },
  // 将 cmpt 拆分为 b3dm, i3dm
  async split (bytes, outputPath = '.') {
    const headers = Cmpt.info(bytes)
    let offset = 16
    const progress = Progress()
    return Promise.all(headers.slice(1).map(async (header, i) => {
      const { magic } = header
      const filename = path.join(outputPath, `${i}.${magic}`)
      const fileContent = bytes.slice(offset, offset + header.byteLength)
      offset += header.byteLength
      const res = await fs.writeFile(filename, fileContent)
      progress(i / headers.length)
      return res
    }))
  },
  // 提取 cmpt 中的所有 glb 文件
  async glb (bytes, outputPath = '.') {
    const headers = Cmpt.info(bytes)
    let offset = 16
    const progress = Progress()
    return Promise.all(headers.slice(1).map(async (header, i) => {
      const filename = path.join(outputPath, `${i}.glb`)
      const fileContent = bytes.slice(
        offset
        + (header.magic === 'b3dm' ? 28 : 32)
        + header.featureTableJSONByteLength
        + header.featureTableBinaryByteLength
        + header.batchTableJSONByteLength
        + header.batchTableBinaryByteLength,
        offset + header.byteLength
      )
      offset += header.byteLength
      const res = await fs.writeFile(filename, fileContent)
      progress(i / headers.length)
      return res
    }))
  },
  // 将指定目录中的 b3dm, i3dm 合成为一个 cmpt
  async make (dir = '.', outputPath = 'output.cmpt') {
    const exts = ['b3dm', 'i3dm']
    const files = (await fs.readdir(dir)).filter(file => exts.some(ext => file.endsWith('.' + ext))).sort()
    let byteLength = 16
    const buffers = []
    await Promise.all(files.map(async (file, i) => {
      const bytes = await fs.readFile(path.join(dir, file))
      byteLength += bytes.length
      buffers[i] = bytes
    }))
    const headerBytes = Bytes.fromObj(configs.cmpt, {
      magic: 'cmpt',
      version: 1,
      byteLength,
      tilesLength: files.length,
    })
    await fs.writeFile(outputPath, Bytes.join([headerBytes, ...buffers]))
  },
}

export default Cmpt