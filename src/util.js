const { Transform, pipeline } = require('readable-stream')
const pify = require('pify')

const TRANSFORM_OPTIONS = {
  highWaterMark: 16,
  objectMode: true
}

class ModuleGroup {
  constructor ({ label, parentGroup }) {
    this.label = label
    this.parentGroup = parentGroup
    this.stream = new Transform(TRANSFORM_OPTIONS)
  }
}

module.exports = { createForEachStream, getStreamResults, ModuleGroup }

const noop = () => {}

function createForEachStream ({ onEach = noop, onEnd = noop }) {
  return new Transform({
    ...TRANSFORM_OPTIONS,
    transform: (entry, _, cb) => { onEach(entry); cb() },
    final: (cb) => { onEnd(); cb() }
  })
}

async function getStreamResults (stream) {
  // get bundle results
  const results = []
  await pify(cb => {
    pipeline(
      stream,
      createForEachStream({ onEach: (entry) => { results.push(entry) } }),
      cb
    )
  })()
  return results
}
