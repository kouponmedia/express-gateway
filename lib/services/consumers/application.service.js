const uuidv4 = require('uuid/v4');
const { validate } = require('../../../lib/schemas');
const applicationDao = require('./application.dao.js');
const config = require('../../config');
const utils = require('../utils');

const log = require('../../logger').servicesApplication;

const SCHEMA = 'http://express-gateway.io/models/applications.json';

const s = {};

s.insert = function (_app, userId) {
  log.debug(`insert - START`);
  const t = Date.now();
  try {
    return validateAndCreateApp(_app, userId)
      .then((app) => Promise.all([app, applicationDao.insert(app)]))
      .then(function ([app, success]) {
        if (!success) {
          throw new Error('one or more insert operations failed'); // TODO: replace with server error
        }

        app.isActive = app.isActive === 'true';
        return app;
      }).catch(err => {
        throw new Error('Failed to insert application: ' + err.message);
      })
      .then((result) => {
        log.debug(`insert - ${Date.now() - t}ms`);
        return result;
      })
      .catch((error) => {
        log.debug(`insert - ${Date.now() - t}ms`);
        throw error;
      });
  } catch (err) {
    log.debug(`insert - ${Date.now() - t}ms`);
    return Promise.reject(err);
  }
};

s.get = function (id) {
  log.debug(`get - START`);
  const t = Date.now();
  return applicationDao.get(id)
    .then(app => {
      if (!app) {
        return false;
      }

      app.isActive = (app.isActive === 'true');
      return app;
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

s.find = function (appName) {
  log.debug(`find - START`);
  const t = Date.now();
  if (!appName || !typeof appName === 'string') {
    log.debug(`find - ${Date.now() - t}ms`);
    return Promise.reject(new Error('invalid appName')); // TODO: replace with validation error
  }

  return applicationDao
    .find(appName)
    .then(app => {
      return app ? this.get(app) : false;
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

s.findAll = function (query) {
  log.debug(`findAll - START`);
  const t = Date.now();
  return applicationDao.findAll(query).then(data => {
    data.apps = data.apps || [];
    data.apps.forEach(a => { a.isActive = a.isActive === 'true'; });
    return data;
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

s.findByNameOrId = function (value) {
  log.debug(`findByNameOrId - START`);
  const t = Date.now();
  return s
    .get(value)
    .then((application) => {
      if (application) {
        return application;
      }

      return s.find(value);
    })
    .then((result) => {
      log.debug(`findByNameOrId - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`findByNameOrId - ${Date.now() - t}ms`);
      throw error;
    });
};

s.getAll = function (userId) {
  log.debug(`getAll - START`);
  const t = Date.now();
  return applicationDao.getAll(userId)
    .then(apps => {
      return apps.map(app => {
        app.isActive = app.isActive === 'true';
        return app;
      });
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

s.remove = function (id) {
  log.debug(`remove - START`);
  const t = Date.now();
  return this.get(id) // make sure app exists
    .then(app => {
      if (!app) {
        return Promise.reject(new Error('app not found, failed to remove'));
      }
      return applicationDao.remove(app);
    })
    .then(function (removed) {
      return removed ? true : Promise.reject(new Error('failed to remove app')); // TODO: replace with server error
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

s.deactivate = function (id) {
  log.debug(`deactivate - START`);
  const t = Date.now();
  return this.get(id) // make sure app exists
    .then(function () {
      return applicationDao.deactivate(id);
    })
    .then(() => true)
    .catch(() => Promise.reject(new Error('failed to deactivate application')))
    .then((result) => {
      log.debug(`deactivate - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`deactivate - ${Date.now() - t}ms`);
      throw error;
    });
};

s.deactivateAll = function (userId) {
  log.debug(`deactivateAll - START`);
  const t = Date.now();
  return applicationDao.deactivateAll(userId)
    .then(() => true)
    .catch(() => Promise.reject(new Error('failed to deactivate all applications')))
    .then((result) => {
      log.debug(`deactivateAll - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`deactivateAll - ${Date.now() - t}ms`);
      throw error;
    });
};

s.activate = function (id) {
  log.debug(`activate - START`);
  const t = Date.now();
  return this.get(id) // make sure app exists
    .then(function () {
      return applicationDao.activate(id);
    })
    .then(() => true)
    .catch(() => Promise.reject(new Error('failed to activate user')))
    .then((result) => {
      log.debug(`activate - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`activate - ${Date.now() - t}ms`);
      throw error;
    });
};

s.removeAll = function (userId) {
  log.debug(`removeAll - START`);
  const t = Date.now();
  return applicationDao.removeAll(userId)
    .then(removed => {
      return removed ? true : Promise.reject(new Error('failed to remove all apps')); // TODO: replace with server error
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

s.update = function (id, applicationProperties) {
  log.debug(`update - START`);
  const t = Date.now();
  const updatedAppProperties = {};

  if (!applicationProperties || !id) {
    log.debug(`update - ${Date.now() - t}ms`);
    return Promise.reject(new Error('invalid properties')); // TODO: replace with validation error
  }

  return this.get(id) // validate app exists
    .then(function () {
      if (!Object.keys(applicationProperties).every(key => typeof key === 'string' && config.models.applications.properties[key])) {
        return Promise.reject(new Error('one or more properties is invalid')); // TODO: replace with validation error
      }

      for (const prop in applicationProperties) {
        if (config.models.applications.properties[prop].isMutable !== false) {
          updatedAppProperties[prop] = applicationProperties[prop];
        } else return Promise.reject(new Error('invalid property ' + prop)); // TODO: replace with validation error
      }

      utils.appendUpdatedAt(updatedAppProperties);
      return applicationDao.update(id, updatedAppProperties);
    })
    .then(function (updated) {
      return updated ? true : Promise.reject(new Error('app update failed')); // TODO: replace with server error
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

function validateAndCreateApp (appProperties, userId) {
  if (!appProperties || !userId) {
    throw new Error('Failed to insert application: invalid application properties'); // TODO: replace with validation error
  }

  const result = validate(SCHEMA, appProperties);
  if (!result.isValid) {
    throw new Error(result.error);
  }

  const userService = require('../consumers/user.service');
  return userService.get(userId)
    .then((user) => {
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      if (!Object.keys(appProperties).every(key => (typeof key === 'string' && !!config.models.applications.properties[key]))) {
        throw new Error('Failed to insert application: one or more property is invalid'); // TODO: replace with validation error
      }

      const baseAppProps = { isActive: 'true', id: uuidv4(), userId };

      const app = Object.assign(baseAppProps, appProperties);

      utils.appendCreatedAt(app);
      utils.appendUpdatedAt(app);

      return app;
    });
}

module.exports = s;
