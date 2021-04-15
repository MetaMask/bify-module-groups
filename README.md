# bify-module-groups

Browserify tools for splitting bundles into groups of modules

When adding the plugin, the browserify stream has an output of a single `ModuleGroup` object.

The output stream can then be piped into other provided tools to customize the groups to your desire


### usecases


#### bundle size limiting

This will generate three bundles.
One bundle for packages unique to each of the entrypoints, and one common bundle for packages that are used by both.

```js
const browserify = require('browserify')
const browserPack = require('browser-pack')
const { groupForSizeLimit } = require('bify-module-groups/size')
const vfs = require('vinyl-fs')

const bundler = browserify(['entry1.js', 'entry2.js'])
  .plugin('bify-module-groups/plugin')

pump(
  // perform bundle
  bundler.bundle(),
  // split in to module groups
  groupForSizeLimit({ limit: 200 }),
  // handle each module group
  through((moduleGroup, _, cb) => {
    pump(
      moduleGroup.stream,
      browserPack({ raw: true }),
      vfs.dest(`./bundles/${moduleGroup.label}.js`),
    )
  }),
)
```

#### bundle factoring

```js
const browserify = require('browserify')
const browserPack = require('browser-pack')
const { groupByEntry } = require('bify-module-groups/factor')
const vfs = require('vinyl-fs')

const bundler = browserify(['entry1.js', 'entry2.js'])
  .plugin('bify-module-groups/plugin')

pump(
  // perform bundle
  bundler.bundle(),
  // split in to module groups
  groupByEntry(),
  // handle each module group
  through((moduleGroup, _, cb) => {
    pump(
      moduleGroup.stream,
      browserPack({ raw: true, hasExports: true }),
      vfs.dest(`./bundles/${moduleGroup.label}.js`),
    )
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