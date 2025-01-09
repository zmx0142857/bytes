import { promises as fs } from 'fs'
import Glb from '../examples/glb.js'

const main = async () => {
  const { argv } = process
  if (argv[2] === 'info') {
    const bytes = await fs.readFile(argv[3])
    console.dir(Glb.info(bytes), { depth: null })
  } else if (argv[2] === 'toGltf') {
    const bytes = await fs.readFile(argv[3])
    Glb.toGltf(bytes, argv[4])
  } else if (argv[2] === 'fromGltf') {
    const bytes = await fs.readFile(argv[3], 'utf-8')
    Glb.fromGltf(bytes, argv[4])
  } else {
    console.log(`
usage: node glb.js COMMAND PATH

command:
  info      show glb info
  toGltf    convert glb to gltf
  fromGltf  convert gltf to glb
`)
  }
}

main()