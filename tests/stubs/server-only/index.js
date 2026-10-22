// Test-only stand-in for the "server-only" marker package.
// Next.js provides the real one when bundling; plain Node cannot resolve
// it. Use via NODE_PATH=tests/stubs when running integration tests.
module.exports = {};
