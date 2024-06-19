const { Transform, pipeline } = require('readable-stream')
const pify = require('pify')

const DEFAULT_TRANSFORM_OPTIONS = {
  highWaterMark: 16,
  objectMode: true
}

class ModuleGroup {
  constructor ({ label, parentGroup, ...streamOptions }) {
    this.label = label
    this.parentGroup = parentGroup
    this.stream = new Transform({
      ...DEFAULT_TRANSFORM_OPTIONS,
      ...streamOptions
    })
  }
}

module.exports = { createForEachStream, getStreamResults, ModuleGroup }

const noop = () => {}

function createForEachStream ({ onEach = noop, onEnd = noop, ...streamOptions }) {
  return new Transform({
    ...DEFAULT_TRANSFORM_OPTIONS,
    transform: (entry, _, cb) => { onEach(entry); cb() },
    final: (cb) => { onEnd(); cb() },
    ...streamOptions
  })
}

async function getStreamResults (stream, streamOptions) {
  // get bundle results
  const results = []
  await pify(cb => {
    pipeline(
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
