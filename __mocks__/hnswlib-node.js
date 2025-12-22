/**
 * Manual Mock for hnswlib-node
 *
 * This is a Jest manual mock that automatically replaces the native hnswlib-node module
 * in all test files. Manual mocks are more reliable for native modules.
 */

class HierarchicalNSW {
  constructor(space, dimensions) {
    this.space = space;
    this.dimensions = dimensions;
    this.points = new Map();
    this.currentLabel = 0;
  }

  initIndex(maxElements, M = 16, efConstruction = 200, randomSeed = 100) {
    this.maxElements = maxElements;
    this.M = M;
    this.efConstruction = efConstruction;
    this.randomSeed = randomSeed;
    this.initialized = true;
  }

  addPoint(vector, label) {
    if (label === undefined) {
      label = this.currentLabel++;
    }
    this.points.set(label, vector);
  }

  searchKnn(queryVector, k, filter = undefined) {
    // Simple mock implementation - return empty results
    // Tests will override this behavior using jest.spyOn or by setting mock return values
    const neighbors = [];
    const distances = [];

    // If there are points, return some mock results
    if (this.points.size > 0) {
      const labels = Array.from(this.points.keys());
      const numResults = Math.min(k, labels.length);

      for (let i = 0; i < numResults; i++) {
        neighbors.push(labels[i]);
        distances.push(Math.random()); // Random distance for mock
      }
    }

    return { neighbors, distances };
  }

  async readIndex(filename, allowReplaceDeleted = false) {
    this.indexFile = filename;
    this.initialized = true;
    // Mock successful read
    return true;
  }

  async writeIndex(filename) {
    this.indexFile = filename;
    // Mock successful write
    return true;
  }

  resizeIndex(newSize) {
    this.maxElements = newSize;
  }

  getCurrentCount() {
    return this.points.size;
  }

  getMaxElements() {
    return this.maxElements || 0;
  }
}

module.exports = {
  HierarchicalNSW
};
