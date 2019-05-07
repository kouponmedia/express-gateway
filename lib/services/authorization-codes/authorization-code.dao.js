const db = require('../../db');
const config = require('../../config');

const log = require('../../logger').db;

const dao = {};

const authCodeNamespace = 'auth-code';

dao.save = function (code) {
  log.debug(`save - START`);
  const t = Date.now();
  // key for the code hash table
  const redisCodeKey = config.systemConfig.db.redis.namespace.concat('-', authCodeNamespace).concat(':', code.id);
  return db.hmset(redisCodeKey, code)
    .then((result) => {
      log.debug(`save - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`save - ${Date.now() - t}`);
      throw error;
    });
};

dao.find = function (criteria) {
  log.debug(`find - START`);
  const t = Date.now();
  return db.hgetall(config.systemConfig.db.redis.namespace.concat('-', authCodeNamespace).concat(':', criteria.id))
    .then((code) => {
      if (!code || !code.expiresAt) {
        return null;
      }
      code.expiresAt = parseInt(code.expiresAt);
      if (code.expiresAt <= Date.now()) {
        return this.remove(criteria.id)
          .return(null);
      }

      const isEqual = Object.keys(criteria).every((key) => criteria[key] === code[key]);
      return isEqual ? code : null;
    })
    .then((result) => {
      log.debug(`find - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`find - ${Date.now() - t}`);
      throw error;
    });
};

dao.get = function (id) {
  log.debug(`get - START`);
  const t = Date.now();
  return db.hgetall(config.systemConfig.db.redis.namespace.concat('-', authCodeNamespace).concat(':', id))
    .then((result) => {
      log.debug(`get - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`get - ${Date.now() - t}`);
      throw error;
    });
};

dao.remove = function (id) {
  log.debug(`remove - START`);
  const t = Date.now();
  return db.del(config.systemConfig.db.redis.namespace.concat('-', authCodeNamespace).concat(':', id))
    .then((result) => {
      log.debug(`remove - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`remove - ${Date.now() - t}`);
      throw error;
    });
};

module.exports = dao;
