'use strict';

const metatests = require('metatests');
const parser = require('../lib/parser');

metatests.case('parser', { parser }, {
  'parser.parse': [
    [
      Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]),
      { id: 1, length: 0, payload: Buffer.from([]) },
    ],
    [
      Buffer.from([1, 0, 0, 0, 5, 0, 0, 0, 1, 2, 3, 4, 5]),
      { id: 1, length: 5, payload: Buffer.from([1, 2, 3, 4, 5]) },
    ],
    [
      Buffer.from([1, 0, 0, 0, 5, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7]),
      { id: 1, length: 5, payload: Buffer.from([1, 2, 3, 4, 5]) },
    ],
  ],
  'parser.packet': [
    [
      { id: 1, length: 0, payload: Buffer.from([]) },
      result => result.equals(Buffer.from([1, 0, 0, 0, 0, 0, 0, 0])),
    ],
    [
      { id: 1, length: 5, payload: Buffer.from([1, 2, 3, 4, 5]) },
      result =>
        result.equals(Buffer.from([1, 0, 0, 0, 5, 0, 0, 0, 1, 2, 3, 4, 5])),
    ],
    [
      { id: 1, length: 5, payload: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]) },
      result =>
        result.equals(Buffer.from([1, 0, 0, 0, 5, 0, 0, 0, 1, 2, 3, 4, 5])),
    ],
  ],
});
