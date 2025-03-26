import fs from 'fs/promises'
import Bytes from '../lib/bytes.js'

const { str, uint16, uint32 } = Bytes.types

// executable and linkable format
// (32位elf) https://www.cnblogs.com/gongxianjin/p/16906719.html
// (64位elf) https://zhuanlan.zhihu.com/p/544198038
// elf 文件分为可重定位文件 test.o, 可执行文件 a.out 和共享文件 a.so
// 在 linux 下, 使用 xxd a.out -l 320 查看二进制文件
// 用 file a.out 查看文件简介
// readelf -h a.out # 查看 elf 文件头
// readelf -l # 查看 program header
// readelf -S # 查看 section header

// 文件头, 64 bytes
const elfHeaderConfig = [
  { name: 'ident', length: 16, type: str }, // 16 字节魔数, 用来标识 elf 文件
  { name: 'type', length: 2, type: uint16 }, // 目标文件类型 1:可重定位文件, 2:可执行文件, 3:共享目标文件
  { name: 'machine', length: 2, type: uint16 }, // 目标体系结构 3:intel 80386
  { name: 'version', length: 4, type: uint32 }, // 目标文件版本 1:当前版本
  { name: 'entry', length: 4, type: uint32, n: 2 }, // 程序入口地址
  { name: 'phoff', length: 4, type: uint32, n: 2 }, // program header (segment header) offset
  { name: 'shoff', length: 4, type: uint32, n: 2 }, // section header offset
  { name: 'flags', length: 4, type: uint32 }, // 处理器特定标志
  { name: 'ehsize', length: 2, type: uint16 }, // elf header size
  { name: 'phentsize', length: 2, type: uint16 }, // program header entry size
  { name: 'phnum', length: 2, type: uint16 }, // program header entry count
  { name: 'shentsize', length: 2, type: uint16 }, // section header entry size
  { name: 'shnum', length: 2, type: uint16 }, // section header entry count
  { name: 'shstrndx', length: 2, type: uint16 } // section header string table index
]

// https://refspecs.linuxfoundation.org/elf/gabi4%2B/ch4.sheader.html%23sh_type
const sectionTypeDict = {
  0: 'NULL',
  1: 'PROGBITS', // 程序定义
  2: 'SYMTAB', // 符号表
  3: 'STRTAB', // 字符串表
  4: 'RELA', // 重定位表
  5: 'HASH', // HASH 表
  6: 'DYNAMIC', // 动态链接
  7: 'NOTE', // 注释
  8: 'NOBITS', // 不占用文件空间, 如 bss
  9: 'REL', // 重定位表项
  10: 'SHLIB',
  11: 'DYNSYM', // 动态链接符号表
  14: 'INIT_ARRAY',
  15: 'FINI_ARRAY',
  16: 'PREINIT_ARRAY',
  17: 'GROUP',
  18: 'SYMTAB_SHNDX',
  [0x60000000]: 'LOOS',
  [0x6fffffff]: 'VERSYM',
  [0x70000000]: 'LOPROC',
  [0x7fffffff]: 'HIPROC',
  [0x80000000]: 'LOUSER',
  [0xffffffff]: 'HIUSER',
  [0x6ffffff6]: 'GNU_HASH',
  [0x6ffffffe]: 'VERNEED',
}

const programTypeDict = {
  1: 'LOAD', // 可加载段
  2: 'DYNAMIC', // 可动态链接段
  3: 'INTERP', // 解释器
  4: 'NOTE', // 注释
  5: 'SHLIB', // 共享库
  6: 'PHDR', // 程序头表
  1685382480: 'GNU_EH_FRAME', // GNU 异常处理
  1685382481: 'GNU_STACK', // GNU 栈
  1685382482: 'GNU_RELRO', // GNU 重定位只读
  1685382483: 'GNU_PROPERTY', // GNU 属性
}

// 64 bytes
const sectionHeaderConfig = [
  { name: 'name', length: 4, type: uint32 },
  { name: 'type', length: 4, type: uint32, enum: sectionTypeDict },
  { name: 'flags', length: 4, type: uint32, n: 2 }, // 标志 2:可写, 4:可执行, 6:可读可写, 8:可读可执行
  { name: 'addr', length: 4, type: uint32, n: 2 },
  { name: 'offset', length: 4, type: uint32, n: 2 },
  { name: 'size', length: 4, type: uint32, n: 2 },
  { name: 'link', length: 4, type: uint32 },
  { name: 'info', length: 4, type: uint32 },
  { name: 'align', length: 4, type: uint32, n: 2 },
  { name: 'entsize', length: 4, type: uint32, n: 2 },
]

// program header (segment header), 56 bytes
const programHeaderConfig = [
  { name: 'type', length: 4, type: uint32, enum: programTypeDict },
  { name: 'flags', length: 4, type: uint32 }, // 标志 4:可读, 2:可写, 1:可执行
  { name: 'offset', length: 4, type: uint32, n: 2 }, // 段在文件中的偏移量
  { name: 'vaddr', length: 4, type: uint32, n: 2 }, // 段在内存中的虚拟地址
  { name: 'paddr', length: 4, type: uint32, n: 2 }, // 段在内存中的物理地址
  { name: 'filesz', length: 4, type: uint32, n: 2 }, // 段在文件中的大小
  { name: 'memsz', length: 4, type: uint32, n: 2 }, // 段在内存中的大小
  { name: 'align', length: 4, type: uint32, n: 2 } // 段对齐方式
]

const Elf = {
  // 从 string table 读取 section 名称
  initSectionNames ({ elfHeader, sectionHeaders }, bytes) {
    const strTableIndex = elfHeader.shstrndx
    if (strTableIndex >= 0 && strTableIndex < elfHeader.shnum) {
      const { offset, size } = sectionHeaders[strTableIndex]
      const strTable = bytes.slice(offset[0], offset[0] + size[0])
      sectionHeaders.forEach((section) => {
        // null-terminated string
        let begin = section.name, end = begin
        while (strTable[end] !== 0) end++
        section.name = String.fromCharCode(...strTable.slice(begin, end))
      })
    }
  },
  info (bytes) {
    const config = [
      { name: 'elfHeader', type: elfHeaderConfig },
      {
        name: 'programHeaders',
        offset: obj => obj.elfHeader.phoff[0],
        length: obj => obj.elfHeader.phentsize,
        type: programHeaderConfig,
        n: obj => obj.elfHeader.phnum,
      },
      {
        name: 'sectionHeaders',
        offset: obj => obj.elfHeader.shoff[0],
        length: obj => obj.elfHeader.shentsize,
        type: sectionHeaderConfig,
        n: obj => obj.elfHeader.shnum,
      },
    ]
    const res = Bytes.toObj(config, bytes)
    this.initSectionNames(res, bytes)
    return res
  },
  async cli (argv) {
    if (argv[2] === 'info') {
      const bytes = await fs.readFile(argv[3])
      console.dir(Elf.info(bytes), { depth: 10 })
    } else {
      console.log(`
usage: node index.js COMMAND PATH

command:
  info  show elf info
`)
    }
  }
}

export default Elf