import Bytes from '../lib/bytes.js'

const { hex, uint32_big } = Bytes.types

const Crc = {
  /**
   * 计算循环冗余校验
   * @param {Uint8Array} bytes 待校验的数据
   * @param {uint32_big} poly 最小多项式
   * @param {uint32_big} init 初始值
   * @param {16 | 32} bitLength 位数
   * @returns {uint32_big} 校验值
   */
  crc (bytes, poly, init = 0, bitLength = 32) {
    const flag = 0x80 << (bitLength - 8)
    const mask = Math.pow(2, bitLength) - 1 // 不可用 1 << 32 会溢出
    for (let i = 0; i < bytes.length; ++i) {
      const b = bytes[i]
      init ^= b << (bitLength - 8)
      for (let j = 0; j < 8; ++j) {
        if (init & flag) {
          init = (init << 1) ^ poly
        } else {
          init <<= 1
        }
      }
      init &= mask
    }
    return init
  },
  /**
   * @param {object} options
   * @param {Uint8Array} options.data
   * @param {uint32_big} options.poly
   */
  main ({ data, poly, init = 0, bitlength = 32, xorout = 0, refin = false, refout = false }) {
    if (refin) data = Bytes.reverseBits(data).reverse()
    let res = Crc.crc(data, poly, init, bitlength)
    if (refout) {
      res = uint32_big.toBytes(res)
      res = Bytes.reverseBits(res)
      res = uint32_big.fromBytes(res)
    }
    if (xorout) res ^= xorout
    res = uint32_big.toBytes(res).slice(4 - bitlength / 8)
    return hex.fromBytes(res)
  },
  cli (argv) {
    const options = Object.fromEntries(argv.map(v => v.split('=')))
    const keys = Object.keys(options)
    if (options.data && options.poly) {
      options.data = hex.toBytes(options.data)
      options.poly = Number('0x' + options.poly)
      options.bitlength = Number(options.bitlength || 32)
      if (![16, 32].includes(options.bitlength)) {
        return console.error(`invalid bitlength ${options.bitlength}. expected 16 or 32.`)
      }
      options.init = Number('0x' + (options.init || '0'))
      options.refin = keys.includes('refin')
      options.refout = keys.includes('refout')
      options.xorout = Number('0x' + (options.xorout || '0'))
      console.log(Crc.main(options))
    } else {
      console.log(`
usage: bytes crc data=111 poly=222 key3=value3 key4=value4 ...

keys:
  data: 待校验的数据, 必填
  poly: 最小多项式, 必填
  bitlength: 位数, 默认 32, 可选: 16, 32
  init: 初始值, 默认 0
  refin: 按位反转输入的**每个字节**, 默认 false
  refout: 按位反转**整个输出**, 默认 false
  xorout: 异或输出, 默认 0

example1 (crc16):
  input: bytes crc bitlength=16 data='3132 3334 3536 3738 39' poly=1021
  output: 31 c3

example2 (png 校验码, crc32):
  input: bytes crc data=49454e44 poly=04c11db7 init=ffffffff xorout=ffffffff refin refout
  output: ae 42 60 82
`)
    }
  },
}

export default Crc