const test = require('tape')
const clone = require('clone')
const browserify = require('browserify')
const through = require('through2').obj
const vinylBuffer = require('vinyl-buffer')
const { runInNewContext } = require('vm')
const { getStreamResults } = require('../src/util')
const factor = require('../src/factor')

test('factor basic test', async (t) => {
  const { files, modules } = createSimpleFactorFiles()
  const entryPoints = files.filter(file => file.entry).map(file => file.id)
  const { common, groupModules } = factor(entryPoints, modules)

  t.deepEqual(common.map(String), ['3', '12'], 'common modules should make expected')

  const groupSetEntries = Object.entries(groupModules).map(([groupId, arr]) => ([groupId, arr.map(String).sort()]))
  t.equal(groupSetEntries.length, 2, 'should be two groups')
  t.deepEqual(groupSetEntries, [
    ['entry1', ['10', '2', 'entry1']],
    ['entry2', ['11', '4', 'entry2']],
  ], 'groups claimed expected modules')

  t.end()
})

test('plugin basic test', async (t) => {
  const { files } = createSimpleFactorFiles()

  const bundler = browserify()
    .plugin(__dirname + '/../src/index.js')

  injectFilesIntoBrowserify(bundler, files)

  const bundleStream = bundler.bundle()
    .pipe(vinylBuffer())

  // get bundle results
  const vinylResults = await getStreamResults(bundleStream)
  // console.log('vinylResults', vinylResults.map(result => result))
  t.equal(vinylResults.length, 3, 'should get 3 vinyl objects')

  const bundles = {}
  vinylResults.forEach(file => {
    bundles[file.relative] = file.contents.toString()
  })

  t.equal(
    evalBundle(`${bundles['common.js']};\n${bundles['src/1.js']}`),
    60
  )
  t.equal(
    evalBundle(`${bundles['common.js']};\n${bundles['src/2.js']}`),
    120
  )

  t.end()
})

function evalBundle (bundle, context) {
  const newContext = Object.assign({}, {
    // whitelisted require fn (used by SES)
    require: (modulePath) => {
      if (modulePath === 'vm') return require('vm')
      throw new Error(`Bundle called "require" with modulePath not in the whitelist: "${modulePath}"`)
    },
    // test-provided context
  }, context)
  // circular ref (used by SES)
  newContext.global = newContext
  // perform eval
  runInNewContext(bundle, newContext)
  // pull out test result value from context (not always used)
  return newContext.testResult
}

function createSimpleFactorFiles () {
  const files = [{
    // common.js
      id: '3',
      packageName: 'b',
      file: './node_modules/b/index.js',
      deps: {},
      source: `module.exports = 3`,
    }, {
      id: '12',
      packageName: '<root>',
      file: './src/12.js',
      deps: {},
      source: `module.exports = 10`,
    }, {
    // src/1.js
      id: 'entry1',
      packageName: '<root>',
      file: './src/1.js',
      deps: { 2: 2, 3: 3, 10: 10 },
      source: `global.testResult = require('2') * require('3') * require('10')`,
      entry: true,
    }, {
      id: '10',
      packageName: '<root>',
      file: './src/10.js',
      deps: { 12: 12 },
      source: `module.exports = require('12')`,
    }, {
      id: '2',
      packageName: 'a',
      file: './node_modules/a/index.js',
      deps: {},
      source: `module.exports = 2`,
    }, {
    // src/2.js
      id: 'entry2',
      packageName: '<root>',
      file: './src/2.js',
      deps: { 3: 3, 4: 4, 11: 11 },
      source: `global.testResult = require('3') * require('4') * require('11')`,
      entry: true,
    }, {
      id: '11',
      packageName: '<root>',
      file: './src/11.js',
      deps: { 12: 12 },
      source: `module.exports = require('12') // comment to avoid dedupe :|`,
    }, {
      id: '4',
      packageName: 'c',
      file: './node_modules/c/index.js',
      deps: {},
      source: `module.exports = 4`,
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