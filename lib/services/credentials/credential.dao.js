const db = require('../../db');
const config = require('../../config');
const logger = require('../../../lib/logger').gateway;
const scopeNamespace = 'scope';
const scopeCredentialsNamespace = 'scope-credentials';
const scopeDbKey = config.systemConfig.db.redis.namespace.concat('-', scopeNamespace);

const log = require('../../logger').db;

const dao = {};

dao.insertScopes = function (_scopes) {
  log.debug(`insertScopes - START`);
  const t = Date.now();
  const scopes = {};
  if (Array.isArray(_scopes)) {
    _scopes.forEach(el => { scopes[el] = 'true'; });
  } else scopes[_scopes] = 'true';

  return db.hmset(scopeDbKey, scopes)
    .then((result) => {
      log.debug(`insertScopes - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`insertScopes - ${Date.now() - t}`);
      throw error;
    });
};

dao.associateCredentialWithScopes = function (id, type, scopes) {
  log.debug(`associateCredentialWithScopes - START`);
  const t = Date.now();
  const credentialKey = buildIdKey(type, id);
  if (!scopes) {
    log.debug(`associateCredentialWithScopes - ${Date.now() - t}`);
    return Promise.resolve(null);
  }

  scopes = Array.isArray(scopes) ? scopes : [scopes];
  const associationPromises = scopes.map(scope => db.hset(buildScopeKey(scope), credentialKey, 'true'));

  return Promise.all(associationPromises)
    .then((result) => {
      log.debug(`associateCredentialWithScopes - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`associateCredentialWithScopes - ${Date.now() - t}`);
      throw error;
    });
};

dao.dissociateCredentialFromScopes = function (id, type, scopes) {
  log.debug(`dissociateCredentialFromScopes - START`);
  const t = Date.now();
  const credentialKey = buildIdKey(type, id);
  scopes = Array.isArray(scopes) ? scopes : [scopes];
  const dissociationPromises = scopes.map(scope => db.hdel(buildScopeKey(scope), credentialKey));

  return Promise.all(dissociationPromises)
    .then((result) => {
      log.debug(`dissociateCredentialFromScopes - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`dissociateCredentialFromScopes - ${Date.now() - t}`);
      throw error;
    });
};

dao.removeScopes = function (scopes) {
  log.debug(`removeScopes - START`);
  const t = Date.now();
  let removeScopesTransaction;
  const getScopeCredentialPromises = [];

  scopes = Array.isArray(scopes) ? scopes : [scopes];

  removeScopesTransaction = db
    .multi()
    .hdel(scopeDbKey, scopes);

  // Get the list of ids with scopes to be removed, and remove scope-ids association
  scopes.forEach(scope => {
    getScopeCredentialPromises.push(db.hgetall(buildScopeKey(scope)));
    removeScopesTransaction = removeScopesTransaction.del(buildScopeKey(scope));
  });

  return Promise.all(getScopeCredentialPromises)
    .then(idObjs => {
      const getCredentialPromises = [];
      const credentialIdToScopes = {};

      scopes.forEach((scope, index) => {
        const ids = idObjs[index];

        for (const id in ids) {
          if (credentialIdToScopes[id]) {
            credentialIdToScopes[id].push(scope);
          } else credentialIdToScopes[id] = [scope];
        }
      });

      // Get dissociation promises for the id-scopes combination and promises to update credentials to remove scope
      for (const credentialId in credentialIdToScopes) {
        getCredentialPromises.push(db.hgetall(credentialId));
      }

      return Promise.all(getCredentialPromises)
        .then(credentialObjs => {
          let credentialScopes, newScopes;
          const credentialIds = Object.keys(credentialIdToScopes);

          credentialObjs.forEach((credentialObj, index) => {
            const credentialId = credentialIds[index];

            if (credentialObj && credentialObj.scopes) {
              credentialScopes = JSON.parse(credentialObj.scopes);
              newScopes = credentialScopes.filter(scope => scopes.indexOf(scope) === -1);
              removeScopesTransaction = removeScopesTransaction.hmset(credentialId, { scopes: JSON.stringify(newScopes) });
            }
          });

          return removeScopesTransaction.exec()
            .then(res => res[0]); // .del may yield 0 if a scope wasn't assigned to any credential
        });
    })
    .then((result) => {
      log.debug(`removeScopes - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`removeScopes - ${Date.now() - t}`);
      throw error;
    });
};

dao.existsScope = function (scope) {
  log.debug(`existsScope - START`);
  const t = Date.now();
  return db.hget(scopeDbKey, scope)
    .then(res => !!res)
    .then((result) => {
      log.debug(`existsScope - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`existsScope - ${Date.now() - t}`);
      throw error;
    });
};

dao.getAllScopes = function () {
  log.debug(`getAllScopes - START`);
  const t = Date.now();
  return db.hgetall(scopeDbKey)
    .then(res => {
      const scopes = Object.keys(res || {});
      return scopes.length ? scopes : null;
    })
    .then((result) => {
      log.debug(`getAllScopes - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`getAllScopes - ${Date.now() - t}`);
      throw error;
    });
};

