import pify from 'pify';

module.exports = ['fs', 'mkdirp', 'rimraf'].reduce((acc, x) => {
  acc[x] = pify(require(x));
  return acc;
}, {});
