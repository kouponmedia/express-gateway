const uuidv4 = require('uuid/v4');
const { validate } = require('../../../lib/schemas');
const userDao = require('./user.dao.js');
const applicationService = require('./application.service.js');
const credentialService = require('../credentials/credential.service.js');
const config = require('../../config');
const utils = require('../utils');

const log = require('../../logger').services;

const SCHEMA = 'http://express-gateway.io/models/users.json';

const s = {};

s.insert = function (user) {
  log.debug(`insert - START`);
  const t = Date.now();
  return validateAndCreateUser(user)
    .then(function (newUser) {
      return userDao.insert(newUser)
        .then(function (success) {
          if (success) {
            newUser.isActive = newUser.isActive === 'true';
            return newUser;
          } else return Promise.reject(new Error('insert user failed')); // TODO: replace with server error
        });
    })
    .then((result) => {
      log.debug(`insert - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`insert - ${Date.now() - t}`);
      throw error;
    });
};

s.get = function (userId, options) {
  log.debug(`get - START`);
  const t = Date.now();
  if (!userId || !typeof userId === 'string') {
    log.debug(`get - ${Date.now() - t}`);
    return false;
  }

  return userDao
    .getUserById(userId)
    .then(function (user) {
      if (!user) {
        return false;
      }

      user.isActive = user.isActive === 'true';
      if (!options || !options.includePassword) {
        delete user.password;
      }
      return user;
    })
    .then((result) => {
      log.debug(`get - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`get - ${Date.now() - t}`);
      throw error;
    });
};

s.findAll = function (query) {
  log.debug(`findAll - START`);
  const t = Date.now();
  return userDao.findAll(query).then(data => {
    data.users = data.users || [];
    data.users.forEach(u => { u.isActive = u.isActive === 'true'; });
    return data;
  })
    .then((result) => {
      log.debug(`findAll - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`findAll - ${Date.now() - t}`);
      throw error;
    });
};

s.find = function (username, options) {
  log.debug(`find - START`);
  const t = Date.now();
  if (!username || !typeof username === 'string') {
    log.debug(`find - ${Date.now() - t}`);
    return Promise.reject(new Error('invalid username')); // TODO: replace with validation error
  }

  return userDao
    .find(username)
    .then(userId => {
      return userId ? this.get(userId, options) : false;
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

s.findByUsernameOrId = function (value) {
  log.debug(`findByUsernameOrId - START`);
  const t = Date.now();
  return s
    .find(value)
    .then(user => {
      if (user) {
        return user;
      }
      return s.get(value);
    })
    .then((result) => {
      log.debug(`findByUsernameOrId - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`findByUsernameOrId - ${Date.now() - t}`);
      throw error;
    });
};

s.update = function (userId, _props) {
  log.debug(`update - START`);
  const t = Date.now();
  if (!_props || !userId) {
    log.debug(`update - ${Date.now() - t}`);
    return Promise.reject(new Error('invalid user id')); // TODO: replace with validation error
  }
  return this.get(userId) // validate user exists
    .then(user => {
      if (!user) { return false; } // user does not exist

      delete _props.username;
      return validateUpdateToUserProperties(_props)
        .then(function (updatedUserProperties) {
          if (updatedUserProperties) {
            utils.appendUpdatedAt(updatedUserProperties);
            return userDao.update(userId, updatedUserProperties);
          } else return true; // there are no properties to update
        })
        .then(updated => {
          return updated ? true : Promise.reject(new Error('user update failed')); // TODO: replace with server error
        });
    })
    .then((result) => {
      log.debug(`update - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`update - ${Date.now() - t}`);
      throw error;
    });
};

s.deactivate = function (id) {
  log.debug(`deactivate - START`);
  const t = Date.now();
  return this.get(id) // make sure user exists
    .then(function () {
      return userDao.deactivate(id)
        .then(() => applicationService.deactivateAll(id)); // Cascade deactivate all applications associated with the user
    })
    .then(() => true)
    .catch(() => Promise.reject(new Error('failed to deactivate user')))
    .then((result) => {
      log.debug(`deactivate - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`deactivate - ${Date.now() - t}`);
      throw error;
    });
};

s.activate = function (id) {
  log.debug(`activate - START`);
  const t = Date.now();
  return this.get(id) // make sure user exists
    .then(function () {
      return userDao.activate(id);
    })
    .then(() => true)
    .catch(() => Promise.reject(new Error('failed to deactivate user')))
    .then((result) => {
      log.debug(`activate - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`activate - ${Date.now() - t}`);
      throw error;
    });
};

s.remove = function (userId) {
  log.debug(`remove - START`);
  const t = Date.now();
  return this.get(userId) // validate user exists
    .then(user => Promise.all([user, !user ? false : userDao.remove(userId)]))
    .then(([user, userDeleted]) => {
      if (!user) {
        return false;
      } else if (user && !userDeleted) {
        throw new Error('user delete failed');
      } else {
        return Promise.all([
          applicationService.removeAll(userId), // Cascade delete all apps associated with user
          credentialService.removeAllCredentials(user.id)
        ]).then(() => true);
      }
    })
    .then((result) => {
      log.debug(`remove - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`remove - ${Date.now() - t}`);
      throw error;
    });
};

function validateAndCreateUser (_user) {
  let user;

  const result = validate(SCHEMA, _user);
  if (!result.isValid) {
    return Promise.reject(new Error(result.error));
  }

  return s.find(_user.username) // Ensure username is unique
    .then(function (exists) {
      if (exists) {
        throw new Error('username already exists');
      }
      return _user;
    })
    .then(function (newUser) {
      const baseUserProps = { isActive: 'true', username: _user.username, id: uuidv4() };
      if (newUser) {
        user = Object.assign(baseUserProps, newUser);
      } else user = baseUserProps;

      utils.appendCreatedAt(user);
      utils.appendUpdatedAt(user);

      return user;
    });
}

function validateUpdateToUserProperties (userProperties) {
  const updatedUserProperties = {};

  if (!Object.keys(userProperties).every(key => typeof key === 'string' && config.models.users.properties[key])) {
    return Promise.reject(new Error('one or more properties is invalid')); // TODO: replace with validation error
  }

  for (const prop in userProperties) {
    if (config.models.users.properties[prop].isMutable !== false) {
      updatedUserProperties[prop] = userProperties[prop];
    } else return Promise.reject(new Error('one or more properties is immutable')); // TODO: replace with validation error
  }

  return Object.keys(updatedUserProperties).length > 0 ? Promise.resolve(updatedUserProperties) : Promise.resolve(false);
}

module.exports = s;
