import fs from 'fs/promises'
import Bytes from '../lib/bytes.js'

const { str, uint32 } = Bytes.types

// spec: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
const glbConfig = [
  { name: 'magic', length: 4, type: str },
  { name: 'version', length: 4, type: uint32 },
  { name: 'length', length: 4, type: uint32 },
]

const glbChunkConfig = [
  { name: 'chunkLength', length: 4, type: uint32 },
  {
    name: 'chunkType',
    length: 4,
    type: str, // 'JSON' or 'BIN\x00'
  },
]

const Glb = {
  info (bytes) {
    let res = {}, offset = 0
    const header = Bytes.toObj(glbConfig, bytes, offset)
    offset += 12
    while (offset < header.length) {
      const chunkHeader = Bytes.toObj(glbChunkConfig, bytes, offset)
      offset += 8
      if (chunkHeader.chunkType === 'JSON') {
        const json = Bytes.toStr(bytes.slice(offset, offset + chunkHeader.chunkLength))
        res = JSON.parse(json)
        res.buffers.length = 0
      } else {
        const data = bytes.slice(offset, offset + chunkHeader.chunkLength)
        res.buffers.push({
          name: String(res.buffers.length),
          byteLength: chunkHeader.chunkLength,
          data,
        })
      }
      offset += chunkHeader.chunkLength
    }
    return res
    // return res.buffers
  },
  async toGltf (bytes, outputPath = './output.gltf') {
    const info = Glb.info(bytes)
    info.buffers = info.buffers.map(buf => {
      buf.uri = `data:application/octet-stream;base64,${Bytes.toBase64(buf.data)}`
      delete buf.data
      return buf
    })
    info.meshes.forEach(mesh => {
      mesh.primitives.forEach(primitive => {
        if (primitive.mode === undefined) primitive.mode = 4 // triangle mode
      })
      return mesh
    })
    return fs.writeFile(outputPath, JSON.stringify(info, null, 2) + '\n')
  },
  async toGlb (info, outputPath = './output.glb') {
    const buffers = info.buffers.map(buf => {
      const data = buf.data || Bytes.fromBase64(buf.uri.split(',')[1])
      delete buf.uri
      delete buf.data
      return {
        name: buf.name,
        byteLength: buf.byteLength,
        data,
        head: Bytes.fromObj(glbChunkConfig, {
          chunkLength: buf.byteLength,
          chunkType: 'BIN\0',
        }),
      }
    })
    let str = JSON.stringify(info)
    if (str.length % 4) str += ' '.repeat(4 - str.length % 4) // align to 4 bytes
    const jsonData = Bytes.fromStr(str)
    const jsonHead = Bytes.fromObj(glbChunkConfig, {
      chunkLength: jsonData.length,
      chunkType: 'JSON',
    })
    const fileData = Bytes.concat([
      jsonHead,
      jsonData,
      ...buffers.map(buf => Bytes.concat([buf.head, buf.data]))
    ])
    const fileHead = Bytes.fromObj(glbConfig, {
      magic: 'glTF',
      version: 2,
      length: 12 + fileData.length,
    })
    return fs.writeFile(outputPath, Bytes.concat([fileHead, fileData]))
  },
  // 合并重复的 buffers 和 bufferViews
  // TODO: 合并重复的 accessors 和 meshes
  async simp (bytes, outputPath = './output.glb') {
    const info = Glb.info(bytes)
    const res = []
    const map = []
    let offset = 0
    info.bufferViews.forEach(bufferView => {
      const { buffer, byteOffset, byteLength, target, byteStride } = bufferView
      const data = info.buffers[buffer].data.slice(byteOffset, byteOffset + byteLength)
      let index = res.findIndex(v => {
        const flag = v.byteLength === byteLength && v.target === target && v.byteStride === byteStride
        if (!flag) return false
        for (let i = 0; i < byteLength; i++) {
          if (data[i] !== v.data[i]) return false
        }
        return true
      })
      if (index === -1) {
        res.push({
          ...bufferView,
          buffer: 0,
          byteOffset: offset,
          data,
        })
        offset += byteLength
        index = res.length - 1
      }
      map.push(index)
    })
    info.images?.forEach(image => image.bufferView = map[image.bufferView])
    info.accessors?.forEach(acc => acc.bufferView = map[acc.bufferView])
    // TODO: 其它字段是否用到 bufferView?

    console.log('bufferViews:', info.bufferViews.length, '->', res.length)
    const data = Bytes.concat(res.map(v => v.data))
    info.buffers = [
      { data, byteLength: data.length },
    ]
    info.bufferViews = res.map(v => {
      delete v.data
      return v
    })
    // const imageView = info.bufferViews[274]
    // const image = data.slice(imageView.byteOffset, imageView.byteOffset + imageView.byteLength)
    // fs.writeFile('./image.png', image)
    return Glb.toGlb(info, outputPath)
  },
  async cli (argv) {
    if (argv[2] === 'info') {
      const bytes = await fs.readFile(argv[3])
      console.dir(Glb.info(bytes), { depth: null })
    } else if (argv[2] === 'gltf') {
      const bytes = await fs.readFile(argv[3])
      Glb.toGltf(bytes, argv[4])
    } else if (argv[2] === 'glb') {
      const bytes = await fs.readFile(argv[3], 'utf-8')
      Glb.toGlb(JSON.parse(bytes), argv[4])
    } else if (argv[2] === 'simp') {
      const bytes = await fs.readFile(argv[3])
      Glb.simp(bytes, argv[4])
    } else {
      console.log(`
usage: node index.js COMMAND PATH

command:
  info      show glb info
  gltf      convert glb to gltf
  glb       convert gltf to glb
  simp      simplify glb
`)
    }
  }

}

export default Glb
