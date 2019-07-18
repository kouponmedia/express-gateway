const db = require('../../db');
const config = require('../../config');

const log = require('../../logger').dbUser;

const dao = {};
const userNamespace = 'user';
const usernameNamespace = 'username';

dao.insert = function (user) {
  log.debug(`insert - START`);
  const t = Date.now();
  // key for the user hash table
  const redisUserKey = config.systemConfig.db.redis.namespace.concat('-', userNamespace).concat(':', user.id);

  // name for the user's username set
  const redisUsernameSetKey = config.systemConfig.db.redis.namespace.concat('-', usernameNamespace).concat(':', user.username);
  return db
    .multi()
    .hmset(redisUserKey, user)
    .sadd(redisUsernameSetKey, user.id)
    .exec()
    .then(res => res.every(val => val))
    .then((result) => {
      log.debug(`insert - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`insert - ${Date.now() - t}ms`);
      throw error;
    });
};

dao.getUserById = function (userId) {
  log.debug(`getUserById - START`);
  const t = Date.now();
  return db.hgetall(config.systemConfig.db.redis.namespace.concat('-', userNamespace).concat(':', userId))
    .then(function (user) {
      if (!user || !Object.keys(user).length) {
        return false;
      }
      return user;
    })
    .then((result) => {
      log.debug(`getUserById - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`getUserById - ${Date.now() - t}ms`);
      throw error;
    });
};

dao.findAll = function ({ start = 0, count = '100' } = {}) {
  log.debug(`findAll - START`);
  const t = Date.now();
  const key = config.systemConfig.db.redis.namespace.concat('-', userNamespace).concat(':');
  return db.scan(start, 'MATCH', `${key}*`, 'COUNT', count).then(resp => {
    const nextKey = parseInt(resp[0], 10);
    const userKeys = resp[1];
    if (!userKeys || userKeys.length === 0) return Promise.resolve({ users: [], nextKey: 0 });
    const promises = userKeys.map(key => db.hgetall(key));
    return Promise.all(promises).then(users => {
      return {
        users,
        nextKey
      };
    });
  })
    .then((result) => {
      log.debug(`findAll - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`findAll - ${Date.now() - t}ms`);
      throw error;
    });
};

dao.find = function (username) {
  log.debug(`find - START`);
  const t = Date.now();
  return db.smembers(config.systemConfig.db.redis.namespace.concat('-', usernameNamespace).concat(':', username))
    .then(function (Ids) {
      if (Ids && Ids.length !== 0) {
        return Ids[0];
      } else return false;
    })
    .then((result) => {
      log.debug(`find - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`find - ${Date.now() - t}ms`);
      throw error;
    });
};

dao.update = function (userId, props) {
  log.debug(`update - START`);
  const t = Date.now();
  // key for the user in redis
  const redisUserKey = config.systemConfig.db.redis.namespace.concat('-', userNamespace).concat(':', userId);
  return db
    .hmset(redisUserKey, props)
    .then(res => !!res)
    .then((result) => {
      log.debug(`update - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`update - ${Date.now() - t}ms`);
      throw error;
    });
};

dao.activate = function (id) {
  log.debug(`activate - START`);
  const t = Date.now();
  return db.hmset(config.systemConfig.db.redis.namespace.concat('-', userNamespace).concat(':', id), 'isActive', 'true', 'updatedAt', String(new Date()))
    .then((result) => {
      log.debug(`activate - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`activate - ${Date.now() - t}ms`);
      throw error;
    });
};

dao.deactivate = function (id) {
  log.debug(`deactivate - START`);
  const t = Date.now();
  return db.hmset(config.systemConfig.db.redis.namespace.concat('-', userNamespace).concat(':', id), 'isActive', 'false', 'updatedAt', String(new Date()))
    .then((result) => {
      log.debug(`deactivate - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`deactivate - ${Date.now() - t}ms`);
      throw error;
    });
};

dao.remove = function (userId) {
  log.debug(`remove - START`);
  const t = Date.now();
  return this.getUserById(userId)
    .then(function (user) {
      if (!user) {
        return false;
      }
      return db
        .multi()
        .del(config.systemConfig.db.redis.namespace.concat('-', userNamespace).concat(':', userId))
        .srem(config.systemConfig.db.redis.namespace.concat('-', usernameNamespace).concat(':', user.username), userId)
        .exec()
        .then(replies => replies.every(res => res));
    })
    .then((result) => {
      log.debug(`remove - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`remove - ${Date.now() - t}ms`);
      throw error;
    });
};

module.exports = dao;
