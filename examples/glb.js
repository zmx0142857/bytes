import fs from 'fs'
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

const accessorTypes = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
}

const accessorComponentTypes = {
  5120: { name: 'int8', length: 1 },
  5121: { name: 'uint8', length: 1 },
  5122: { name: 'int16', length: 2 },
  5123: { name: 'uint16', length: 2 },
  5125: { name: 'uint32', length: 4 },
  5126: { name: 'float32', length: 4 },
}

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
    return fs.promises.writeFile(outputPath, JSON.stringify(info, null, 2) + '\n')
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
    let jsonData = Bytes.fromStr(JSON.stringify(info))
    // align to 4 bytes
    if (jsonData.length % 4) {
      jsonData = Bytes.concat([jsonData, new Uint8Array(4 - jsonData.length % 4).fill(32)]) // fill with space
    }
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
    return fs.promises.writeFile(outputPath, Bytes.concat([fileHead, fileData]))
  },
  // 合并重复的 buffers 和 bufferViews
  // TODO: 合并重复的 accessors 和 meshes
  async simp (info, outputPath = './output.glb') {
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
        // align to 4 bytes
        let len = byteLength
        let buf = data
        if (len % 4) {
          const rest = 4 - len % 4
          buf = Bytes.concat([data, new Uint8Array(rest)])
          len += rest
        }

        res.push({
          ...bufferView,
          buffer: 0,
          byteOffset: offset,
          data: buf,
        })
        offset += len
        index = res.length - 1
      }
      map.push(index)
    })

    info.images?.forEach(v => v.bufferView = map[v.bufferView])
    info.accessors?.forEach(v => {
      const i = v.bufferView = map[v.bufferView]
      const bufferView = res[i]
      // 当多个 accessor 共用一个 bufferView 时, 必须指定 byteStride
      if (bufferView.byteStride === undefined) {
        const { type, componentType } = v
        const stride = bufferView.byteStride = accessorTypes[type] * accessorComponentTypes[componentType]?.length || 0
        if (stride === 0 || stride % 4 || type === 'SCALAR') {
          // console.warn(`invalid bufferViews[${i}].byteStride:`, stride)
          delete bufferView.byteStride
        }
      }
      // sparse accessors
      if (v.sparse) {
        const { indices, values } = v.sparse
        indices.bufferView = map[indices.bufferView]
        values.bufferView = map[values.bufferView]
      }
    })
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
    return Glb.toGlb(info, outputPath)
  },
  async image (bytes, outputPath = '.') {
    const info = Glb.info(bytes)
    await Promise.all(info.images?.map(async image => {
      const { bufferView, mimeType, name } = image
      const { buffer, byteOffset, byteLength } = info.bufferViews[bufferView]
      const imageBuffer = info.buffers[buffer].data.slice(byteOffset, byteOffset + byteLength)
      const filename = name + '.' + (mimeType.split('/')[1] || 'png')
      fs.promises.writeFile(outputPath + '/' + filename, imageBuffer)
    }))
    console.log(`extracted ${info.images?.length || 0} image(s)`)
  },
  async changeImage (bytes, outputPath = '.', imageDir = '.', imageNames = []) {
    const info = Glb.info(bytes)
    let count = 0
    await Promise.all(imageNames.map(async imageName => {
      const index = imageName.lastIndexOf('.')
      const name = imageName.slice(0, index === -1 ? undefined : index)
      const image = info.images?.find(v => v.name === name)
      if (image) {
        ++count
        const bufferView = info.bufferViews[image.bufferView]
        const buffer = info.buffers[bufferView.buffer]
        const imageBuf = await fs.promises.readFile(imageDir + '/' + imageName)
        console.log(`${imageName}: ${bufferView.byteLength} -> ${imageBuf.length}`)
        bufferView.byteLength = imageBuf.length
        for (let i = 0; i < imageBuf.length; i++) {
          buffer.data[bufferView.byteOffset + i] = imageBuf[i]
        }
      }
    }))
    console.log(`changed ${count} image(s)`)
    if (count > 0) {
      return Glb.simp(info, outputPath)
    }
  },
  async metalness (bytes, outputPath = '.', value = 0) {
    const info = Glb.info(bytes)
    info.materials?.forEach(m => {
      if (m.pbrMetallicRoughness) {
        m.pbrMetallicRoughness.metallicFactor = value
      }
    })
    return Glb.toGlb(info, outputPath)
  },
  async cli (argv) {
    if (argv[2] === 'info') {
      const bytes = await fs.promises.readFile(argv[3])
      console.dir(Glb.info(bytes), { depth: null })
    } else if (argv[2] === 'gltf') {
      const bytes = await fs.promises.readFile(argv[3])
      Glb.toGltf(bytes, argv[4])
    } else if (argv[2] === 'glb') {
      const bytes = await fs.promises.readFile(argv[3], 'utf-8')
      Glb.toGlb(JSON.parse(bytes), argv[4])
    } else if (argv[2] === 'simp') {
      const bytes = await fs.promises.readFile(argv[3])
      const info = Glb.info(bytes)
      Glb.simp(info, argv[4])
    } else if (argv[2] === 'image') {
      const bytes = await fs.promises.readFile(argv[3])
      Glb.image(bytes, argv[4])
    } else if (argv[2]?.startsWith('image=')) {
      const dir = argv[2].split('=')[1]
      if (!dir) return console.error('image=dir is required')
      const isDir = fs.statSync(dir).isDirectory()
      let imageDir = dir
      let imageNames = []
      if (isDir) {
        imageNames = fs.readdirSync(dir)
      } else {
        const index = dir.lastIndexOf('/')
        imageNames = [dir.slice(index + 1)]
        imageDir = dir.slice(0, index === -1 ? 0 : index)
      }
      const bytes = await fs.promises.readFile(argv[3])
      Glb.changeImage(bytes, argv[4], imageDir, imageNames)
    } else if (argv[2]?.startsWith('metalness')) {
      const bytes = await fs.promises.readFile(argv[3])
      const value = parseFloat(argv[2].split('=')[1]) || 0
      Glb.metalness(bytes, argv[4], value)
    } else {
      console.log(`
usage: node index.js COMMAND INPUT_PATH [OUTPUT_PATH]

command:
  info        show glb info
  gltf        convert glb to gltf
  glb         convert gltf to glb
  simp        simplify glb
  image       extract images from glb
  image=dir   change images in glb
  metalness=x change material metalness to x
`)
    }
  }

}

export default Glb
