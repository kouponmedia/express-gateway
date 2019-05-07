const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const config = require('../config');

const log = require('../logger').utils;

function appendCreatedAt (obj) {
  Object.assign(obj, {
    createdAt: (new Date()).toString()
  });
}

function appendUpdatedAt (obj) {
  Object.assign(obj, {
    updatedAt: (new Date()).toString()
  });
}

function encrypt (text) {
  log.debug(`encrypt - START`);
  const t = Date.now();
  const { algorithm, cipherKey } = config.systemConfig.crypto;
  const cipher = crypto.createCipher(algorithm, cipherKey);
  const result = cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
  log.debug(`encrypt - ${Date.now() - t}`);
  return result;
}

function decrypt (password) {
  log.debug(`decrypt - START`);
  const t = Date.now();
  const { algorithm, cipherKey } = config.systemConfig.crypto;
  const decipher = crypto.createDecipher(algorithm, cipherKey);
  const result = decipher.update(password, 'hex', 'utf8') + decipher.final('utf8');
  log.debug(`decrypt - ${Date.now() - t}`);
  return result;
}

function compareSaltAndHashed (password, hash) {
  log.debug(`compareSaltAndHashed - START`);
  const t = Date.now();
  const result = (!password || !hash) ? null : bcrypt.compare(password, hash);
  log.debug(`compareSaltAndHashed - ${Date.now() - t}`);
  return result;
}

function saltAndHash (password) {
  log.debug(`saltAndHash - START`);
  const t = Date.now();
  if (!password || typeof password !== 'string') {
    log.debug(`saltAndHash - ${Date.now() - t}`);
    return Promise.reject(new Error('invalid arguments'));
  }

  return bcrypt
    .genSalt(config.systemConfig.crypto.saltRounds)
    .then((salt) => bcrypt.hash(password, salt))
    .then((result) => {
      log.debug(`saltAndHash - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`saltAndHash - ${Date.now() - t}`);
      throw error;
    });
}

module.exports = {
  appendCreatedAt,
  appendUpdatedAt,
  encrypt,
  decrypt,
  compareSaltAndHashed,
  saltAndHash
};
