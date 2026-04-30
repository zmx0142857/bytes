import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import Bytes from '../lib/bytes.js'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const { str, uint8, uint16, uint32, raw } = Bytes.types
const utf16le = {
  fromBytes (bytes) {
    const arr = []
    for (let i = 0; i < bytes.length - 1; i += 2) {
      const code = bytes[i] | (bytes[i + 1] << 8)
      if (code === 0) break // 结束符
      arr.push(String.fromCharCode(code))
    }
    return arr.join('')
  },
  toBytes (str) {
    const arr = []
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i)
      arr.push(code & 0xff, code >> 8 & 0xff)
    }
    arr.push(0, 0) // 结束符
    return new Uint8Array(arr)
  },
}

/**
 * 生成 lex 格式的五笔码表
 * 参考: https://nopdan.com/2022/09/07-msudp-dat
 * https://github.com/aardio/wubi-lex
 *
 * 输入格式: 每行 "编码\t词语\t词频"，如 "juok\t人工智能\t29922"
 * 输出格式: lex 格式二进制文件
 */

// 主码表文件头
const mainHeaderConfig = [
  { name: 'magic', length: 8, type: str }, // 'imscwubi'
  { name: 'majorVersion', length: 2, type: uint16 }, // 主版本号
  { name: 'minorVersion', length: 2, type: uint16 }, // 次版本号
  { name: 'offsetStart', length: 4, type: uint32 }, // 偏移表开始, 一般为 64
  { name: 'entryStart', length: 4, type: uint32 }, // 词条开始, 一般为 168 = 64+4*26
  { name: 'fileLength', length: 4, type: uint32 }, // 文件总长
  { name: 'unknown', length: 4, type: uint32 }, // 未知
  { name: 'padding', length: 36, type: raw, skip: true }, // 补 0 一直到偏移表开始, 长度一般为 36
  { name: 'alphaIndex', length: 4, n: 26, type: uint32 }, // 字母索引表, 记录每个字母的词条相对于 entryStart 的偏移量
]

// 主码表词条
const mainEntryConfig = [
  { name: 'length', length: 2, type: uint16 }, // 词条长度
  { name: 'weight', length: 2, type: uint16 }, // 词频
  { name: 'codeLength', length: 2, type: uint16 }, // 编码长度
  { name: 'code', length: 2 * 4, type: raw }, // 编码
  { name: 'word', length: obj => obj.length - 14, type: raw }, // 词语
]

// 用户码表文件头
const userHeaderConfig = [
  { name: 'magic', length: 8, type: str }, // 'mschxudp'
  { name: 'version', length: 8, type: raw }, // 版本号 + 预留
  { name: 'offsetStart', length: 4, type: uint32 }, // 偏移表开始, 一般为 64
  { name: 'entryStart', length: 4, type: uint32 }, // 词条开始, 等于 offsetStart + entryCount * 4
  { name: 'fileLength', length: 4, type: uint32 }, // 文件总长
  { name: 'entryCount', length: 4, type: uint32 }, // 词条数
  { name: 'timestamp', length: 4, type: uint32 }, // 时间戳
  { name: 'padding', length: obj => obj.offsetStart - 36, type: raw, skip: true }, // 补 0 一直到偏移表开始, 长度一般为 28
  { name: 'offset', length: 4, n: obj => obj.entryCount, type: uint32 }, // 偏移表, 记录每个词条相对于 entryStart 的偏移量
]

// 用户词条
const userEntryConfig = [
  { name: 'marker', length: 4, type: uint32 }, // 0x00100010
  { name: 'codeLen', length: 2, type: uint16 }, // 从当前词条开始直到 code 结束的长度
  { name: 'order', length: 1, type: uint8 }, // 候选顺序
  { name: 'flag', length: 1, type: uint8 }, // 0x06, 未知
  { name: 'reserved', length: 4, type: raw, skip: true }, // 0x0
  { name: 'timestamp', length: 4, type: uint32 }, // 时间戳
  { name: 'code', length: obj => obj.codeLen - 16, type: utf16le }, // 编码
  { name: 'word', type: utf16le }, // 词语
]

