const through = require('through2').obj
const pump = require('pump')
const pify = require('pify')
const { factor, COMMON } = require('./factor')

class ModuleGroup {
  constructor ({ label }) {
    this.label = label
    this.stream = through()
  }
}

module.exports = { createSpy, getStreamResults, createFactorStream, ModuleGroup }


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


function createFactorStream () {
  const modules = {}
  const entryPoints = []
  const moduleGroups = {}

  const factorStream = createSpy({
    onEach: recordEachModule,
    onEnd: flushAllModules,
  })

  createModuleGroup({ groupId: COMMON, file: COMMON })

  return factorStream


  function recordEachModule (moduleData) {
    // collect entry points
    if (moduleData.entry) {
      const groupId = moduleData.id
      const { file } = moduleData
      // console.log(`entry point found ${groupId} ${file}`)
      entryPoints.push(groupId)
      createModuleGroup({ groupId, file })
    }
    // collect modules
    modules[moduleData.id] = moduleData
  }

  function flushAllModules () {
    // factor module into owners
    const { moduleOwners } = factor(entryPoints, modules)
    // report factor complete so wiring can be set up
    // before data enters the stream
    // onFactorDone(moduleGroups)
    // pipe modules into their owner group's stream
    Array.from(moduleOwners.entries()).forEach(([moduleId, groupId]) => {
      const groupStream = moduleGroups[groupId].stream
      const moduleData = modules[moduleId]
      groupStream.push(moduleData)
    })
    // end all group streams (common stream will self-end)
    Object.values(moduleGroups).forEach(moduleGroup => {
      moduleGroup.stream.end()
    })
  }

  function createModuleGroup ({ groupId, file }) {
    const moduleGroup = new ModuleGroup({ label: file })
    moduleGroups[groupId] = moduleGroup
    factorStream.push(moduleGroup)
  }

}
