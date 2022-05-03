const pump = require('pump')
const { ModuleGroup, createForEachStream } = require('./util')

const COMMON = 'common'

module.exports = { groupByFactor, factor, COMMON }

function factor (groups, modules) {
  const moduleOwners = new Map()
  const result = { moduleOwners }

  // walk the graph and claim/common each module
  groups.forEach((groupId) => {
    walkFrom(groupId, (...args) => factorModule(groupId, ...args))
  })
  // console.log('factor modules', moduleOwners)

  return result

  function factorModule (groupId, moduleId) {
    // already common: stop here
    if (isCommon(moduleOwners, moduleId)) {
      // console.log(`factorModule/isCommon ${moduleId} ${groupId}`)
      return false
    }
    // already claimed: make common recursively
    if (isClaimedByOtherGroup(moduleOwners, moduleId, groupId)) {
      makeModuleCommonRecursively(moduleId)
      // console.log(`factorModule/isClaimed ${moduleId} ${groupId}`)
      return false
    }
    // available: claim for self, continue deeper
    moduleOwners.set(moduleId, groupId)
    // console.log(`factorModule/claim ${moduleId} ${groupId}`)
    return true
  }

  function isCommon (registry, id) {
    return registry.get(id) === COMMON
  }

  function isClaimedByOtherGroup (registry, elementId, groupId) {
    return registry.has(elementId) && registry.get(elementId) !== groupId
  }

  function makeModuleCommonRecursively (startId) {
    walkFrom(startId, (moduleId) => {
      // already common: skip children
      if (isCommon(moduleOwners, moduleId)) {
        return false
      }
      // make common, continue to children
      moduleOwners.set(moduleId, COMMON)
      return true
    })
  }

  function walkFrom (entryId, visitorFn) {
    const alreadyWalked = new Set()
    const modulesToWalk = [entryId]
    for (const moduleId of modulesToWalk) {
      // dont walk same node twice (prevent inf loops)
      if (alreadyWalked.has(moduleId)) {
        continue
      }
      alreadyWalked.add(moduleId)
      // call the visitor for this entry
      const moduleData = modules[moduleId]
      const continueDeeper = visitorFn(moduleId, moduleData)
      if (continueDeeper === false) {
        // skip walking children
        continue
      }
      // continuing deeper, queue up children
      Object.values(moduleData.deps).filter(Boolean).forEach(nextId => {
        modulesToWalk.push(nextId)
      })
    }
  }
}

function groupByFactor ({
  entryFileToLabel = (filepath) => filepath
} = {}) {
  const modules = {}
  const entryPoints = []
  const moduleGroups = {}

  const factorStream = createForEachStream({
    onEach: handleModuleGroup,
    onEnd: flushAllModules
  })

  // create "common" group
  createModuleGroup({ groupId: COMMON, file: COMMON })

  return factorStream

  // for now we treat all groups as equal sources of modules
  // that is, we ignore and just sort of join the groups
  // sorry, i dont know why you would group before factoring
  function handleModuleGroup (moduleGroup) {
    pump(
      moduleGroup.stream,
      createForEachStream({
        onEach: (moduleData) => recordEachModule(moduleData, moduleGroup)
      })
    )
  }

  function recordEachModule (moduleData, parentGroup) {
    // collect entry points
    if (moduleData.entry) {
      const { file, id: groupId } = moduleData
      // console.log(`entry point found ${groupId} ${file}`)
      entryPoints.push(groupId)
      createModuleGroup({ groupId, file, parent: parentGroup })
    }
    // collect modules
    modules[moduleData.id] = moduleData
  }

  function flushAllModules () {
    // factor module into owners
    const { moduleOwners } = factor(entryPoints, modules)
    // pipe modules into their owner group's stream
    for (const [moduleId, groupId] of moduleOwners.entries()) {
      // console.log(`flush ${moduleId} to ${groupId}`)
      const groupStream = moduleGroups[groupId].stream
      const moduleData = modules[moduleId]
      groupStream.push(moduleData)
    }
    // end all group streams (common stream will self-end)
    Object.values(moduleGroups).forEach(moduleGroup => {
      moduleGroup.stream.end()
    })
  }

  function createModuleGroup ({ groupId, file, parentGroup }) {
    const label = entryFileToLabel(file)
    const moduleGroup = new ModuleGroup({ label, parentGroup })
    moduleGroups[groupId] = moduleGroup
    factorStream.push(moduleGroup)
  }
}
