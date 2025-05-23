import fs from 'fs/promises'
import path from 'path'
import Bytes from '../lib/bytes.js'
import Progress from '../lib/progress.js'

const { str, uint32 } = Bytes.types

// spec: https://github.com/CesiumGS/3d-tiles
const configs = {
  cmpt: [
    { name: 'magic', length: 4, type: str },
    { name: 'version', length: 4, type: uint32 },
    { name: 'byteLength', length: 4, type: uint32 },
    { name: 'tilesLength', length: 4, type: uint32 },
  ],
  b3dm: [
    { name: 'magic', length: 4, type: str },
    { name: 'version', length: 4, type: uint32 },
    { name: 'byteLength', length: 4, type: uint32 },
    { name: 'featureTableJSONByteLength', length: 4, type: uint32 },
    { name: 'featureTableBinaryByteLength', length: 4, type: uint32 },
    { name: 'batchTableJSONByteLength', length: 4, type: uint32 },
    { name: 'batchTableBinaryByteLength', length: 4, type: uint32 },
  ],
}

configs.i3dm = [
  ...configs.b3dm,
  { name: 'gltfFormat', length: 4, type: uint32 },
]
configs.pnts = [
  ...configs.b3dm,
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
        const config = configs[Bytes.magic(bytes, offset, 4)]
        const header = Bytes.toObj(config, bytes, offset)
        headers.push(header)
        offset += header.byteLength
      }
    }
    return headers
  },
  // 将 cmpt 拆分为 b3dm, i3dm, pnts
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
  async b3dmOrI3dmToGlb ({
    header,
    bytes,
    offset = 0,
    inputPath = '',
    outputPath = '',
    progress = () => {},
  }) {
    if (!['b3dm', 'i3dm'].includes(header.magic)) {
      return console.warn('not a b3dm/i3dm file: ', inputPath)
    }
    const fileContent = bytes.slice(
      offset
      + (header.magic === 'i3dm' ? 32 : 28)
      + header.featureTableJSONByteLength
      + header.featureTableBinaryByteLength
      + header.batchTableJSONByteLength
      + header.batchTableBinaryByteLength,
      offset + header.byteLength
    )
    offset += header.byteLength
    const res = await fs.writeFile(outputPath || `${inputPath || 0}.glb`, fileContent)
    progress()
    return res
  },
  // 提取 cmpt 中的所有 glb 文件
  async glb (bytes, inputPath = '', outputPath = '') {
    const magic = Bytes.magic(bytes, 0, 4)
    if (magic === 'cmpt') { // cmpt to glb
      const headers = Cmpt.info(bytes)
      let offset = 16
      const progress = Progress()
      return Promise.all(headers.slice(1).map(async (header, i) => {
        return Cmpt.b3dmOrI3dmToGlb({
          header,
          bytes,
          offset,
          inputPath,
          outputPath: path.join(outputPath, `${i}.glb`),
          progress: () => progress(i / headers.length)
        })
      }))
    } else if (magic === 'b3dm' || magic === 'i3dm') { // b3dm/i3dm to glb
      const header = Bytes.toObj(configs[magic], bytes, 0)
      return Cmpt.b3dmOrI3dmToGlb({
        header,
        bytes,
        inputPath,
        outputPath,
      })
    } else {
      console.warn('not a cmpt/b3dm/i3dm file: ', inputPath)
    }
  },
  // 将指定目录中的 b3dm, i3dm 合成为一个 cmpt
  async make (dir = '.', outputPath = 'output.cmpt') {
    const exts = ['b3dm', 'i3dm', 'pnts']
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
    await fs.writeFile(outputPath, Bytes.concat([headerBytes, ...buffers]))
  },
  async cli(argv) {
    if (argv[0] === 'info') {
      const bytes = await fs.readFile(argv[1])
      const headers = Cmpt.info(bytes)
      headers.forEach(header => console.log(header))
    } else if (argv[0] === 'split') {
      const bytes = await fs.readFile(argv[1])
      await Cmpt.split(bytes, argv[2])
    } else if (argv[0] === 'glb') {
      const bytes = await fs.readFile(argv[1])
      await Cmpt.glb(bytes, argv[1], argv[2])
    } else if (argv[0] === 'make') {
      await Cmpt.make(argv[1], argv[2])
    } else {
      console.log(`
usage: bytes cmpt COMMAND FIN [FOUT]

command:
  info    show information of the cmpt file
  split   split cmpt file into b3dm/i3dm files
  make    make cmpt file from b3dm/i3dm files
  glb     extract glb from cmpt/b3dm/i3dm files
`)
    }
  },
}

export default Cmpt