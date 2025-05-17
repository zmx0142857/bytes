const types = {
  str: {
    fromBytes: (bytes) => String(bytes), // nodejs
    // fromBytes: (bytes) => String.fromCharCode(...bytes),
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
  // NOTE: js 的 number 不足以表示 64 位整数, 目前使用两个 uint32 的数组来替代
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
   * @param {object[]} config
   * @param {string} config[].name 字段名
   * @param {number|Function} config[].length 字段长度, 如果是数组, 则指每个元素的长度
   * @param {string|Array|Function} config[].type 字段类型
   * @param {number|Function} config[].n 字段数量
   * @param {number|Function} config[].offset 字段偏移量
   * @param {object} config[].enum 枚举映射
   * @param {Uint8Array[]} bytes
   * @param {number} offset
   */
  toObj (config, bytes, offset = 0) {
    const obj = {}
    for (const field of config) {
      const values = []
      if (field.offset) {
        offset = typeof field.offset === 'function' ? field.offset(obj, bytes) : field.offset
      }
      const n = typeof field.n === 'function' ? field.n(obj, bytes) : field.n ?? 1
      const length = typeof field.length === 'function' ? field.length(obj, bytes) : field.length
      for (let i = 0; i < n; ++i) {
        const start = length === undefined ? offset : offset + i * length
        const end = length === undefined ? undefined : start + length
        const data = bytes.slice(start, end)
        const fieldType = typeof field.type === 'string' ? types[field.type]
          : Array.isArray(field.type) ? { fromBytes: bytes => Bytes.toObj(field.type, bytes, 0) }
          : field.type
        if (fieldType) {
          values.push(fieldType.fromBytes(data))
        } else {
          values.push(data)
        }
      }
      if (length !== undefined) {
        offset += length * n
      }
      let value = field.n ? values : values[0]
      if (field.enum) value = field.enum[value] ?? value
      obj[field.name] = value
    }
    return obj
  },
  /**
   * @param {object} config
   * @param {object} obj
   */
  fromObj (config, obj) {
    return Bytes.concat(config.map(field => {
      const data = field.n ? obj[field.name] : [obj[field.name]]
      return Bytes.concat(data.map(v => {
        const fieldType = typeof field.type === 'string' ? types[field.type] : field.type
        if (fieldType) return fieldType.toBytes(v)
        return v
      }))
    }))
  },
  concat: typeof Buffer !== 'undefined' ? (arrays) => Buffer.concat(arrays) : (arrays) => {
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