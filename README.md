# bify-module-groups

Browserify tools for splitting bundles into groups of modules

When adding the plugin, the browserify stream has an output of a single `ModuleGroup` object.

The output stream can then be piped into other provided tools to customize the groups to your desire


### usecases


#### bundle size limiting

This will generate three bundles.
One bundle for packages unique to each of the entrypoints, and one common bundle for packages that are used by both.

```js
const pump = require('pump')
const browserify = require('browserify')
const browserPack = require('browser-pack')
const { groupBySize, createForEachStream } = require('bify-module-groups')
const vfs = require('vinyl-fs')

const bundler = browserify(['entry1.js', 'entry2.js'])
  .plugin('bify-module-groups/plugin')

pump(
  // perform bundle
  bundler.bundle(),
  // split in to module groups
  groupBySize({ sizeLimit: 200 }),
  // handle each module group
  createForEachStream({
    onEach: (moduleGroup) => {
      pump(
        moduleGroup.stream,
        browserPack({ raw: true }),
        vfs.dest(`./bundles/${moduleGroup.label}.js`),
      )
    }
  }),
)
```

#### bundle factoring

```js
const path = require('path')
const pump = require('pump')
const browserify = require('browserify')
const browserPack = require('browser-pack')
const { groupByFactor, createForEachStream } = require('bify-module-groups')
const vfs = require('vinyl-fs')

const bundler = browserify(['./entry1.js', './entry2.js'])
  .plugin('bify-module-groups/plugin')

pump(
  // perform bundle
  bundler.bundle(),
  // split in to module groups
  groupByFactor({
    entryFileToLabel: (entry) => path.parse(entry).name
  }),
  // handle each module group
  createForEachStream({
    onEach: (moduleGroup) => {
      pump(
        moduleGroup.stream,
        browserPack({ raw: true, hasExports: true }),
        vfs.dest(`./bundles/${moduleGroup.label}.js`),
      )
    }
  }),
)
```

You can then import the common bundle as well as your entry-specific bundle.

```html
<title>page one</title>
<script src="./bundles/common.js">
<script src="./bundles/entry1.js">
```

```html
<title>page two</title>
<script src="./bundles/common.js">
<script src="./bundles/entry2.js">
```