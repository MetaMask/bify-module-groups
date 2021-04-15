const through = require('through2').obj
const pump = require('pump')
const browserPack = require('browser-pack')
const { createPackageDataStream } = require('bify-packagedata-stream')
const { createFactorStream } = require('./util')

/*  export a Browserify plugin  */
module.exports = plugin

function plugin (browserify, pluginOpts = {}) {
  // setup the plugin in a re-bundle friendly way
  browserify.on('reset', setupPlugin)
  setupPlugin()

  function setupPlugin () {
    // inject package name into module data
    browserify.pipeline.get('emit-deps').unshift(
      createPackageDataStream()
    )
    // replace browserify packer with factor-stream
    browserify.pipeline.get('pack').splice(0, 1,
      createFactorStream()
    )
  }
}