const Lex = {
  /**
   * 解析 lex 格式文件. 测试:
   * ```
   * node cli/index.js lex info /c/Users/Administrator/AppData/Roaming/Microsoft/InputMethod/Chs/ChsWubiEUDPv1.lex
   * node cli/index.js lex info /c/Windows/InputMethod/CHS/ChsWubi.lex
   * ```
   * @param {Uint8Array} bytes
   */
  info (bytes, { limit } = {}) {
    const magic = str.fromBytes(bytes.slice(0, 8))
    if (magic === 'imscwubi') {
      return Lex.infoMain(bytes, { limit })
    } else if (magic === 'mschxudp') {
      return Lex.infoUser(bytes, { limit })
    } else {
      throw new Error('Unsupported format: ' + magic)
    }
  },
  infoMain (bytes, { limit = 10 } = {}) {
    const header = Bytes.toObj(mainHeaderConfig, bytes)
    const { entryStart, fileLength } = header
    const entries = []
    let step = 16
    for (let offset = entryStart; offset < fileLength && entries.length < limit; offset += step) {
      const entry = Bytes.toObj(mainEntryConfig, bytes, offset)
      entry.code = utf16le.fromBytes(entry.code)
      entry.word = utf16le.fromBytes(entry.word)
      entries.push(entry)
      step = entry.length
    }
    return { ...header, entries: entries.slice(0, 20) }
  },
  infoUser (bytes, { limit = 10 } = {}) {
    const header = Bytes.toObj(userHeaderConfig, bytes)
    const { offset, entryCount, entryStart } = header
    const entries = []
    limit = Math.min(limit, entryCount)
    for (let i = 0; i < limit; i++) {
      const entryOffset = entryStart + offset[i]
      const entry = Bytes.toObj(userEntryConfig, bytes, entryOffset)
      entries.push(entry)
    }
    return { ...header, offset: header.offset.slice(0, limit), entries: entries.slice(0, limit) }
  },
  async gen (input, { overwrite = false } = {}) {
    const entries = await Lex.parseInput(input)

    // 分离: 编码含 'z' -> 用户自定义; 其他 -> 主码表
    const normalEntries = []
    const userEntries = []
    for (const entry of entries) {
      if (entry.code.includes('z')) {
        userEntries.push(entry)
      } else {
        normalEntries.push(entry)
      }
    }

    const dir = process.argv[1].replaceAll('\\', '/').replace('cli/index.js', 'examples/')
    await Promise.all([
      Lex.genMain(normalEntries, { filename: dir + 'ChsWubi.lex' }),
      Lex.genUser(userEntries, { filename: dir + 'ChsWubiEUDPv1.lex' }),
    ])

    if (overwrite) {
      execSync(dir + 'lex-install.bat')
    }
  },
  // 生成主码表
  async genMain (entries, { filename = 'wubi.lex', magic = 'imscwubi' } = {}) {
    if (!entries.length) return console.log(`Skip ${filename}: no entries`)

    const alphaIndex = new Array(26).fill(0)
    const entryDataList = []
    let currentAlphaIndex = -1
    let dataLength = 0

    // 为每个词条生成二进制数据
    for (const entry of entries) {
      const { code, word, weight = 62315 } = entry

      // 更新缺失的字母索引
      const alphaIdx = code.charCodeAt(0) - 'a'.charCodeAt(0)
      if (alphaIdx >= 0 && alphaIdx < 26 && alphaIdx !== currentAlphaIndex) {
        for (let i = currentAlphaIndex + 1; i <= alphaIdx; i++) {
          alphaIndex[i] ||= dataLength
        }
        currentAlphaIndex = alphaIdx
      }

      // 生成词条数据
      const codeBytes = utf16le.toBytes(code.padEnd(4, '\x00')).slice(0, -2) // 去掉最后两字节
      const wordBytes = utf16le.toBytes(word)
      const entryData = Bytes.fromObj(mainEntryConfig, {
        length: 14 + wordBytes.length,
        weight,
        codeLength: code.length,
        code: codeBytes,
        word: wordBytes,
      })
      entryDataList.push(entryData)
      dataLength += entryData.length
    }

    // 填充剩余的字母索引
    for (let i = currentAlphaIndex + 1; i < 26; i++) {
      alphaIndex[i] ||= dataLength
    }

    const header = Bytes.fromObj(mainHeaderConfig, {
      magic,
      majorVersion: 1,
      minorVersion: 1,
      offsetStart: 0x40,
      entryStart: 0xa8,
      fileLength: 0xa8 + dataLength,
      unknown: 0x78563412,
      padding: new Uint8Array(36),
      alphaIndex,
    })
    const res = await fs.promises.writeFile(filename, Bytes.concat([header, ...entryDataList]))
    console.log(`${filename}: ${entries.length} entries.`)
    return res
  },
  // 生成用户码表
  async genUser (entries, { filename = 'wubi.lex', magic = 'mschxudp' } = {}) {
    if (!entries.length) return console.log(`Skip ${filename}: no entries`)
    const timestamp = Math.floor(Date.now() / 1000) + new Date().getTimezoneOffset() * 60
    const entryCount = entries.length
    const offsetStart = 0x40
    const entryStart = offsetStart + entryCount * 4
    const offsetList = []

    let offset = 0
    const entryDataList = entries.map(entry => {
      const data = Bytes.fromObj(userEntryConfig, {
        marker: 0x00100010,
        codeLen: entry.code.length * 2 + 2 + 16, // 含两字节的结束符
        order: entry.order,
        flag: 0x06,
        reserved: new Uint8Array(4),
        timestamp,
        code: entry.code,
        word: entry.word,
      })
      offsetList.push(offset)
      offset += data.length
      return data
    })

    const headerLength = 64 + entryCount * 4
    const fileLength = headerLength + entryDataList.reduce((sum, data) => sum + data.length, 0)
    const header = Bytes.fromObj(userHeaderConfig, {
      magic,
      version: new Uint8Array([0x02, 0x00, 0x60, 0x00, 0x01, 0x00, 0x00, 0x00]),
      offsetStart,
      entryStart,
      fileLength,
      entryCount,
      timestamp,
      padding: new Uint8Array(28),
      offset: offsetList,
    })
    const res = await fs.promises.writeFile(filename, Bytes.concat([header, ...entryDataList]))
    console.log(`${filename}: ${entryCount} entries.`)
    return res
  },

  /**
   * 解析输入文件, 示例:
   * ```
   * juok	人工智能	29922
   * ogsy	中国	10938
   * ogsy	中心	20938
   * rgwf	人工	10428
   * rgwf	智能	20428
   * abcd	测试	14582
   * xyz	用户	14582
   * abcz	自定义	14582
   * ```
   */
  async parseInput (filename) {
    const content = await fs.promises.readFile(filename, 'utf-8')
    const lines = content.split('\n').filter(line => line.trim())
    const entries = []
    for (const line of lines) {
      const parts = line.split('\t')
      if (parts.length >= 3) {
        const code = parts[0].trim()
        const word = parts[1].trim()
        const weight = parseInt(parts[2].trim(), 10)
        if (code && word && Number.isFinite(weight)) {
          entries.push({ code, word, weight })
        }
      }
    }
    // 先按编码排序, 重码则按 weight 排序
    entries.sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : a.weight - b.weight)
    entries.forEach((entry, i) => {
      if (entries[i-1]?.code === entry.code) {
        entry.order = entries[i-1].order + 1
      } else {
        entry.order = 1
      }
    })
    return entries
  },

  async cli (argv) {
    if (argv[0] === 'gen' && argv[1]) {
      Lex.gen(argv[1]) 
    } else if (argv[0] === 'info' && argv[1]) {
      const bytes = await fs.promises.readFile(argv[1])
      console.dir(Lex.info(bytes), { depth: null })
    } else if (argv[0] === 'install' && argv[1]) {
      Lex.gen(argv[1], { overwrite: true })
    } else {
      console.log(`
usage: bytes lex COMMAND FILE

command:
  gen     generate lex format dictionary
  install generate & overwrite system dictionary (Admin required)
  info    show lex info

example:
  bytes lex gen input.txt
  bytes lex info ChsWubi.lex
`)
    }
  }
}

export default Lex
