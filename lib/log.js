'use strict';

const fs = require('fs');
const { join } = require('path');

const loggingPath = join(__dirname, '../log');

const logger = type => {
  const path = join(loggingPath, type + '.log');
  return message => {
    const data = message + '\n';
    fs.writeFileSync(path, data, { flag: 'a' });
  };
};

module.exports = {
  info: logger('info'),
  error: logger('error'),
  debug: logger('debug'),
};
