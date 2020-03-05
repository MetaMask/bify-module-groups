const test = require('tape')
const clone = require('clone')
const browserify = require('browserify')
const through = require('through2').obj
const { getStreamResults } = require('../src/util')
const factor = require('../src/factor')

test('factor basic test', async (t) => {
  const { files, modules } = createSimpleFactorFiles()
  const entryPoints = files.filter(file => file.entry).map(file => file.id)
  const { common, groupSets } = factor(entryPoints, modules)

  t.equal(common.size, 1, 'should be one common package')
  t.deepEqual(Array.from(common), ['b'])

  const groupSetEntries = Object.entries(groupSets).map(([groupId, set]) => ([groupId, Array.from(set)]))
  t.equal(groupSetEntries.length, 2, 'should be two groups')
  t.deepEqual(groupSetEntries, [
    ['entry1', ['a']],
    ['entry2', ['c']],
  ], 'groups claimed expected modules')

  t.end()
})

test('plugin basic test', async (t) => {
  const { files } = createSimpleFactorFiles()

  const bundler = browserify()
    .plugin(__dirname + '/../src/index.js')

  injectFilesIntoBrowserify(bundler, files)

  const bundleStream = bundler.bundle()

  // get bundle results
  const vinylResults = await getStreamResults(bundleStream)
  // console.log('vinylResults', vinylResults.map(result => result))
  t.equal(vinylResults.length, 3, 'should get 3 vinyl objects')
  t.end()
})

function createSimpleFactorFiles () {
  const files = [{
    id: 'entry1',
    packageName: '<root>',
    file: './src/1.js',
    deps: { 2: 2, 3: 3 },
    source: `module.exports = "entry1"`,
    entry: true,
  }, {
    id: 'entry2',
    packageName: '<root>',
    file: './src/2.js',
    deps: { 3: 3, 4: 4 },
    source: `module.exports = "entry2"`,
    entry: true,
  }, {
    id: '2',
    packageName: 'a',
    file: './node_modules/a/index.js',
    deps: {},
    source: `module.exports = "2"`,
  }, {
    id: '3',
    packageName: 'b',
    file: './node_modules/b/index.js',
    deps: {},
    source: `module.exports = "3"`,
  }, {
    id: '4',
    packageName: 'c',
    file: './node_modules/c/index.js',
    deps: {},
    source: `module.exports = "4"`,
  }]

  const modules = filesToModules(files)

  return { files, modules }
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
    // console.log('resolve', id, parent)
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
    // console.log('resolve done', {moduleData, file, pkg, fakePath})
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