import Bytes from '../lib/bytes.js'

const { base64, str } = Bytes.types

/**
 * @example
 * ```
 * $ echo '5L2g5aW9aGVsbG8K' | bytes base64 -d
 * 你好hello
 * ```
 */
const Base64 = {
  async cli (argv, { read, write }) {
    const isDecode = argv.includes('-d')
    argv = argv.filter(v => v[0] !== '-')
    const input = await read(argv[0], 'utf-8')
    const output = isDecode
      ? str.fromBytes(base64.toBytes(input))
      : base64.fromBytes(str.toBytes(input)) + '\n'
    await write(argv[1], output, 'utf-8')
    process.exit()
  }
}

export default Base64