const MD5 = {
  hash (str, { size = 8, format = 'hex', hmac = '' } = {}) {
    size = Number(size)
    str = new TextEncoder().encode(str)
    hmac = new TextEncoder().encode(hmac)
    const res = hmac.length ? this.hmac(hmac, str, size)
      : this.md5(this.str2arr(str, size), str.length * size)
    switch (format) {
      case 'hex':
        return this.arr2hex(res)
      case 'b64':
        return this.arr2b64(res)
      case 'str':
        return this.arr2str(res, size)
      default:
        return res
    }
  },
  str2arr (str, size = 8) {
    const res = []
    const mask = (1 << size) - 1
    for (let i = 0; i < str.length * size; i += size) {
      res[i >> 5] |= (str[i / size] & mask) << (i % 32)
    }
    return res
  },
  arr2str (arr, size = 8) {
    let res = ''
    const mask = (1 << size) - 1
    for (let i = 0; i < arr.length * 32; i += size) {
      res += String.fromCharCode(arr[i >> 5] >>> (i % 32) & mask)
    }
    return res
  },
  arr2hex (arr) {
    const tab = '0123456789abcdef'
    let res = ''
    for (let i = 0; i < arr.length * 4; i++) {
      res += tab.charAt((arr[i >> 2] >> ((i % 4) * 8 + 4)) & 0x0F) +
             tab.charAt((arr[i >> 2] >> ((i % 4) * 8)) & 0x0F)
    }
    return res
  },
  arr2b64 (arr) {
    const tab = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    let res = ''
    for (let i = 0; i < arr.length * 4; i += 3) {
      const triplet = (((arr[i >> 2] >> 8 * (i % 4)) & 0xFF) << 16) |
                      (((arr[i + 1 >> 2] >> 8 * ((i + 1) % 4)) & 0xFF) << 8) |
                      ((arr[i + 2 >> 2] >> 8 * ((i + 2) % 4)) & 0xFF)
      for (let j = 0; j < 4; j++) {
        if (i * 8 + j * 6 > arr.length * 32) {
          res += '='
        } else {
          res += tab.charAt((triplet >> 6 * (3 - j)) & 0x3F)
        }
      }
    }
    return res
  },
  add32 (x, y) {
    return ((x | 0) + (y | 0)) | 0
  },
  rot32 (x, shift) {
    return (x << shift) | (x >>> (32 - shift))
  },
  cmn (q, a, b, x, s, t) {
    const { add32, rot32 } = this
    a = add32(add32(a, q), add32(x, t))
    return add32(rot32(a, s), b)
  },
  ff (a, b, c, d, x, s, t) {
    return this.cmn((b & c) | (~b & d), a, b, x, s, t)
  },
  gg (a, b, c, d, x, s, t) {
    return this.cmn((b & d) | (c & ~d), a, b, x, s, t)
  },
  hh (a, b, c, d, x, s, t) {
    return this.cmn(b ^ c ^ d, a, b, x, s, t)
  },
  ii (a, b, c, d, x, s, t) {
    return this.cmn(c ^ (b | ~d), a, b, x, s, t)
  },
  md5 (x, len) {
    x[len >> 5] |= 0x80 << (len % 32)
    x[((len + 64) >>> 9) << 4 | 14] = len

    const res = [1732584193, -271733879, -1732584194, 271733878]
    for (let i = 0; i < x.length; i += 16) {
      let [a, b, c, d] = res

      a = this.ff(a, b, c, d, x[i + 0], 7, -680876936)
      d = this.ff(d, a, b, c, x[i + 1], 12, -389564586)
      c = this.ff(c, d, a, b, x[i + 2], 17, 606105819)
      b = this.ff(b, c, d, a, x[i + 3], 22, -1044525330)
      a = this.ff(a, b, c, d, x[i + 4], 7, -176418897)
      d = this.ff(d, a, b, c, x[i + 5], 12, 1200080426)
      c = this.ff(c, d, a, b, x[i + 6], 17, -1473231341)
      b = this.ff(b, c, d, a, x[i + 7], 22, -45705983)
      a = this.ff(a, b, c, d, x[i + 8], 7, 1770035416)
      d = this.ff(d, a, b, c, x[i + 9], 12, -1958414417)
      c = this.ff(c, d, a, b, x[i + 10], 17, -42063)
      b = this.ff(b, c, d, a, x[i + 11], 22, -1990404162)
      a = this.ff(a, b, c, d, x[i + 12], 7, 1804603682)
      d = this.ff(d, a, b, c, x[i + 13], 12, -40341101)
      c = this.ff(c, d, a, b, x[i + 14], 17, -1502002290)
      b = this.ff(b, c, d, a, x[i + 15], 22, 1236535329)

      a = this.gg(a, b, c, d, x[i + 1], 5, -165796510)
      d = this.gg(d, a, b, c, x[i + 6], 9, -1069501632)
      c = this.gg(c, d, a, b, x[i + 11], 14, 643717713)
      b = this.gg(b, c, d, a, x[i + 0], 20, -373897302)
      a = this.gg(a, b, c, d, x[i + 5], 5, -701558691)
      d = this.gg(d, a, b, c, x[i + 10], 9, 38016083)
      c = this.gg(c, d, a, b, x[i + 15], 14, -660478335)
      b = this.gg(b, c, d, a, x[i + 4], 20, -405537848)
      a = this.gg(a, b, c, d, x[i + 9], 5, 568446438)
      d = this.gg(d, a, b, c, x[i + 14], 9, -1019803690)
      c = this.gg(c, d, a, b, x[i + 3], 14, -187363961)
      b = this.gg(b, c, d, a, x[i + 8], 20, 1163531501)
      a = this.gg(a, b, c, d, x[i + 13], 5, -1444681467)
      d = this.gg(d, a, b, c, x[i + 2], 9, -51403784)
      c = this.gg(c, d, a, b, x[i + 7], 14, 1735328473)
      b = this.gg(b, c, d, a, x[i + 12], 20, -1926607734)

      a = this.hh(a, b, c, d, x[i + 5], 4, -378558)
      d = this.hh(d, a, b, c, x[i + 8], 11, -2022574463)
      c = this.hh(c, d, a, b, x[i + 11], 16, 1839030562)
      b = this.hh(b, c, d, a, x[i + 14], 23, -35309556)
      a = this.hh(a, b, c, d, x[i + 1], 4, -1530992060)
      d = this.hh(d, a, b, c, x[i + 4], 11, 1272893353)
      c = this.hh(c, d, a, b, x[i + 7], 16, -155497632)
      b = this.hh(b, c, d, a, x[i + 10], 23, -1094730640)
      a = this.hh(a, b, c, d, x[i + 13], 4, 681279174)
      d = this.hh(d, a, b, c, x[i + 0], 11, -358537222)
      c = this.hh(c, d, a, b, x[i + 3], 16, -722521979)
      b = this.hh(b, c, d, a, x[i + 6], 23, 76029189)
      a = this.hh(a, b, c, d, x[i + 9], 4, -640364487)
      d = this.hh(d, a, b, c, x[i + 12], 11, -421815835)
      c = this.hh(c, d, a, b, x[i + 15], 16, 530742520)
      b = this.hh(b, c, d, a, x[i + 2], 23, -995338651)

      a = this.ii(a, b, c, d, x[i + 0], 6, -198630844)
      d = this.ii(d, a, b, c, x[i + 7], 10, 1126891415)
      c = this.ii(c, d, a, b, x[i + 14], 15, -1416354905)
      b = this.ii(b, c, d, a, x[i + 5], 21, -57434055)
      a = this.ii(a, b, c, d, x[i + 12], 6, 1700485571)
      d = this.ii(d, a, b, c, x[i + 3], 10, -1894986606)
      c = this.ii(c, d, a, b, x[i + 10], 15, -1051523)
      b = this.ii(b, c, d, a, x[i + 1], 21, -2054922799)
      a = this.ii(a, b, c, d, x[i + 8], 6, 1873313359)
      d = this.ii(d, a, b, c, x[i + 15], 10, -30611744)
      c = this.ii(c, d, a, b, x[i + 6], 15, -1560198380)
      b = this.ii(b, c, d, a, x[i + 13], 21, 1309151649)
      a = this.ii(a, b, c, d, x[i + 4], 6, -145523070)
      d = this.ii(d, a, b, c, x[i + 11], 10, -1120210379)
      c = this.ii(c, d, a, b, x[i + 2], 15, 718787259)
      b = this.ii(b, c, d, a, x[i + 9], 21, -343485551)

      res[0] = this.add32(a, res[0])
      res[1] = this.add32(b, res[1])
      res[2] = this.add32(c, res[2])
      res[3] = this.add32(d, res[3])
    }
    return res
  },
  hmac (key, data, size) {
    let bkey = this.str2arr(key, size)
    if (bkey.length > 16) bkey = this.md5(bkey, key.length * size)
    const ipad = []
    const opad = []
    for (let i = 0; i < 16; i++) {
      ipad[i] = bkey[i] ^ 0x36363636
      opad[i] = bkey[i] ^ 0x5C5C5C5C
    }
    const hash = this.md5(ipad.concat(this.str2arr(data, size)), 512 + data.length * size)
    return this.md5(opad.concat(hash), 512 + 128)
  },
  cli (argv) {
    argv = argv.map(v => v.split('='))
    const input = argv.find(([k, v]) => v === undefined)?.[0]
    if (input) {
      const options = Object.fromEntries(argv)
      const hash = this.hash(input, options)
      console.log(hash)
    } else {
      console.log(`usage: bytes md5 <string> size=8 format=hex hmac=<key>

example:
  $ bytes md5 'hello world'
  5eb63bbbe01eeed093cb22bb8f5acdc3
  $ bytes md5 '你好'
  7eca689f0d3389d9dea66ae112e5cfd7
`)
    }
  },
}

export default MD5