const through = require('through2').obj
const pump = require('pump')
const vinylSource = require('vinyl-source-stream')
const browserPack = require('browser-pack')
const { createPackageDataStream } = require('bify-packagedata-stream')
const { factor, COMMON } = require('./factor')
const { createSpy } = require('./util')

/*  export a Browserify plugin  */
module.exports = plugin

function plugin (browserify, pluginOpts = {}) {
  // parse options
  const createPacker = pluginOpts.createPacker || browserPack
  // setup the plugin in a re-bundle friendly way
  browserify.on('reset', setupPlugin)
  setupPlugin()

  function setupPlugin () {
    // Force browser-pack to export the requireFn
    browserify._bpack.hasExports = true
    // inject package name into module data
    browserify.pipeline.get('emit-deps').unshift(
      createPackageDataStream()
    )
    // place factor spy in just before packer
    // label.push positioning ensures deduped deps are in the deps obj
    browserify.pipeline.get('pack').unshift(
      createFactorStream({ onFactorDone })
    )
    // create vinyl-fs output stream
    browserify.pipeline.get('wrap').push(
      vinylSource('common.js')
    )
    // create a passthrough stream for the final output
    const finalOutput = through()
    browserify.pipeline.get('wrap').push(finalOutput)

    // for each groupStream, pack + vinyl-wrap + send to output
    function onFactorDone (groupStreams) {
      for (const stream of Object.values(groupStreams)) {
        const filename = stream.file
        const packer = createPacker({ raw: true, hasExports: true }, filename)
        pump(
          stream,
          packer,
          vinylSource(filename),
          finalOutput,
        )
      }
    }
  }
}

function createFactorStream ({ onFactorDone }) {
  const modules = {}
  const entryPoints = []
  const groupStreams = {}

  const factorStream = createSpy({
    onEach: recordEachModule,
    onEnd: flushAllModules,
  })

  return factorStream


  function recordEachModule (moduleData) {
    // collect entry points
    if (moduleData.entry) {
      const groupId = moduleData.id
      const { file } = moduleData
      // console.log(`entry point found ${groupId} ${file}`)
      entryPoints.push(groupId)
      const groupStream = through()
      groupStream.file = file
      groupStreams[moduleData.id] = groupStream
    }
    // collect modules
    modules[moduleData.id] = moduleData
  }

  function flushAllModules () {
    // factor module into owners
    const { moduleOwners } = factor(entryPoints, modules)
    // report factor complete so wiring can be set up
    // before data enters the stream
    onFactorDone(groupStreams)
    // pipe modules into their owner group's stream
    Array.from(moduleOwners.entries()).forEach(([moduleId, groupId]) => {
      const isCommon = (groupId === COMMON)
      const groupStream = isCommon ? factorStream : groupStreams[groupId]
      const moduleData = modules[moduleId]
      groupStream.push(moduleData)
    })
    // end all group streams (common stream will self-end)
    Object.values(groupStreams).forEach(groupStream => groupStream.end())
  }

}
