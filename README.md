# bify-package-factor

Browserify plugin that creates bundles factored at package-level granularity.
The browserify stream output becomes a `vinyl-source-stream`, emitting one `vinyl` file metadata object per bundle.


### use

This will generate three bundles.
One bundle for packages unique to each of the entrypoints, and one common bundle for packages that are used by both.

```js
const bundler = browserify(['entry1.js', 'entry2.js'])
  .plugin('bify-package-factor')

bundler.pipe(gulp.dest('./bundles/'))
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