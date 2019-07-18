const db = require('../../db');
const config = require('../../config');

const log = require('../../logger').dbApplication;

const dao = {};

const appNamespace = 'application';
const appnameNamespace = 'application-name';
const userAppsNamespace = 'user-applications';

// key for the app hash table
const appHashKey = (value) => `${config.systemConfig.db.redis.namespace}-${appNamespace}:${value}`;

// key for the user-applications hash table
const userAppsHashKey = (value) => `${config.systemConfig.db.redis.namespace}-${userAppsNamespace}:${value}`;

// key for application name-id hash table
const appNameSetKey = (value) => `${config.systemConfig.db.redis.namespace}-${appnameNamespace}:${value}`;

dao.insert = function (app) {
  log.debug(`insert - START`);
  const t = Date.now();
  const addApp = () => {
    return db
      .multi()
      .hmset(appHashKey(app.id), app)
      .sadd(userAppsHashKey(app.userId), app.id)
      .sadd(appNameSetKey(app.name), app.id)
      .exec()
      .then(res => res.every(val => val));
  };

  return dao.find(app.name).then(appId => {
    if (appId) {
      return dao.get(appId).then((possibleApp) => {
        if (possibleApp.userId === app.userId) {
          throw new Error(`${app.userId} has already another application bound with ${app.name} as name`);
        }

        return addApp();
      });
    }

    return addApp();
  })
    .then((result) => {
      log.debug(`insert - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`insert - ${Date.now() - t}ms`);
      throw error;
    });
};

dao.update = function (id, props) {
  log.debug(`update - START`);
  const t = Date.now();
  // key for the app hash table
  const hashKey = appHashKey(id);

  return db
    .hmset(hashKey, props)
    .then(function (res) {
      return !!res;
    })
    .then((result) => {
      log.debug(`update - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`update - ${Date.now() - t}ms`);
      throw error;
    });
};

dao.findAll = function ({ start = 0, count = '100' } = {}) {
  log.debug(`findAll - START`);
  const t = Date.now();
  const key = appHashKey('');
  return db.scan(start, 'MATCH', `${key}*`, 'COUNT', count).then(resp => {
    const nextKey = parseInt(resp[0], 10);
    const appKeys = resp[1];
    if (!appKeys || appKeys.length === 0) return Promise.resolve({ apps: [], nextKey: 0 });
    const promises = appKeys.map(key => db.hgetall(key));
    return Promise.all(promises).then(apps => {
      return {
        apps,
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

dao.find = function (appName) {
  log.debug(`find - START`);
  const t = Date.now();
  return db.smembers(appNameSetKey(appName))
    .then(function (Ids) {
      if (Ids && Ids.length !== 0) {
        if (Ids.length === 1) {
          return Ids[0];
        }
        throw new Error(`Multiple applications with ${appName} have been found: ${Ids.join(',')}.
                         Please search for it using its ID instead`);
      } else {
        return false;
      }
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

dao.get = function (id) {
  log.debug(`get - START`);
  const t = Date.now();
  return db.hgetall(appHashKey(id))
    .then(function (app) {
      if (!app || !Object.keys(app).length) {
        return false;
      } else return app;
    })
    .then((result) => {
      log.debug(`get - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`get - ${Date.now() - t}ms`);
      throw error;
    });
};

dao.getAll = function (userId) {
  log.debug(`getAll - START`);
  const t = Date.now();
  return this.getAllAppIdsByUser(userId)
    .then(appIds => {
      return Promise.all(appIds.map(this.get))
        .then(apps => apps.filter(app => app !== false));
    })
    .then((result) => {
      log.debug(`getAll - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`getAll - ${Date.now() - t}ms`);
      throw error;
    });
};

dao.getAllAppIdsByUser = function (userId) {
  log.debug(`getAllAppIdsByUser - START`);
  const t = Date.now();
  return db.smembers(userAppsHashKey(userId))
    .then((result) => {
      log.debug(`getAllAppIdsByUser - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`getAllAppIdsByUser - ${Date.now() - t}ms`);
      throw error;
    });
};

dao.activate = function (id) {
  log.debug(`activate - START`);
  const t = Date.now();
  return db.hmset(appHashKey(id), { 'isActive': 'true', 'updatedAt': String(new Date()) })
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
  return db.hmset(appHashKey(id), { 'isActive': 'false', 'updatedAt': String(new Date()) })
    .then((result) => {
      log.debug(`deactivate - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`deactivate - ${Date.now() - t}ms`);
      throw error;
    });
};

dao.deactivateAll = function (userId) {
  log.debug(`deactivateAll - START`);
  const t = Date.now();
  return this.getAllAppIdsByUser(userId)
    .then(appIds => {
      const deactivateAppPromises = appIds.map(appId => this.deactivate(appId));
      return Promise.all(deactivateAppPromises);
    })
    .then((result) => {
      log.debug(`deactivateAll - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`deactivateAll - ${Date.now() - t}ms`);
      throw error;
    });
};

dao.remove = function ({ name, id, userId }) {
  log.debug(`remove - START`);
  const t = Date.now();
  return db
    .multi()
    .del(appHashKey(id))
    .srem(userAppsHashKey(userId), id)
    .srem(appNameSetKey(name), id)
    .exec()
    .then(responses => responses.every(res => res))
    .then((result) => {
      log.debug(`remove - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`remove - ${Date.now() - t}ms`);
      throw error;
    });
};

dao.removeAll = function (userId) {
  log.debug(`removeAll - START`);
  const t = Date.now();
  return this.getAllAppIdsByUser(userId)
    .then(appIds => {
      const removeAppPromises = appIds.map(appId => {
        return this.get(appId).then((app) => this.remove(app));
      });
      return Promise.all(removeAppPromises)
        .then(responses => responses.every(res => res));
    })
    .then((result) => {
      log.debug(`removeAll - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`removeAll - ${Date.now() - t}ms`);
      throw error;
    });
};

module.exports = dao;
