
module.exports = factorByPackage


function factorByPackage (entries, modules) {

  // package data
  const commonPackages = new Set()
  const claimedPackages = new Map()
  const modulesForPackage = new Map()
  // root module data
  const commonModules = new Set()
  const claimedModules = new Map()
  // results
  const groupModules = {}
  const common = []

  // walk the graph and claim/common each non-root package or root module
  entries.forEach((entryId) => {
    const groupId = entryId
    walkFrom(entryId, (...args) => factorPackages(groupId, ...args))
  })

  // dump claimedPackages into groupModules
  Array.from(claimedPackages.entries()).forEach(([packageName, groupId]) => {
    const moduleIds = groupModules[groupId] = groupModules[groupId] || []
    const packageModules = modulesForPackage.get(packageName)
    packageModules.forEach(moduleId => moduleIds.push(moduleId))
  })

  // dump claimedModules into groupModules
  Array.from(claimedModules.entries()).forEach(([moduleId, groupId]) => {
    const moduleIds = groupModules[groupId] = groupModules[groupId] || []
    moduleIds.push(moduleId)
  })

  // dump commonPackages into common
  Array.from(commonPackages).forEach((packageName) => {
    const packageModules = modulesForPackage.get(packageName)
    packageModules.forEach(moduleId => common.push(moduleId))
  })

  // dump commonModules into common
  Array.from(commonModules).forEach((moduleId) => {
    common.push(moduleId)
  })

  return { common, groupModules }


  function factorPackages (groupId, moduleId, moduleData) {
    const { packageName } = moduleData

    // if module is from the <root> package, skip
    if (packageName === '<root>') {
      // factor the root modules using module-level granularity
      factorRootModules(groupId, moduleId, moduleData)
      // continue digging deeper
      // console.log(`+ ${packageName} is root`)
      return true
    }

    // collect non-root modules under packageName
    let modulesInThisPackage = modulesForPackage.get(packageName)
    if (!modulesInThisPackage) {
      modulesInThisPackage = new Set()
      modulesForPackage.set(packageName, modulesInThisPackage)
    }
    modulesInThisPackage.add(moduleId)

    // already common: stop here
    if (isCommonPackage(packageName)) {
      // skip searching children
      // console.log(`+ ${packageName} is common`)
      return false
    }
    // claimed by other group: move to common
    if (isPackageClaimedByOther(groupId, packageName)) {
      // console.log(`+ ${packageName} is claimed by not ${groupId}`)
      makeCommonPackage(moduleId)
      // console.log('claimedPackages', claimedPackages)
      // skip searching children
      return false
    }
    // console.log(`+ ${packageName} claiming for self ${groupId}`)
    // not claimed by other: claim for self
    claimPackageForGroup(groupId, packageName)
    // console.log('claimedPackages', claimedPackages)
    // continue searching children
    return true
  }

  function isCommonPackage (packageName) {
    return commonPackages.has(packageName)
  }

  function isPackageClaimedByOther (groupId, packageName) {
    return claimedPackages.has(packageName) && (claimedPackages.get(packageName) !== groupId)
  }

  function claimPackageForGroup (groupId, packageName) {
    claimedPackages.set(packageName, groupId)
  }

  function makeCommonPackage (moduleId) {
    // we have to walk this graph and remove all its packages from ownership to common
    // if we build up some table ahead of time, we wont have to walk again
    // console.log(`makeCommonPackage ${moduleId}`)
    walkFrom(moduleId, (moduleId, moduleData) => {
      const { packageName } = moduleData
      // console.log(`makeCommonPackage walk: ${moduleId} ${packageName}`)
      claimedPackages.delete(packageName)
      commonPackages.add(packageName)
    })
  }

  function factorRootModules (groupId, moduleId, moduleData) {
    // already common: stop here
    if (commonModules.has(moduleId)) {
      // skip searching children
      // console.log(`+ ${packageName} is common`)
      return false
    }
    // claimed by other group: move to common
    if (isModuleClaimedByOther(groupId, moduleId)) {
      // console.log(`+ ${packageName} is claimed by not ${groupId}`)
      makeModuleCommon(moduleId)
      // console.log('claimedPackages', claimedPackages)
      // skip searching children
      return false
    }
    // console.log(`+ ${packageName} claiming for self ${groupId}`)
    // not claimed by other: claim for self
    claimModuleForGroup(groupId, moduleId)
    // console.log('claimedPackages', claimedPackages)
    // continue searching children
    return true
  }

  function isModuleClaimedByOther (groupId, moduleId) {
    return claimedModules.has(moduleId) && (claimedModules.get(moduleId) !== groupId)
  }

  function makeModuleCommon (moduleId) {
    // we have to walk this graph and remove all its packages from ownership to common
    // if we build up some table ahead of time, we wont have to walk again
    // console.log(`makeCommon ${moduleId}`)
    walkFrom(moduleId, (moduleId, moduleData) => {
      const { packageName } = moduleData
      if (packageName !== '<root>') return false
      // console.log(`makeCommon walk: ${moduleId} ${packageName}`)
      claimedModules.delete(moduleId)
      commonModules.add(moduleId)
    })
  }

  function claimModuleForGroup (groupId, moduleId) {
    claimedModules.set(moduleId, groupId)
  }

  function walkFrom (entryId, visitorFn) {
    const alreadyWalked = new Set()
    const modulesToWalk = [entryId]
    for (const moduleId of modulesToWalk) {
      // dont walk 2 nodes twice (prevent loops)
      if (alreadyWalked.has(moduleId)) {
        // console.log('already walked')
        continue
      }
      alreadyWalked.add(moduleId)
      const moduleData = modules[moduleId]
      // call the visitor for this entry
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