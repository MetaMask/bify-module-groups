const through = require('through2').obj
const pump = require('pump')
const pify = require('pify')

module.exports = { createSpy, getStreamResults }


const noop = () => {}

function createSpy ({ onEach = noop, onEnd = noop }) {
  return through(
    (entry, _, cb) => { onEach(entry); cb() },
    (cb) => { onEnd(); cb() },
  )
}

async function getStreamResults (stream) {
  // get bundle results
  const results = []
  await pify(cb => {
    pump(
      stream,
      createSpy({ onEach: (entry) => { results.push(entry) } }),
      cb
    )
  })()
  return results
}