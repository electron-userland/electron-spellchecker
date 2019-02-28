const pify = require('pify');

module.exports = ['fs', 'mkdirp'].reduce((acc, x) => {
  acc[x] = pify(require(x));
  return acc;
}, {});
