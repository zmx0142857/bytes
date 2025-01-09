import { promises as fs } from 'fs'
import Cmpt from '../examples/cmpt.js'

const main = async () => {
  const { argv } = process
  if (argv[2] === 'info') {
    const bytes = await fs.readFile(argv[3])
    const headers = Cmpt.info(bytes)
    headers.forEach(header => console.log(header))
  } else if (argv[2] === 'split') {
    const bytes = await fs.readFile(argv[3])
    await Cmpt.split(bytes, argv[4])
  } else if (argv[2] === 'glb') {
    const bytes = await fs.readFile(argv[3])
    await Cmpt.glb(bytes, argv[4])
  } else if (argv[2] === 'make') {
    await Cmpt.make(argv[3], argv[4])
  } else {
    console.log(`
usage: node cmpt.js COMMAND INPUT_PATH [OUTPUT_PATH]

command:
  info    show information of the cmpt file
  split   split cmpt file into b3dm & i3dm files
  make    make cmpt file from b3dm & i3dm files
  glb     extract glb files from cmpt
`)
  }
}

main()