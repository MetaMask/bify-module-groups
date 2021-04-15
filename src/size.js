const pump = require('pump')
const { createForEachStream, ModuleGroup } = require('./util')

module.exports = { groupBySize }

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
  let subgroupIndex = 0
  let currentSubgroup = createModuleGroup()
  let currentSize = 0

  pump(
    parentGroup.stream,
    createForEachStream({
      onEach: addNextModule,
      onEnd: endCurrentSubgroup
    })
  )

  function addNextModule (moduleData) {
    // if too big for current subgroup, prepare next subgroup
    // if too big but current group is empty, dont go to next subgroup yet
    if (currentSize !== 0 && (currentSize + moduleData.source.length) >= sizeLimit) {
      nextSubgroup()
    }
    // add to current subgroup
    currentSize += moduleData.source.length
    currentSubgroup.stream.push(moduleData)
  }

  function createModuleGroup () {
    const label = `${parentGroup.label}-${subgroupIndex}`
    const moduleGroup = new ModuleGroup({ label })
    subgroupIndex++
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
