import Bytes from '../lib/bytes.js'

const DateType = {
  fromBytes: (bytes) => new Date(Bytes.toUint32(bytes) * 1000),
  toBytes: (date) => Bytes.fromUint32(date.getTime() / 1000 | 0),
}

const dosConfig = [
  { name: 'magic', length: 2, type: 'string' },
  { name: 'cblp', length: 2, type: 'number' },
  { name: 'cp', length: 2, type: 'number' },
  { name: 'crlc', length: 2, type: 'number' },
  { name: 'cparhdr', length: 2, type: 'number' },
  { name: 'minalloc', length: 2, type: 'number' },
  { name: 'maxalloc', length: 2, type: 'number' },
  { name: 'ss', length: 2, type: 'number' },
  { name: 'sp', length: 2, type: 'number' },
  { name: 'csum', length: 2, type: 'number' },
  { name: 'ip', length: 2, type: 'number' },
  { name: 'cs', length: 2, type: 'number' },
  { name: 'lfarlc', length: 2, type: 'number' },
  { name: 'ovno', length: 2, type: 'number' },
  { name: 'res', length: 2, type: 'number', n: 4 },
  { name: 'oemid', length: 2, type: 'number' },
  { name: 'oeminfo', length: 2, type: 'number' },
  { name: 'res2', length: 2, type: 'number', n: 10 },
  { name: 'lfanew', length: 4, type: 'number' },
]

const ntConfig = [
  { name: 'Signature', length: 4, type: 'string' },
  { name: 'Machine', length: 2, type: 'number' },
  { name: 'NumberOfSections', length: 2, type: 'number' },
  { name: 'TimeDateStamp', length: 4, type: DateType },
  { name: 'PointerToSymbolTable', length: 4, type: 'number' },
  { name: 'NumberOfSymbols', length: 4, type: 'number' },
  { name: 'SizeOfOptionalHeader', length: 2, type: 'number' },
  { name: 'Characteristics', length: 2, type: 'number' },
]

const optionalConfig = [
  { name: 'Magic', length: 2, type: 'number' },
  { name: 'MajorLinkerVersion', length: 1, type: 'number' },
  { name: 'MinorLinkerVersion', length: 1, type: 'number' },
  { name: 'SizeOfCode', length: 4, type: 'number' },
  { name: 'SizeOfInitializedData', length: 4, type: 'number' },
  { name: 'SizeOfUninitializedData', length: 4, type: 'number' },
  { name: 'AddressOfEntryPoint', length: 4, type: 'number' },
  { name: 'BaseOfCode', length: 4, type: 'number' },
  { name: 'BaseOfData', length: 4, type: 'number' },
  { name: 'ImageBase', length: 4, type: 'number' },
  { name: 'SectionAlignment', length: 4, type: 'number' },
  { name: 'FileAlignment', length: 4, type: 'number' },
  { name: 'MajorOperatingSystemVersion', length: 2, type: 'number' },
  { name: 'MinorOperatingSystemVersion', length: 2, type: 'number' },
  { name: 'MajorImageVersion', length: 2, type: 'number' },
  { name: 'MinorImageVersion', length: 2, type: 'number' },
  { name: 'MajorSubsystemVersion', length: 2, type: 'number' },
  { name: 'MinorSubsystemVersion', length: 2, type: 'number' },
  { name: 'Win32VerrsionValue', length: 4, type: 'number' },
  { name: 'SizeOfImage', length: 4, type: 'number' },
  { name: 'SizeOfHeaders', length: 4, type: 'number' },
  { name: 'CheckSum', length: 4, type: 'number' },
  { name: 'Subsystem', length: 2, type: 'number' },
  { name: 'DllCharacteristics', length: 2, type: 'number' },
  { name: 'SizeOfStackReserve', length: 4, type: 'number' },
  { name: 'SizeOfStackCommit', length: 4, type: 'number' },
  { name: 'SizeOfHeapReserve', length: 4, type: 'number' },
  { name: 'SizeOfHeapCommit', length: 4, type: 'number' },
  { name: 'LoadeFlags', length: 4, type: 'number' },
  { name: 'NumberOfRvaAndSizes', length: 4, type: 'number' },
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
  }
}

export default Pe