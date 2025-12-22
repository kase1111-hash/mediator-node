// Mock implementation of chokidar for Jest tests
class MockFSWatcher {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    this.listeners[event] = callback;
    return this;
  }

  close() {
    this.listeners = {};
  }
}

module.exports = {
  watch: jest.fn(() => new MockFSWatcher()),
  FSWatcher: MockFSWatcher,
};
