const plugin = require('./plugin')
const { groupByFactor } = require('./factor')
const { groupBySize } = require('./size')

module.exports = {
  plugin,
  groupByFactor,
  groupBySize
}