dao.insertCredential = function (id, type, credentialObj) {
  log.debug(`insertCredential - START`);
  const t = Date.now();
  if (!credentialObj) {
    log.debug(`insertCredential - ${Date.now() - t}`);
    return Promise.resolve(null);
  }
  const key = buildIdKey(type, id);
  if (type === 'key-auth' || type === 'jwt') {
    if (credentialObj.keyId) credentialObj.id = credentialObj.keyId;
    return Promise.all([
      // build relation consumerId -> [key1, key2]
      db.sadd(buildIdKey(type, credentialObj.consumerId), id),
      // store key-auth keyid -> credentialObj
      db.hmset(key, credentialObj)
    ])
      .then((result) => {
        log.debug(`insertCredential - ${Date.now() - t}`);
        return result;
      })
      .catch((error) => {
        log.debug(`insertCredential - ${Date.now() - t}`);
        throw error;
      });
  }
  return db.hmset(key, credentialObj)
    .then((result) => {
      log.debug(`insertCredential - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`insertCredential - ${Date.now() - t}`);
      throw error;
    });
};

dao.getCredential = function (id, type) {
  log.debug(`getCredential - START`);
  const t = Date.now();
  return db.hgetall(buildIdKey(type, id)).then(credential => {
    if (!credential || Object.keys(credential).length === 0) return null;
    credential.isActive = credential.isActive === 'true'; // Redis has no bool type, manual conversion
    credential.type = type;
    credential.id = id;
    return credential;
  }).catch(logger.warn)
    .then((result) => {
      log.debug(`getCredential - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`getCredential - ${Date.now() - t}`);
      throw error;
    });
};

dao.activateCredential = function (id, type) {
  log.debug(`activateCredential - START`);
  const t = Date.now();
  return db.hmset(buildIdKey(type, id), { 'isActive': 'true', 'updatedAt': String(new Date()) })
    .then((result) => {
      log.debug(`activateCredential - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`activateCredential - ${Date.now() - t}`);
      throw error;
    });
};

dao.deactivateCredential = function (id, type) {
  log.debug(`deactivateCredential - START`);
  const t = Date.now();
  return db.hmset(buildIdKey(type, id), { 'isActive': 'false', 'updatedAt': String(new Date()) })
    .then((result) => {
      log.debug(`deactivateCredential - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`deactivateCredential - ${Date.now() - t}`);
      throw error;
    });
};

dao.removeCredential = function (id, type) {
  log.debug(`removeCredential - START`);
  const t = Date.now();
  return db.del(buildIdKey(type, id))
    .then((result) => {
      log.debug(`removeCredential - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`removeCredential - ${Date.now() - t}`);
      throw error;
    });
};

/*
 * Remove all credentials
 *
 * @id {String}
 */
dao.removeAllCredentials = function (id) {
  log.debug(`removeAllCredentials - START`);
  const t = Date.now();
  const dbTransaction = db.multi();
  const credentialTypes = Object.keys(config.models.credentials.properties);
  const awaitAllPromises = credentialTypes.map(type => {
    const authKey = buildIdKey(type, id);

    if (type === 'key-auth' || type === 'jwt') {
      const promises = [];

      // id in this call is actually consumerId, so we need to get all referenced keyIds
      // Get a list of all keys the user owns and all the scopes so we can remove keys from them
      Promise.all([db.smembers(authKey), dao.getAllScopes()])
        .then(([ids, scopes]) => {
          // Delete each key and remove key from scopes if they exist
          ids.forEach(keyId => {
            const idKey = buildIdKey(type, keyId);

            // Delete key
            promises.push(dbTransaction.del(idKey));

            // Delete key from all scopes
            if (scopes) {
              scopes.forEach(scope => {
                promises.push(dbTransaction.hdel(buildScopeKey(scope), idKey));
              });
            }
          });
        });

      // Now delete the main key for the user that lists all creds
      promises.push(dbTransaction.del(authKey));

      return Promise.all(promises);
    } else {
      return dbTransaction.del(authKey);
    }
  });

  return Promise.all(awaitAllPromises).then(() => dbTransaction.exec())
    .then((result) => {
      log.debug(`removeAllCredentials - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`removeAllCredentials - ${Date.now() - t}`);
      throw error;
    });
};

dao.getAllCredentials = function (consumerId) {
  log.debug(`getAllCredentials - START`);
  const t = Date.now();
  const credentialTypes = Object.keys(config.models.credentials.properties);
  const awaitAllPromises = credentialTypes.map(type => {
    if (type === 'key-auth' || type === 'jwt') { // TODO: replace with separate implementation per type instead of ifs
      return db.smembers(buildIdKey(type, consumerId)).then(keyIds => {
        // 1-* relation, finding all key-auth credentials (consumerid => [KeyId1, KeyId2, ..., KeyIdN])
        return Promise.all(keyIds.map(keyId => this.getCredential(keyId, type)));
      });
    }
    return this.getCredential(consumerId, type);
  });

  return Promise.all(awaitAllPromises)
    .then(results => Array.prototype.concat.apply([], results).filter(c => c))
    .then((result) => {
      log.debug(`getAllCredentials - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`getAllCredentials - ${Date.now() - t}`);
      throw error;
    });
};

dao.updateCredential = function (id, type, credentialObj) {
  log.debug(`updateCredential - START`);
  const t = Date.now();
  return this.insertCredential(id, type, credentialObj)
    .then((result) => {
      log.debug(`updateCredential - ${Date.now() - t}`);
      return result;
    })
    .catch((error) => {
      log.debug(`updateCredential - ${Date.now() - t}`);
      throw error;
    });
};

module.exports = dao;

function buildScopeKey (scope) {
  return config.systemConfig.db.redis.namespace.concat('-', scopeCredentialsNamespace).concat(':', scope);
}
function buildIdKey (type, id) {
  return config.systemConfig.db.redis.namespace.concat('-', type).concat(':', id);
}
