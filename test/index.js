const path = require('path')
const test = require('tape')
const clone = require('clone')
const browserify = require('browserify')
const through = require('through2').obj
const { getStreamResults } = require('../src/util')
const { groupByFactor, factor, COMMON } = require('../src/factor')
const { groupBySize } = require('../src/size')

const pluginPath = require.resolve(path.join(__dirname, '..', 'src', 'plugin.js'))

test('factor basic test', async (t) => {
  // this test uses factor directly
  const { files, modules } = createSimpleFactorFiles()
  const entryFiles = files.filter(file => file.entry)
  const entryPoints = entryFiles.map(file => file.id)
  const { moduleOwners } = factor(entryPoints, modules)

  // check common modules
  const commonModules = selectModulesByGroupId(moduleOwners, COMMON)
  t.deepEqual(commonModules, ['12', '3'], 'common modules as expected')

  // check groups
  const nonCommonGroups = new Set(moduleOwners.values())
  nonCommonGroups.delete(COMMON)
  const groupModulesEntries = []
  Array.from(nonCommonGroups).forEach((groupId) => {
    const groupModules = selectModulesByGroupId(moduleOwners, groupId)
    groupModulesEntries.push([groupId, groupModules])
  })
  t.deepEqual(groupModulesEntries, [
    ['entry1', ['10', '2', 'entry1']],
    ['entry2', ['11', '4', 'entry2']]
  ], 'groups claimed expected modules')

  // make sure nothing got lost or added
  const beforeIds = files.map(file => file.id)
  const afterIds = Array.from(moduleOwners.keys()).map(String)
  const missingIds = beforeIds.filter(id => !afterIds.includes(id))
  const newIds = afterIds.filter(id => !beforeIds.includes(id))
  t.equal(missingIds.length, 0, 'no missing ids')
  t.equal(newIds.length, 0, 'no new ids')

  t.end()
})

test('plugin factor test', async (t) => {
  const { files } = createSimpleFactorFiles()

  const bundler = browserify({ dedupe: false })
    .plugin(pluginPath)

  injectFilesIntoBrowserify(bundler, files)

  const bundleStream = bundler.bundle()
    .pipe(groupByFactor())

  // get bundle results
  const moduleGroups = await getStreamResults(bundleStream)
  t.equal(moduleGroups.length, 3, 'should get correct number of module groups')

  // gather module contents
  const moduleGroupContents = {}
  for (const moduleGroup of moduleGroups) {
    moduleGroupContents[moduleGroup.label] = await getStreamResults(moduleGroup.stream)
  }

  const factoringSummary = Object.fromEntries(
    Object.entries(moduleGroupContents)
      .map(([key, matches]) => [key, matches.map(entry => entry.file)])
  )

  t.deepEqual(factoringSummary, { common: ['./node_modules/b/index.js', './src/12.js'], './src/entry-one.js': ['./src/entry-one.js', './node_modules/a/index.js', './src/10.js'], './src/entry-two.js': ['./src/entry-two.js', './node_modules/c/index.js', './src/11.js'] }
    , 'groups claimed expected modules')

  t.end()
})

test('plugin size test', async (t) => {
  const { files } = createSimpleSizeFiles()

  const bundler = browserify({ dedupe: false })
    .plugin([pluginPath, { label: 'bundle' }])

  injectFilesIntoBrowserify(bundler, files)

  const bundleStream = bundler.bundle()
    .pipe(groupBySize({ sizeLimit: 100 }))

  // get bundle results
  const moduleGroups = await getStreamResults(bundleStream)
  t.equal(moduleGroups.length, 3, 'should get correct number of module group')

  // gather module contents
  const moduleGroupContents = {}
  for (const moduleGroup of moduleGroups) {
    moduleGroupContents[moduleGroup.label] = await getStreamResults(moduleGroup.stream)
  }

  const factoringSummary = Object.fromEntries(
    Object.entries(moduleGroupContents)
      .map(([key, matches]) => [key, matches.map(entry => entry.file)])
  )

  t.deepEqual(factoringSummary, { 'bundle-0': ['./2.js'], 'bundle-1': ['./4.js'], 'bundle-2': ['./5.js', './1.js', './3.js'] }, 'groups claimed expected modules')

  t.end()
})

