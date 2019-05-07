const credentials = require('./credentials/credential.service.js');
const users = require('./consumers/user.service.js');
const applications = require('./consumers/application.service.js');
const tokens = require('./tokens/token.service.js');
const utils = require('./utils');
const config = require('../config');

const log = require('../logger').services;

const s = {};

s.authenticateCredential = function (id, password, type) {
  log.debug(`authenticateCredential - START`);
  const t = Date.now();
  if (!id || !password || !type) {
    log.debug(`authenticateCredential - ${Date.now() - t}`);
    return Promise.resolve(false);
  }

  if (type === 'key-auth' || type === 'jwt') {
    return credentials.getCredential(id, type, { includePassword: true })
      .then(credential => {
        if (!credential || !credential.isActive || credential.keySecret !== password) {
          return false;
        }
        return this.validateConsumer(credential.consumerId, { checkUsername: true });
      })
      .then((result) => {
        log.debug(`authenticateCredential - ${Date.now() - t}`);
        return result;
      })
      .catch((error) => {
        log.debug(`authenticateCredential - ${Date.now() - t}`);
        throw error;
      });
  }

  return this.validateConsumer(id, { checkUsername: true })
    .then((consumer) => {
      if (!consumer) {
        return false;
      }
      return Promise.all([consumer, credentials.getCredential(consumer.id, type, { includePassword: true })]);
    }).then((validateResult) => {
      if (!validateResult) {
        return false;
      }

      const [consumer, credential] = validateResult;

      if (!credential || !credential.isActive) {
        return false;
      }

      return Promise.all([
        consumer,
        utils.compareSaltAndHashed(password, credential[config.models.credentials.properties[type].properties.passwordKey.default])
      ]);
    }).then((credentialResult) => {
      if (!credentialResult) {
        return false;
      }
      const [consumer, authenticated] = credentialResult;

      if (!authenticated) {
        return false;
      }

      return consumer;
    })
    .then((result) => {
      log.debug(`validateConsumer - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`validateConsumer - ${Date.now() - t}`);
      throw error;
    });
};

s.authenticateToken = function (token) {
  log.debug(`authenticateToken - START`);
  const t = Date.now();
  let tokenObj;
  const tokenPassword = token.split('|')[1];

  return tokens.get(token)
    .then(_tokenObj => {
      tokenObj = _tokenObj;

      if (!tokenObj) {
        return null;
      }

      return this.validateConsumer(tokenObj.consumerId);
    })
    .then(consumer => {
      if (!consumer || !consumer.isActive) {
        return false;
      } else return tokenObj.tokenDecrypted === tokenPassword ? { token: tokenObj, consumer } : false;
    })
    .then((result) => {
      log.debug(`authenticateToken - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`authenticateToken - ${Date.now() - t}`);
      throw error;
    });
};

s.authorizeToken = function (_token, authType, scopes) {
  log.debug(`authorizeToken - START`);
  const t = Date.now();
  if (!scopes || scopes.length === 0) {
    log.debug(`authorizeToken - ${Date.now() - t}`);
    return Promise.resolve(true);
  }

  scopes = Array.isArray(scopes) ? scopes : [scopes];

  return tokens.get(_token)
    .then(token => {
      if (!token) {
        return false;
      }

      if (scopes && scopes.length && !token.scopes) {
        return false;
      }

      return scopes.every(scope => token.scopes.indexOf(scope) !== -1);
    })
    .then((result) => {
      log.debug(`authorizeToken - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`authorizeToken - ${Date.now() - t}`);
      throw error;
    });
};

s.authorizeCredential = function (id, authType, scopes) {
  log.debug(`authorizeCredential - START`);
  const t = Date.now();
  if (!scopes || !scopes.length) {
    log.debug(`authorizeCredential - ${Date.now() - t}`);
    return Promise.resolve(true);
  }

  return credentials.getCredential(id, authType)
    .then(credential => {
      if (credential) {
        if (!credential.scopes) {
          return false;
        }
        return scopes.every(scope => credential.scopes.indexOf(scope) !== -1);
      }
    })
    .then((result) => {
      log.debug(`authorizeCredential - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`authorizeCredential - ${Date.now() - t}`);
      throw error;
    });
};

s.validateConsumer = function (id, options = {}) {
  log.debug(`validateConsumer - START`);
  const t = Date.now();
  return applications.get(id)
    .then(app => {
      if (app && app.isActive) {
        return createApplicationObject(app);
      }

      return users.get(id)
        .then(_user => {
          if (_user && _user.isActive) {
            return createUserObject(_user);
          }

          if (options.checkUsername) {
            const username = id;
            return users.find(username)
              .then(user => {
                if (user && user.isActive) {
                  return createUserObject(user);
                } else return null;
              });
          }

          return null;
        });
    })
    .then((result) => {
      log.debug(`validateConsumer - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`validateConsumer - ${Date.now() - t}`);
      throw error;
    });
};

function createUserObject (user) {
  return Object.assign({ type: 'user' }, user);
}

function createApplicationObject (app) {
  return Object.assign({ type: 'application' }, app);
}

module.exports = s;
