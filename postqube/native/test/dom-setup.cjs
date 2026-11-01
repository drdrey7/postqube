const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
for (const name of ['window', 'document', 'Node', 'NodeFilter', 'HTMLElement', 'Range']) global[name] = name === 'window' ? dom.window : dom.window[name];
afterAll(() => dom.window.close());
