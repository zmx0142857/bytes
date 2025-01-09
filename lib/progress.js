const Progress = ({ init = true, step = 10 } = {}) => {
  let value = -Infinity
  const update = (newValue) => {
    newValue = Math.ceil(newValue * 100)
    if (newValue - value >= step) {
      value = newValue
      console.log(newValue + '%')
    }
  }
  if (init) update(0)
  return update
}

export default Progress