test('plugin factor + size test', async (t) => {
  const { files } = createSimpleFactorFiles()

  const bundler = browserify({ dedupe: false })
    .plugin(pluginPath)

  injectFilesIntoBrowserify(bundler, files)

  const bundleStream = bundler.bundle()
    .pipe(groupByFactor({
      entryFileToLabel (filepath) { return path.parse(filepath).name }
    }))
    .pipe(groupBySize({ sizeLimit: 200 }))

  // get bundle results
  const moduleGroups = await getStreamResults(bundleStream)
  t.equal(moduleGroups.length, 5, 'should get correct number of module groups')

  // gather module contents
  const moduleGroupContents = {}
  for (const moduleGroup of moduleGroups) {
    moduleGroupContents[moduleGroup.label] = await getStreamResults(moduleGroup.stream)
  }

  const factoringSummary = Object.fromEntries(
    Object.entries(moduleGroupContents)
      .map(([key, matches]) => [key, matches.map(entry => entry.file)])
  )

  t.deepEqual(factoringSummary, { 'common-0': ['./node_modules/b/index.js', './src/12.js'], 'entry-one-0': ['./node_modules/a/index.js', './src/10.js'], 'entry-two-0': ['./node_modules/c/index.js', './src/11.js'], 'entry-one-1': ['./src/entry-one.js'], 'entry-two-1': ['./src/entry-two.js'] }, 'groups claimed expected modules')
  t.end()
})

function createSimpleFactorFiles () {
  const files = [{
    // common.js
    id: '3',
    packageName: 'b',
    file: './node_modules/b/index.js',
    deps: {},
    source: 'module.exports = 3'
  }, {
    id: '12',
    packageName: '<root>',
    file: './src/12.js',
    deps: {},
    source: 'module.exports = 10'
  }, {
    // src/1.js
    id: 'entry1',
    packageName: '<root>',
    file: './src/entry-one.js',
    deps: { 2: 2, 3: 3, 10: 10 },
    source: 'global.testResult = require(\'2\') * require(\'3\') * require(\'10\')',
    entry: true
  }, {
    id: '10',
    packageName: '<root>',
    file: './src/10.js',
    deps: { 12: 12 },
    source: 'module.exports = require(\'12\')'
  }, {
    id: '2',
    packageName: 'a',
    file: './node_modules/a/index.js',
    deps: {},
    source: 'module.exports = 4'
  }, {
    // src/2.js
    id: 'entry2',
    packageName: '<root>',
    file: './src/entry-two.js',
    deps: { 3: 3, 4: 4, 11: 11 },
    source: 'global.testResult = require(\'3\') * require(\'4\') * require(\'11\')',
    entry: true
  }, {
    id: '11',
    packageName: '<root>',
    file: './src/11.js',
    deps: { 12: 12 },
    source: 'module.exports = require(\'12\')'
  }, {
    id: '4',
    packageName: 'c',
    file: './node_modules/c/index.js',
    deps: {},
    source: 'module.exports = 4'
  }]

  const modules = filesToModules(files)

  return { files, modules }
}

function createSimpleSizeFiles () {
  const files = [{
    // common.js
    id: '1',
    file: './1.js',
    // deps: {},
    source: createSourceBySize(40),
    entry: true
  }, {
    id: '2',
    file: './2.js',
    // deps: {},
    source: createSourceBySize(40)
  }, {
    // src/1.js
    id: '3',
    file: './3.js',
    // deps: { 2: 2, 3: 3, 10: 10 },
    source: createSourceBySize(40),
    entry: true
  }, {
    id: '4',
    file: './4.js',
    // deps: { 12: 12 },
    source: createSourceBySize(150)
  }, {
    id: '5',
    file: './5.js',
    // deps: {},
    source: createSourceBySize(10)
  }]

  const modules = filesToModules(files)

  return { files, modules }
}

function createSourceBySize (size) {
  return new Array(size).fill('1').join('')
}

function filesToModules (files) {
  const modules = {}
  files.forEach((file) => {
    modules[file.id] = file
  })
  return modules
}

function injectFilesIntoBrowserify (bundler, files) {
  // override browserify's module resolution
  const mdeps = bundler.pipeline.get('deps').get(0)
  mdeps.resolve = (id, parent, cb) => {
    const parentModule = files.find(f => f.id === parent.id)
    const moduleId = parentModule ? parentModule.deps[id] : id
    let moduleData = files.find(f => f.id === moduleId)
    if (!moduleData) moduleData = files.find(f => f.file === moduleId)
    if (!moduleData) {
      throw new Error(`could not find "${moduleId}" (${id}) in files:\n${files.map(f => f.id).join('\n')}`)
    }
    const file = moduleData.file
    const pkg = null
    const fakePath = moduleData.file

    cb(null, file, pkg, fakePath)
  }

  // inject files into browserify pipeline
  const fileInjectionStream = through(null, null, function (cb) {
    clone(files).reverse().forEach(file => {
      // must explicitly specify entry field
      file.entry = file.entry || false
      // source cannot be falsey
      if (!file.source) {
        throw new Error('injectFilesIntoBrowserify - file.source cannot be falsey')
      }
      this.push(file)
    })
    cb()
  })
  bundler.pipeline.get('record').unshift(fileInjectionStream)

  return bundler
}

function selectModulesByGroupId (moduleOwners, groupId) {
  return Array.from(moduleOwners.entries())
    .filter(([_, owner]) => owner === groupId)
    .map(([moduleId]) => String(moduleId))
    .sort()
}
