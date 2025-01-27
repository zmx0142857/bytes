const types = {
  str: {
    fromBytes: (bytes) => [...bytes].map(n => String.fromCharCode(n)).join(''),
    // WARN: str 中含有 > 255 的字符的话, 将被转化为 \uxxxx
    toBytes (str) {
      // return Uint8Array.from(str, c => c.charCodeAt(0)) // too naive
      return new Uint8Array(Array.from(str, c => {
        const code = c.charCodeAt(0)
        return code > 255 ? Array.from(`\\u${code.toString(16).padStart(4, '0')}`, c => c.charCodeAt(0)) : code
      }).flat())
    },
  },
  hex: {
    fromBytes: (bytes) => [...bytes].map(n => n.toString(16).padStart(2, '0')).join(' ').toLowerCase(),
    toBytes: (hex) => new Uint8Array(hex.split(' ').map(n => parseInt('0x' + n))),
  },
  base64: {
    fromBytes: (bytes) => btoa(String.fromCharCode.apply(null, bytes)),
    toBytes: (str) => Uint8Array.from(atob(str), c => c.charCodeAt(0)),
  },
  timestamp: {
    // Unix 时间戳, 单位: 秒
    fromBytes: (bytes) => new Date(Bytes.toUint32(bytes) * 1000),
    toBytes: (date) => Bytes.fromUint32(date.valueOf() / 1000 | 0),
  },
  uint8: {
    fromBytes: (bytes) => bytes[0],
    toBytes: (value) => new Uint8Array([value]),
  },
  // little endian
  uint16: {
    fromBytes: (bytes) => bytes[0] | bytes[1] << 8,
    toBytes: (value) => new Uint8Array([value & 0xff, value >> 8 & 0xff]),
  },
  uint32: {
    fromBytes: (bytes) => bytes[0] | bytes[1] << 8 | bytes[2] << 16 | bytes[3] << 24,
    toBytes: (value) => new Uint8Array([value & 0xff, value >> 8 & 0xff, value >> 16 & 0xff, value >> 24 & 0xff]),
  },
  // big endian
  uint16_big: {
    fromBytes: (bytes) => bytes[1] | bytes[0] << 8,
    toBytes: (value) => new Uint8Array([value >> 8 & 0xff, value & 0xff]),
  },
  uint32_big: {
    fromBytes: (bytes) => bytes[3] | bytes[2] << 8 | bytes[1] << 16 | bytes[0] << 24,
    toBytes: (value) => new Uint8Array([value >> 24 & 0xff, value >> 16 & 0xff, value >> 8 & 0xff, value & 0xff]),
  },
}

const Bytes = {
  types,
  toStr: types.str.fromBytes,
  fromStr: types.str.toBytes,
  toHex: types.hex.fromBytes,
  fromHex: types.hex.toBytes,
  toUint32: types.uint32.fromBytes,
  fromUint32: types.uint32.toBytes,
  toBase64: types.base64.fromBytes,
  fromBase64: types.base64.toBytes,
  magic (bytes, offset, length) {
    return Bytes.toStr(bytes.slice(offset, offset + length))
  },
  /**
   * @param {object} config
   * @param {Uint8Array[]} bytes
   * @param {number} offset
   */
  toObj (config, bytes, offset) {
    const obj = {}
    for (const field of config) {
      const values = []
      const { n = 1 } = field
      const length = typeof field.length === 'number' ? field.length : field.length(obj)
      for (let i = 0; i < n; ++i) {
        const start = offset + i * length
        const data = bytes.slice(start, start + length)
        if (field.type) {
          values.push(field.type.fromBytes(data))
        } else {
          values.push(data)
        }
      }
      offset += length * n
      obj[field.name] = field.n ? values : values[0]
    }
    return obj
  },
  /**
   * @param {object} config
   * @param {object} obj
   */
  fromObj (config, obj) {
    return Bytes.join(config.map(field => {
      const data = field.n ? obj[field.name] : [obj[field.name]]
      return Bytes.join(data.map(v => field.type.toBytes(v)))
    }))
  },
  join (arrays) {
    const length = arrays.reduce((sum, arr) => sum + arr.length, 0)
    const res = new Uint8Array(length)
    let offset = 0
    arrays.forEach(arr => {
      let j = arr.length
      while (j--) res[offset + j] = arr[j]
      offset += arr.length
    })
    return res
  },
}

export default Bytes