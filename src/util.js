const through = require('through2').obj
const pump = require('pump')
const pify = require('pify')

class ModuleGroup {
  constructor ({ label }) {
    this.label = label
    this.stream = through()
  }
}

module.exports = { createForEachStream, getStreamResults, ModuleGroup }


const noop = () => {}

function createForEachStream ({ onEach = noop, onEnd = noop }) {
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
      createForEachStream({ onEach: (entry) => { results.push(entry) } }),
      cb
    )
  })()
  return results
}

