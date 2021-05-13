const pump = require('pump')
const { createForEachStream, ModuleGroup } = require('./util')

module.exports = { groupBySize }

// split each module group into as many module groups as it
// requires to stay under the sizeLimit
function groupBySize ({ sizeLimit = 200e3, groupingMap = new Map() } = {}) {
  const streamOfModuleGroups = createForEachStream({
    onEach: (moduleGroup) => {
      handleModuleGroup(moduleGroup, sizeLimit, streamOfModuleGroups, groupingMap)
    }
  })
  return streamOfModuleGroups
}

function handleModuleGroup (parentGroup, sizeLimit, streamOfModuleGroups, groupingMap) {
  let subgroupIndex = 0
  let currentSubgroup = createModuleGroup()
  let currentSize = 0
  const entryModules = []

  pump(
    parentGroup.stream,
    createForEachStream({
      onEach: (moduleData) => addNextModule(moduleData),
      onEnd: flushEntryModules
    })
  )

  function addNextModule (moduleData, allowEntry = false) {
    // entry modules must appear in the last group to ensure their deps are defined first
    if (moduleData.entry && !allowEntry) {
      entryModules.push(moduleData)
      return
    }
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
    if (groupingMap.has(parentGroup.label)) {
      groupingMap.get(parentGroup.label).add(label)
    } else {
      groupingMap.set(parentGroup.label, new Set([label]))
    }
    const moduleGroup = new ModuleGroup({ label, parentGroup })
    subgroupIndex++
    // add module group to stream output
    streamOfModuleGroups.push(moduleGroup)
    return moduleGroup
  }

  function nextSubgroup () {
    // mark the subgroup as complete
    endCurrentSubgroup()
    // set the next subgroup
    currentSubgroup = createModuleGroup()
    currentSize = 0
  }

  function flushEntryModules () {
    for (const moduleData of entryModules) {
      addNextModule(moduleData, true)
    }
    endCurrentSubgroup()
  }

  function endCurrentSubgroup () {
    // mark the subgroup as complete
    currentSubgroup.stream.end()
  }
}
