const Bytes = {
  // configs: {},
  toStr (bytes) {
    return [...bytes].map(n => String.fromCharCode(n)).join('')
  },
  // WARN: str 中含有 > 255 的字符的话, 将被转化为 \uxxxx
  fromStr (str) {
    // return Uint8Array.from(str, c => c.charCodeAt(0))
    return new Uint8Array(Array.from(str, c => {
      const code = c.charCodeAt(0)
      return code > 255 ? Array.from(`\\u${code.toString(16).padStart(4, '0')}`, c => c.charCodeAt(0)) : code
    }).flat())
  },
  toUint32 (bytes) {
    return bytes[0] | bytes[1] << 8 | bytes[2] << 16 | bytes[3] << 24
  },
  fromUint32 (num) {
    return new Uint8Array([
      num & 0xff,
      num >> 8 & 0xff,
      num >> 16 & 0xff,
      num >> 24 & 0xff,
    ])
  },
  toBase64 (bytes) {
    return btoa(String.fromCharCode.apply(null, bytes))
  },
  fromBase64 (str) {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0))
  },
  magic (bytes, offset, length) {
    return Bytes.toStr(bytes.slice(offset, offset + length))
  },
  /**
   * @param {object} config
   * @param {Uint8Array[]} bytes
   * @param {number} offset
   */
  toObj (config, bytes, offset) {
    return Object.fromEntries(config.map((field) => {
      const values = []
      const { n = 1 } = field
      for (let i = 0; i < n; ++i) {
        const start = offset + i * field.length
        const data = bytes.slice(start, start + field.length)
        if (field.type === 'string') {
          values.push(Bytes.toStr(data))
        } else if (field.type === 'number') {
          values.push(Bytes.toUint32(data))
        } else {
          values.push(field.type.fromBytes(data))
        }
      }
      offset += field.length * n
      return [field.name, field.n ? values : values[0]]
    }))
  },
  /**
   * @param {object} config
   * @param {object} header
   */
  fromObj (config, header) {
    return Bytes.join(config.map(field => {
      const { n = 1 } = field
      const data = field.n ? header[field.name] : [header[field.name]]
      for (let i = 0; i < n; ++i) {
        if (field.type === 'string') {
          return Bytes.fromStr(data[i])
        } else if (field.type === 'number') {
          return Bytes.fromUint32(data[i])
        } else {
          return field.type.toBytes(data[i])
        }
      }
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