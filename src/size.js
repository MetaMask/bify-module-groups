const pump = require('pump')
const through = require('through2').obj
const { createForEachStream } = require('./util')

module.exports = groupBySize

// split each module group into as many module groups as it
// requires to stay under the sizeLimit
function groupBySize ({ sizeLimit = 200e3 } = {}) {
  const streamOfModuleGroups = createForEachStream({
    onEach: (moduleGroup) => {
      handleModuleGroup(moduleGroup, sizeLimit, streamOfModuleGroups)
    }
  })
  return streamOfModuleGroups
}

function handleModuleGroup (parentGroup, sizeLimit, streamOfModuleGroups) {
  const subgroups = []
  let currentSubgroup = createModuleGroup()
  let currentSize = 0
  
  pump(
    parentGroup.stream,
    createForEachStream({
      onEach: addNextModule,
      onEnd: endCurrentSubgroup,
    })  
  )
  return

  function addNextModule (moduleData) {
    // if too big for current subgroup, prepare next subgroup
    if ((currentSize + moduleData.source.length) > sizeLimit) {
      nextSubgroup()
    }
    // add to current subgroup
    currentSize += moduleData.source.length
    currentSubgroup.stream.push(moduleData)
  }

  function createModuleGroup () {
    const label = `${parentGroup.label}-${subgroups.length}`
    const moduleGroup = new ModuleGroup({ label })
    subgroups.push(moduleGroup)
    // add module group to stream output
    streamOfModuleGroups.push(moduleGroup)
    return moduleGroup
  }

  function nextSubgroup () {
    // mark the subgroup as complete
    currentSubgroup.stream.end()
    // set the next subgroup
    currentSubgroup = createModuleGroup()
    currentSize = 0
  }

  function endCurrentSubgroup () {
    // mark the subgroup as complete
    currentSubgroup.stream.end()
  }
}
