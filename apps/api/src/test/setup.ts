// Mock global fetch
global.fetch = jest.fn();

// Mock console methods to keep test output clean
global.console.log = jest.fn();
global.console.warn = jest.fn();
global.console.error = jest.fn();
