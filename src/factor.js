
module.exports = factorByPackage


function factorByPackage (entries, modules) {
  // console.log('modules', modules)

  const commonPackages = new Set()
  const claimedPackages = new Map()

  entries.forEach((entryId) => {
    const groupId = entryId
    walkFrom(entryId, (...args) => claimOrMakeCommon(groupId, ...args))
  })

  // console.log('claimedPackages', claimedPackages)
  const groupSets = {}
  Array.from(claimedPackages.entries()).forEach(([packageName, groupId]) => {
    const set = groupSets[groupId] = groupSets[groupId] || new Set()
    set.add(packageName)
  })

  return { common: commonPackages, groupSets }


  function claimOrMakeCommon (groupId, moduleId, moduleData) {
    const { packageName } = moduleData
    // if module is from the <root> package, skip
    if (packageName === '<root>') {
      // continue digging deeper
      // console.log(`+ ${packageName} is root`)
      return true
    }
    // already common: stop here
    if (isCommon(packageName)) {
      // skip searching children
      // console.log(`+ ${packageName} is common`)
      return false
    }
    // claimed by other group: move to common
    if (isClaimedByOther(groupId, packageName)) {
      // console.log(`+ ${packageName} is claimed by not ${groupId}`)
      makeCommon(moduleId)
      // console.log('claimedPackages', claimedPackages)

      // skip searching children
      return false
    }
    // console.log(`+ ${packageName} claiming for self ${groupId}`)
    // not claimed by other: claim for self
    claimForGroup(groupId, packageName)
    // console.log('claimedPackages', claimedPackages)
    // continue searching children
    return true
  }

  function isCommon (packageName) {
    return commonPackages.has(packageName)
  }

  function isClaimedByOther (groupId, packageName) {
    return claimedPackages.has(packageName) && (claimedPackages.get(packageName) !== groupId)
  }

  function claimForGroup (groupId, packageName) {
    claimedPackages.set(packageName, groupId)
  }

  function makeCommon (moduleId) {
    // we have to walk this graph and remove all its packages from ownership to common
    // if we build up some table ahead of time, we wont have to walk again
    // console.log(`makeCommon ${moduleId}`)
    walkFrom(moduleId, (moduleId, moduleData) => {
      const { packageName } = moduleData
      // console.log(`makeCommon walk: ${moduleId} ${packageName}`)
      claimedPackages.delete(packageName)
      commonPackages.add(packageName)
    })
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