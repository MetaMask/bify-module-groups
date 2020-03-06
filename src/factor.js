const COMMON = 'common'

module.exports = { factor, COMMON }


function factor (groups, modules) {

  const moduleOwners = new Map()
  const packageOwners = new Map()

  // walk the graph and claim/common each module
  groups.forEach((groupId) => {
    walkFrom(groupId, (...args) => factorModule(groupId, ...args))
  })
  // console.log('factor modules', moduleOwners)

  // determine package owners
  Array.from(moduleOwners.entries()).forEach(factorPackage)
  // console.log('factor packages', packageOwners)

  // walk graph and adjust modules by package ownership
  groups.forEach((groupId) => {
    walkFrom(groupId, updateModuleForCommonPackages)
  })
  // console.log('update modules', moduleOwners)


  return { moduleOwners, packageOwners }


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

  function factorPackage ([moduleId, groupId]) {
    const { packageName } = modules[moduleId]
    // root package: skip
    if (packageName === '<root>') {
      // console.log(`factorPackage/root ${moduleId} ${packageName} ${groupId}`)
      return
    }
    // module already common: make package common
    if (isCommon(moduleOwners, moduleId)) {
      packageOwners.set(packageName, COMMON)
      // console.log(`factorPackage/modCommon ${moduleId} ${packageName} ${groupId}`)
      return
    }
    // already common: skip
    if (isCommon(packageOwners, packageName)) {
      // console.log(`factorPackage/isCommon ${moduleId} ${packageName} ${groupId}`)
      return
    }
    // already claimed: make common
    if (isClaimedByOtherGroup(packageOwners, packageName, groupId)) {
      packageOwners.set(packageName, COMMON)
      // console.log(`factorPackage/isClaimed ${moduleId} ${packageName} ${groupId}`)
      return
    }
    // available: claim for self
    packageOwners.set(packageName, groupId)
    // console.log(`factorPackage/claim ${moduleId} ${packageName} ${groupId}`)
    return
  }

  function updateModuleForCommonPackages (moduleId, moduleData) {
    const { packageName } = moduleData
    // root package: continue to children
    if (packageName === '<root>') {
      return true
    }
    // module already common: skip children
    if (isCommon(moduleOwners, moduleId)) {
      return false
    }
    // package is common: make common recursively, skip children
    if (isCommon(packageOwners, packageName)) {
      makeModuleCommonRecursively(moduleId)
      return false
    }
    // continue to children
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