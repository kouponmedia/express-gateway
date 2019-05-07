const jwt = require('jsonwebtoken');
const fs = require('fs');
const uuidv4 = require('uuid/v4');

const tokenDao = require('./token.dao.js');
const utils = require('../utils');
const config = require('../../config');

const log = require('../../logger').services;

function getSecret () {
  if (!this._secret) {
    this._secret = config.systemConfig.accessTokens.secretOrPrivateKeyFile
      ? fs.readFileSync(config.systemConfig.accessTokens.secretOrPrivateKeyFile)
      : config.systemConfig.accessTokens.secretOrPrivateKey;
  }
  return this._secret;
}

const s = {};

s.save = function (tokenObj, options = {}) {
  log.debug(`save - START`);
  const t = Date.now();
  let rt;

  if (!tokenObj.consumerId) {
    log.debug(`save - ${Date.now() - t}`);
    return Promise.reject(new Error('invalid token args'));
  }

  if (options.refreshTokenOnly) {
    const rt = createInternalToken(tokenObj, newUuid(), newUuid(), 'refresh_token');

    return tokenDao.save(rt, { type: 'refresh_token' })
      .then(() => {
        return { refresh_token: formExternalToken(rt) };
      })
      .then((result) => {
        log.debug(`save - ${Date.now() - t}`);
        return result;
      })
      .catch((error) => {
        log.debug(`save - ${Date.now() - t}`);
        throw error;
      });
  }

  const at = createInternalToken(tokenObj, newUuid(), newUuid(), 'access_token');
  const tokenSavePromises = [tokenDao.save(at)];

  if (options.includeRefreshToken) {
    rt = createInternalToken(tokenObj, newUuid(), newUuid(), 'refresh_token');
    tokenSavePromises.push(tokenDao.save(rt, { type: 'refresh_token' }));
  }

  return Promise.all(tokenSavePromises)
    .then(() => {
      return {
        access_token: formExternalToken(at),
        refresh_token: formExternalToken(rt)
      };
    })
    .then((result) => {
      log.debug(`save - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`save - ${Date.now() - t}`);
      throw error;
    });
};

s.findOrSave = function (tokenObj, options = {}) {
  log.debug(`findOrSave - START`);
  const t = Date.now();
  return this.find(tokenObj, options)
    .then(tokens => {
      if (tokens.access_token) {
        if (options.includeRefreshToken && !tokens.refresh_token) {
          return this.save(tokenObj, { refreshTokenOnly: true })
            .then(rt => {
              tokens.refresh_token = rt.refresh_token;
              return tokens;
            });
        } else return tokens;
      }

      if (tokens.refresh_token) {
        return this.save(tokenObj)
          .then(at => {
            tokens.access_token = at.access_token;
            return tokens;
          });
      }

      return this.save(tokenObj, options);
    })
    .then((result) => {
      log.debug(`findOrSave - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`findOrSave - ${Date.now() - t}`);
      throw error;
    });
};

s.find = function (tokenObj, options = {}) {
  log.debug(`find - START`);
  const t = Date.now();
  const tokenQueryCriteria = Object.assign({}, tokenObj);

  if (tokenQueryCriteria.scopes && Array.isArray(tokenQueryCriteria.scopes)) {
    tokenQueryCriteria.scopes = JSON.stringify(tokenQueryCriteria.scopes.sort());
  }

  const findQueries = [tokenDao.find(tokenQueryCriteria)];

  if (options.includeRefreshToken) {
    findQueries.push(tokenDao.find(tokenQueryCriteria, { type: 'refresh_token' }));
  }

  return Promise.all(findQueries)
    .then(([accessToken, refreshToken]) => {
      return {
        access_token: formExternalToken(accessToken),
        refresh_token: formExternalToken(refreshToken)
      };
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

s.get = function (_token, options = {}) {
  log.debug(`get - START`);
  const t = Date.now();
  const tokenId = _token.split('|')[0];

  return tokenDao.get(tokenId, options)
    .then(token => {
      if (!token) {
        return null;
      }

      if (token.scopes) {
        token.scopes = JSON.parse(token.scopes);
      }

      token.tokenDecrypted = utils.decrypt(token.tokenEncrypted);
      delete token.tokenEncrypted;

      return token;
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

s.getTokenObject = function (refreshToken) {
  log.debug(`getTokenObject - START`);
  const t = Date.now();
  return this.get(refreshToken, { type: 'refresh_token' })
    .then(rtObj => {
      if (!rtObj) {
        return null;
      }

      const tokenObj = Object.assign({}, rtObj);
      delete tokenObj.createdAt;
      delete tokenObj.updatedAt;
      delete tokenObj.expiresAt;
      delete tokenObj.tokenDecrypted;
      delete tokenObj.id;

      return tokenObj;
    })
    .then((result) => {
      log.debug(`getTokenObject - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`getTokenObject - ${Date.now() - t}`);
      throw error;
    });
};

s.getTokensByConsumer = function (id, options) {
  log.debug(`getTokensByConsumer - START`);
  const t = Date.now();
  return tokenDao.getTokensByConsumer(id, options)
    .then((result) => {
      log.debug(`getTokensByConsumer - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`getTokensByConsumer - ${Date.now() - t}`);
      throw error;
    });
};

s.revoke = function (accessToken) {
  log.debug(`revoke - START`);
  const t = Date.now();
  return this.get(accessToken).then(token => {
    if (!token) {
      throw new Error('Token not found ' + token);
    }

    return tokenDao.revoke(token);
  })
    .then((result) => {
      log.debug(`revoke - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`revoke - ${Date.now() - t}`);
      throw error;
    });
};

s.createJWT = function (payload) {
  log.debug(`createJWT - START`);
  const t = Date.now();
  return new Promise((resolve, reject) => {
    jwt.sign(payload, getSecret(), {
      issuer: config.systemConfig.accessTokens.issuer,
      audience: config.systemConfig.accessTokens.audience,
      expiresIn: config.systemConfig.accessTokens.timeToExpiry,
      subject: config.systemConfig.accessTokens.subject,
      algorithm: config.systemConfig.accessTokens.algorithm
    }, (err, jwt) => {
      if (err) { return reject(err); }
      return resolve(jwt);
    });
  })
    .then((result) => {
      log.debug(`createJWT - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`createJWT - ${Date.now() - t}`);
      throw error;
    });
};

const createInternalToken = (criteria, id, token, type) => {
  let timeToExpiry;

  if (type === 'access_token') {
    timeToExpiry = config.systemConfig.accessTokens.timeToExpiry;
  } else timeToExpiry = config.systemConfig.refreshTokens.timeToExpiry;

  const internalTokenObj = Object.assign({
    id,
    tokenEncrypted: utils.encrypt(token),
    expiresAt: Date.now() + timeToExpiry
  }, criteria);

  if (internalTokenObj.scopes && Array.isArray(internalTokenObj.scopes)) {
    internalTokenObj.scopes = JSON.stringify(internalTokenObj.scopes.sort());
  }

  utils.appendCreatedAt(internalTokenObj);
  return internalTokenObj;
};

const formExternalToken = (tokenObj) => {
  if (!tokenObj) return null;
  return tokenObj.id.concat('|', utils.decrypt(tokenObj.tokenEncrypted));
};

const newUuid = () => {
  return uuidv4().replace(new RegExp('-', 'g'), '');
};

module.exports = s;
