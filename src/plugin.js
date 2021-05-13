const { createForEachStream, ModuleGroup } = require('./util')

/*  export a Browserify plugin  */
module.exports = plugin
module.exports.args = {
  dedupe: false
}

function plugin (browserify, pluginOpts = {}) {
  // setup the plugin in a re-bundle friendly way
  browserify.on('reset', setupPlugin)
  setupPlugin()

  function setupPlugin () {
    // replace browserify packer with factor-stream
    browserify.pipeline.get('pack').splice(0, 1,
      createModuleGroupStream(pluginOpts)
    )
  }
}

function createModuleGroupStream ({
  label = 'primary'
}) {
  const primaryGroup = new ModuleGroup({ label })
  const streamOfModuleGroups = createForEachStream({
    onEach: (moduleData) => {
      // forward all inbound modules to the group obj's stream
      primaryGroup.stream.write(moduleData)
    },
    onEnd: () => {
      // forward the end event to the primary group stream
      primaryGroup.stream.end()
    }
  })
  // forward err event
  streamOfModuleGroups.on('error', err => {
    primaryGroup.stream.end(err)
  })
  // send out the module group
  streamOfModuleGroups.push(primaryGroup)
  return streamOfModuleGroups
}
