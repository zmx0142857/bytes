import fs from 'fs/promises'
import Bytes from '../lib/bytes.js'

const { str, uint8, uint16, uint32, timestamp } = Bytes.types

const dosConfig = [
  { name: 'magic', length: 2, type: str },
  { name: 'cblp', length: 2, type: uint16 },
  { name: 'cp', length: 2, type: uint16 },
  { name: 'crlc', length: 2, type: uint16 },
  { name: 'cparhdr', length: 2, type: uint16 },
  { name: 'minalloc', length: 2, type: uint16 },
  { name: 'maxalloc', length: 2, type: uint16 },
  { name: 'ss', length: 2, type: uint16 },
  { name: 'sp', length: 2, type: uint16 },
  { name: 'csum', length: 2, type: uint16 },
  { name: 'ip', length: 2, type: uint16 },
  { name: 'cs', length: 2, type: uint16 },
  { name: 'lfarlc', length: 2, type: uint16 },
  { name: 'ovno', length: 2, type: uint16 },
  { name: 'res', length: 2, type: uint16, n: 4 },
  { name: 'oemid', length: 2, type: uint16 },
  { name: 'oeminfo', length: 2, type: uint16 },
  { name: 'res2', length: 2, type: uint16, n: 10 },
  { name: 'lfanew', length: 4, type: uint32 },
]

const ntConfig = [
  { name: 'Signature', length: 4, type: str },
  { name: 'Machine', length: 2, type: uint16 },
  { name: 'NumberOfSections', length: 2, type: uint16 },
  { name: 'TimeDateStamp', length: 4, type: timestamp },
  { name: 'PointerToSymbolTable', length: 4, type: uint32 },
  { name: 'NumberOfSymbols', length: 4, type: uint32 },
  { name: 'SizeOfOptionalHeader', length: 2, type: uint16 },
  { name: 'Characteristics', length: 2, type: uint16 },
]

const optionalConfig = [
  { name: 'Magic', length: 2, type: uint16 },
  { name: 'MajorLinkerVersion', length: 1, type: uint8 },
  { name: 'MinorLinkerVersion', length: 1, type: uint8 },
  { name: 'SizeOfCode', length: 4, type: uint32 },
  { name: 'SizeOfInitializedData', length: 4, type: uint32 },
  { name: 'SizeOfUninitializedData', length: 4, type: uint32 },
  { name: 'AddressOfEntryPoint', length: 4, type: uint32 },
  { name: 'BaseOfCode', length: 4, type: uint32 },
  { name: 'BaseOfData', length: 4, type: uint32 },
  { name: 'ImageBase', length: 4, type: uint32 },
  { name: 'SectionAlignment', length: 4, type: uint32 },
  { name: 'FileAlignment', length: 4, type: uint32 },
  { name: 'MajorOperatingSystemVersion', length: 2, type: uint16 },
  { name: 'MinorOperatingSystemVersion', length: 2, type: uint16 },
  { name: 'MajorImageVersion', length: 2, type: uint16 },
  { name: 'MinorImageVersion', length: 2, type: uint16 },
  { name: 'MajorSubsystemVersion', length: 2, type: uint16 },
  { name: 'MinorSubsystemVersion', length: 2, type: uint16 },
  { name: 'Win32VerrsionValue', length: 4, type: uint32 },
  { name: 'SizeOfImage', length: 4, type: uint32 },
  { name: 'SizeOfHeaders', length: 4, type: uint32 },
  { name: 'CheckSum', length: 4, type: uint32 },
  { name: 'Subsystem', length: 2, type: uint16 },
  { name: 'DllCharacteristics', length: 2, type: uint16 },
  { name: 'SizeOfStackReserve', length: 4, type: uint32 },
  { name: 'SizeOfStackCommit', length: 4, type: uint32 },
  { name: 'SizeOfHeapReserve', length: 4, type: uint32 },
  { name: 'SizeOfHeapCommit', length: 4, type: uint32 },
  { name: 'LoadeFlags', length: 4, type: uint32 },
  { name: 'NumberOfRvaAndSizes', length: 4, type: uint32 },
]

const Pe = {
  info(bytes) {
    const dosHeader = Bytes.toObj(dosConfig, bytes, 0)
    const ntHeader = Bytes.toObj(ntConfig, bytes, dosHeader.lfanew)
    const architecture = ntHeader.Machine === 0x014c ? '32位'
      : ntHeader.Machine === 0x8664 ? '64位'
        : 'unknown'
    const ntHeaderLength = 24
    const optionalHeader = Bytes.toObj(optionalConfig, bytes, dosHeader.lfanew + ntHeaderLength)
    const imageType = optionalHeader.Magic === 0x10b ? '32位'
      : optionalHeader.Magic === 0x20b ? '64位'
        : optionalHeader.Magic === 0x107 ? 'ROM镜像'
          : 'unknown'
    return {
      architecture,
      imageType,
      dosHeader,
      ntHeader,
      optionalHeader,
    }
  },
  async cli (argv) {
    if (argv[0] === 'info') {
      const bytes = await fs.readFile(argv[1])
      console.log(Pe.info(bytes))
    } else {
      console.log(`
usage: bytes pe COMMAND FIN

command:
  info    show PE info
`)
    }
  },
}

export default Pe