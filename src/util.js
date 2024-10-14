const through = require('through2').obj
const pump = require('pump')
const pify = require('pify')

const DEFAULT_TRANSFORM_OPTIONS = {
  highWaterMark: 16,
  objectMode: true
}

class ModuleGroup {
  constructor ({ label, parentGroup, ...streamOptions }) {
    this.label = label
    this.parentGroup = parentGroup
    this.stream = through({
      ...DEFAULT_TRANSFORM_OPTIONS,
      ...streamOptions
    })
  }
}

module.exports = { createForEachStream, getStreamResults, ModuleGroup }

const noop = () => {}

function createForEachStream ({ onEach = noop, onEnd = noop, ...streamOptions }) {
  return through({
    ...DEFAULT_TRANSFORM_OPTIONS,
    ...streamOptions
  },
  (entry, _, cb) => { onEach(entry); cb() },
  (cb) => { onEnd(); cb() }
  )
}

async function getStreamResults (stream, streamOptions) {
  // get bundle results
  const results = []
  await pify(cb => {
    pump(
      stream,
      createForEachStream({
        onEach: (entry) => { results.push(entry) },
        ...streamOptions
      }),
      cb
    )
  })()
  return results
}
