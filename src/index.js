const through = require('through2').obj
const pump = require('pump')
const vinylSource = require('vinyl-source-stream')
const browserPack = require('browser-pack')
const { createPackageDataStream } = require('bify-packagedata-stream')
const factor = require('./factor')
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
    browserify.pipeline.get('label').push(
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
      for (const [filename, stream] of Object.entries(groupStreams)) {
        const packer = createPacker({ raw: true, hasExports: true }, filename)

        // stream.on('data', (data) => console.log(`stream "${filename}" ${data}`))
        // packer.on('data', (data) => console.log(`packer "${filename}" ${data}`))

        // console.log('pumping groupStream', filename)
        pump(
          stream,
          packer,
          vinylSource(filename),
          finalOutput,
          // () => console.log('done')
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
      groupStreams[file] = groupStream
    }
    // collect modules
    modules[moduleData.id] = moduleData
  }

  function flushAllModules () {
    // console.error(`factoring for entryPoints: ${entryPoints.join(', ')}`)
    const { common, groupModules } = factor(entryPoints, modules)

    // report factor complete so wiring can be set up
    onFactorDone(groupStreams)
    // pipe common modules to the main stream
    pushModulesIntoStream(common, factorStream)
    // for each group, pipe group modules into the group stream
    Object.entries(groupModules).forEach(([groupId, moduleIds]) => {
      const moduleData = modules[groupId]
      const { file } = moduleData
      // pipe group modules into this group's stream
      const groupStream = groupStreams[file]
      // console.log(`pushing packages for "${file}"`)
      pushModulesIntoStream(moduleIds, groupStream)
      groupStream.end()
    })
  }

  function pushModulesIntoStream (moduleIds, stream) {
    for (const moduleId of moduleIds) {
      const moduleData = modules[moduleId]
      stream.push(moduleData)
    }
  }

}
