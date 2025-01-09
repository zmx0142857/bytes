import { promises as fs } from 'fs'
import Bytes from '../lib/bytes.js'

const ChunkType = {
  fromBytes (bytes) {
    const value = Bytes.toUint32(bytes)
    if (value === 0x4E4F534A) return 'JSON'
    if (value === 0x004E4942) return 'BIN'
  },
  toBytes (type) {
    if (type === 'JSON') return Bytes.fromUint32(0x4E4F534A)
    if (type === 'BIN') return Bytes.fromUint32(0x004E4942)
  },
}

// spec: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
const glbConfig = [
  { name: 'magic', length: 4, type: 'string' },
  { name: 'version', length: 4, type: 'number' },
  { name: 'length', length: 4, type: 'number' },
]

const glbChunkConfig = [
  { name: 'chunkLength', length: 4, type: 'number' },
  { name: 'chunkType', length: 4, type: ChunkType },
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
  async fromGltf (str, outputPath = './output.glb') {
    const info = JSON.parse(str)
    const buffers = info.buffers.map(buf => {
      const data = Bytes.fromBase64(buf.uri.split(',')[1])
      delete buf.uri
      return {
        name: buf.name,
        byteLength: buf.byteLength,
        data,
        head: Bytes.fromObj(glbChunkConfig, {
          chunkLength: buf.byteLength,
          chunkType: 'BIN',
        }),
      }
    })
    const jsonData = Bytes.fromStr(JSON.stringify(info))
    const jsonHead = Bytes.fromObj(glbChunkConfig, {
      chunkLength: jsonData.length,
      chunkType: 'JSON',
    })
    const fileData = Bytes.join([
      jsonHead,
      jsonData,
      ...buffers.map(buf => Bytes.join([buf.head, buf.data]))
    ])
    const fileHead = Bytes.fromObj(glbConfig, {
      magic: 'glTF',
      version: 2,
      length: 12 + fileData.length,
    })
    return fs.writeFile(outputPath, Bytes.join([fileHead, fileData]))
  },
}

export default Glb
