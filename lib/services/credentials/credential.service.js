const uuid62 = require('uuid62');
const uuidv4 = require('uuid/v4');
const refParser = require('json-schema-ref-parser');
const mergeAllOf = require('json-schema-merge-allof');
const utils = require('../utils');
const config = require('../../config');
const { validate } = require('../../../lib/schemas');
const credentialDao = require('./credential.dao.js');

const log = require('../../logger').servicesCredential;

const s = {};

const dereferencePromise = refParser.dereference(config.models.credentials).then(derefSchema => mergeAllOf(derefSchema));

s.insertScopes = function (scopes) {
  log.debug(`insertScopes - START`);
  const t = Date.now();
  return validateNewScopes(scopes)
    .then(newScopes => {
      if (!newScopes) {
        return true; // no scopes to insert
      }

      return credentialDao.insertScopes(newScopes).then(v => !!v);
    })
    .then((result) => {
      log.debug(`insertScopes - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`insertScopes - ${Date.now() - t}ms`);
      throw error;
    });
};

s.removeScopes = function (scopes) {
  log.debug(`removeScopes - START`);
  const t = Date.now();
  return credentialDao.removeScopes(scopes).then(v => !!v)
    .then((result) => {
      log.debug(`removeScopes - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`removeScopes - ${Date.now() - t}ms`);
      throw error;
    });
};

s.existsScope = function (scope) {
  log.debug(`existsScope - START`);
  const t = Date.now();
  return (scope ? credentialDao.existsScope(scope) : Promise.resolve(false))
    .then((result) => {
      log.debug(`existsScope - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`existsScope - ${Date.now() - t}ms`);
      throw error;
    });
};

s.getAllScopes = function () {
  log.debug(`getAllScopes - START`);
  const t = Date.now();
  return credentialDao.getAllScopes()
    .then((result) => {
      log.debug(`getAllScopes - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`getAllScopes - ${Date.now() - t}ms`);
      throw error;
    });
};

s.insertCredential = function (id, type, credentialDetails) {
  log.debug(`insertCredential - START`);
  const t = Date.now();
  credentialDetails = credentialDetails || {};

  if (!id || typeof id !== 'string' || !type) {
    log.debug(`insertCredential - ${Date.now() - t}ms`);
    throw new Error('Invalid credentials'); // TODO: replace with validation error
  }

  if (!config.models.credentials.properties[type]) {
    log.debug(`insertCredential - ${Date.now() - t}ms`);
    throw new Error(`Invalid credential type: ${type}`); // TODO: replace with validation error
  }

  // check if credential already exists
  const checkSingleCredExistence = () => {
    return this.getCredential(id, type)
      .then(cred => {
        if (cred && cred.isActive) {
          throw new Error('Credential already exists and is active'); // TODO: replace with validation error
        }
      });
  };

  // TODO: not a good approach, new way TBD
  const areMultipleCredsAllowed = ['key-auth', 'jwt'].includes(type);
  const flow = areMultipleCredsAllowed
    ? dereferencePromise
    : checkSingleCredExistence().then(() => dereferencePromise);

  return flow.then(resolvedSchema => {
    const credentialConfig = resolvedSchema.properties[type];
    const newCredential = { isActive: 'true' };
    utils.appendCreatedAt(newCredential);
    utils.appendUpdatedAt(newCredential);

    if (areMultipleCredsAllowed) {
      return Promise.all([
        validateNewCredentialScopes(credentialConfig, credentialDetails),
        validateNewCredentialProperties(credentialConfig, credentialDetails)
      ]).then(([scopes, credentialProps]) => {
        Object.assign(newCredential, credentialProps);
        newCredential.keyId = credentialDetails.keyId || uuid62.v4();
        newCredential.keySecret = credentialDetails.keySecret || uuid62.v4();
        newCredential.scopes = JSON.stringify(scopes);
        newCredential.consumerId = id;

        return Promise.all([
          credentialDao.insertCredential(newCredential.keyId, type, newCredential),
          credentialDao.associateCredentialWithScopes(newCredential.keyId, type, scopes)
        ]);
      }).then(() => {
        if (newCredential.scopes && newCredential.scopes.length > 0) {
          newCredential.scopes = JSON.parse(newCredential.scopes);
        }

        if (typeof newCredential.isActive === 'string') {
          newCredential.isActive = newCredential.isActive === 'true';
        }
        return newCredential;
      });
    }

    return Promise.all([
      validateNewCredentialScopes(credentialConfig, credentialDetails),
      validateAndHashPassword(credentialConfig, credentialDetails),
      validateNewCredentialProperties(credentialConfig, credentialDetails)
    ])
      .then(([scopes, { hash, password }, credentialProps]) => {
        if (scopes) {
          newCredential['scopes'] = JSON.stringify(scopes);
        }
        newCredential[credentialConfig.properties.passwordKey.default] = hash;
        delete credentialProps[credentialConfig.properties.passwordKey.default];

        Object.assign(newCredential, credentialProps);

        return Promise.all([
          password,
          credentialDao.insertCredential(id, type, newCredential),
          credentialDao.associateCredentialWithScopes(id, type, scopes)
        ]);
      }).then(([password]) => {
        const credential = newCredential;
        delete credential[credentialConfig.properties.passwordKey.default];
        credential.id = id;

        if (password) {
          credential[credentialConfig.properties.passwordKey.default] = password;
        }

        if (credential.scopes && credential.scopes.length > 0) {
          credential.scopes = JSON.parse(credential.scopes);
        }

        if (typeof credential.isActive === 'string') {
          credential.isActive = credential.isActive === 'true';
        }
        return credential;
      });
  })
    .then((result) => {
      log.debug(`insertCredential - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`insertCredential - ${Date.now() - t}ms`);
      throw error;
    });
};

s.getCredential = function (id, type, options) {
  log.debug(`getCredential - START`);
  const t = Date.now();
  if (!id || !type || typeof id !== 'string' || typeof type !== 'string') {
    log.debug(`getCredential - ${Date.now() - t}ms`);
    throw new Error('invalid credential'); // TODO: replace with validation error
  }
  return credentialDao.getCredential(id, type)
    .then(credential => {
      if (!credential) {
        return null;
      }

      return processCredential(credential, options);
    })
    .then((result) => {
      log.debug(`getCredential - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`getCredential - ${Date.now() - t}ms`);
      throw error;
    });
};

s.getCredentials = function (consumerId, options) {
  log.debug(`getCredentials - START`);
  const t = Date.now();
  return credentialDao.getAllCredentials(consumerId)
    .then(credentials => credentials.map(processCredential))
    .then((result) => {
      log.debug(`getCredentials - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`getCredentials - ${Date.now() - t}ms`);
      throw error;
    });
};

s.deactivateCredential = function (id, type) {
  log.debug(`deactivateCredential - START`);
  const t = Date.now();
  if (!id || !type) {
    log.debug(`deactivateCredential - ${Date.now() - t}ms`);
    throw new Error('invalid credential'); // TODO: replace with validation error
  }

  return this.getCredential(id, type) // verify credential exists
    .then((credential) => {
      if (credential) {
        return credentialDao.deactivateCredential(id, type).then(() => true);
      } else throw new Error('credential does not exist'); // TODO: replace with validation error
    })
    .then((result) => {
      log.debug(`deactivateCredential - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`deactivateCredential - ${Date.now() - t}ms`);
      throw error;
    });
};

s.activateCredential = function (id, type) {
  log.debug(`activateCredential - START`);
  const t = Date.now();
  if (!id || !type) {
    log.debug(`activateCredential - ${Date.now() - t}ms`);
    throw new Error('invalid credential'); // TODO: replace with validation error
  }

  return this.getCredential(id, type) // verify credential exists
    .then((credential) => {
      if (credential) {
        return credentialDao.activateCredential(id, type).then(() => true);
      } else throw new Error('credential does not exist'); // TODO: replace with validation error
    })
    .then((result) => {
      log.debug(`activateCredential - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`activateCredential - ${Date.now() - t}ms`);
      throw error;
    });
};

s.updateCredential = function (id, type, properties) {
  log.debug(`updateCredential - START`);
  const t = Date.now();
  return this.getCredential(id, type)
    .then((credential) => {
      if (!credential) {
        throw new Error('credential does not exist'); // TODO: replace with validation error
      }
      return validateUpdatedCredentialProperties(type, properties);
    })
    .then((credentialProperties) => {
      if (!credentialProperties) {
        return null;
      }
      utils.appendUpdatedAt(credentialProperties);
      return credentialDao.updateCredential(id, type, credentialProperties);
    })
    .then((result) => {
      log.debug(`updateCredential - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`updateCredential - ${Date.now() - t}ms`);
      throw error;
    });
};

s.removeCredential = function (id, type) {
  log.debug(`removeCredential - START`);
  const t = Date.now();
  if (!id || !type) {
    log.debug(`removeCredential - ${Date.now() - t}ms`);
    throw new Error('invalid credential'); // TODO: replace with validation error
  }

  return credentialDao.removeCredential(id, type)
    .then((result) => {
      log.debug(`removeCredential - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`removeCredential - ${Date.now() - t}ms`);
      throw error;
    });
};

s.removeAllCredentials = function (id) {
  log.debug(`removeAllCredentials - START`);
  const t = Date.now();
  if (!id) {
    log.debug(`removeAllCredentials - ${Date.now() - t}ms`);
    throw new Error('invalid credential'); // TODO: replace with validation error
  }
  return credentialDao.removeAllCredentials(id)
    .then((result) => {
      log.debug(`removeAllCredentials - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`removeAllCredentials - ${Date.now() - t}ms`);
      throw error;
    });
};

s.addScopesToCredential = function (id, type, scopes) {
  log.debug(`addScopesToCredential - START`);
  const t = Date.now();
  return Promise.all([
    validateExistingScopes(scopes),
    this.getCredential(id, type)
  ]).then(([_scopes, credential]) => {
    if (!credential) {
      throw new Error('credential not found');
    }

    const existingScopes = credential.scopes ? (Array.isArray(credential.scopes) ? credential.scopes : [credential.scopes]) : [];
    // Set has unique items
    const newScopes = [...new Set(_scopes.concat(existingScopes))];
    return Promise.all([
      credentialDao.updateCredential(id, type, { scopes: JSON.stringify(newScopes) }),
      credentialDao.associateCredentialWithScopes(id, type, _scopes)
    ]).then(() => true);
  })
    .then((result) => {
      log.debug(`addScopesToCredential - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`addScopesToCredential - ${Date.now() - t}ms`);
      throw error;
    });
};

s.removeScopesFromCredential = function (id, type, scopes) {
  log.debug(`removeScopesFromCredential - START`);
  const t = Date.now();
  return this.getCredential(id, type)
    .then((credential) => {
      if (!credential) {
        throw new Error('Credential not found');
      }

      const newScopes = credential.scopes.filter(val => scopes.indexOf(val) === -1);
      return Promise.all([
        credentialDao.updateCredential(id, type, { scopes: JSON.stringify(newScopes) }),
        credentialDao.dissociateCredentialFromScopes(id, type, scopes)
      ]).then(() => true);
    })
    .then((result) => {
      log.debug(`removeScopesFromCredential - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`removeScopesFromCredential - ${Date.now() - t}ms`);
      throw error;
    });
};

s.setScopesForCredential = function (id, type, scopes) {
  log.debug(`setScopesForCredential - START`);
  const t = Date.now();
  return this.getCredential(id, type)
    .then((credential) => {
      if (!credential) {
        throw new Error('credential not found');
      }

      return credentialDao.updateCredential(id, type, { scopes: JSON.stringify(scopes) });
    }).then(() => true)
    .then((result) => {
      log.debug(`setScopesForCredential - ${Date.now() - t}ms`);
      return result;
    })
    .catch((error) => {
      log.debug(`setScopesForCredential - ${Date.now() - t}ms`);
      throw error;
    });
};

function processCredential (credential, options = { includePassword: false }) {
  if (credential.scopes && credential.scopes.length > 0) {
    credential.scopes = JSON.parse(credential.scopes);
  }
  const credentialModel = config.models.credentials.properties[credential.type];
  if (!options.includePassword && credentialModel.properties && credentialModel.properties.passwordKey) {
    delete credential[credentialModel.properties.passwordKey.default];
    delete credential.passwordKey;
  }

  delete credential.autoGeneratePassword;

  return credential;
}

function validateAndHashPassword (credentialConfig, credentialDetails) {
  if (credentialDetails[credentialConfig.properties.passwordKey.default]) {
    return utils.saltAndHash(credentialDetails[credentialConfig.properties.passwordKey.default])
      .then(hash => ({ hash }));
  }

  if (!credentialConfig.properties.autoGeneratePassword.default) {
    throw new Error(`${credentialConfig.properties.passwordKey.default}ms is required`); // TODO: replace with validation error
  }
  const password = uuidv4();

  return utils.saltAndHash(password)
    .then((hash) => ({ hash, password }));
}

function validateNewCredentialScopes (credentialConfig, credentialDetails) {
  if (!credentialConfig.properties || !credentialConfig.properties['scopes']) {
    return Promise.resolve(null);
  }

  if (credentialDetails['scopes']) {
    return validateExistingScopes(credentialDetails['scopes']);
  }

  if (credentialConfig.required && credentialConfig.required.includes('scopes')) {
    throw new Error('scopes are required'); // TODO: replace with validation error
  }

  if (credentialConfig.properties['scopes'].default) {
    return Promise.resolve(credentialConfig.properties['scopes'].default);
  }

  return Promise.resolve(null);
}

// This function validates all user defined properties, excluding scopes
function validateNewCredentialProperties (credentialConfig, credentialDetail) {
  // Tmp — horrible hack to remove.
  const credentialDetails = JSON.parse(JSON.stringify(credentialDetail));
  delete credentialDetails.scopes;

  const validationResult = validate(credentialConfig, credentialDetails);
  if (!validationResult.isValid) {
    return Promise.reject(new Error(validationResult.error));
  };

  return Promise.resolve(credentialDetails);
}

// This function validates all user defined properties, excluding scopes
function validateUpdatedCredentialProperties (type, credentialDetails) {
  const newCredentialProperties = {};
  const credentialConfig = config.models.credentials.properties[type];

  for (const prop in credentialConfig.properties) {
    if (prop === 'scopes') {
      continue;
    }
    if (credentialDetails[prop]) {
      if (typeof credentialDetails[prop] !== 'string') {
        throw new Error('credential property must be a string'); // TODO: replace with validation error
      }
      if (credentialConfig.properties[prop].isMutable !== false) {
        newCredentialProperties[prop] = credentialDetails[prop];
      } else throw new Error(`${prop} is immutable`);
    }
  }

  return Object.keys(newCredentialProperties).length > 0 ? Promise.resolve(newCredentialProperties) : Promise.resolve(null);
}

function validateNewScopes (scopes) {
  return grabScopesAndExecute(scopes, val => !val).catch(() => { throw new Error('One or more scopes already exist.'); });
}

function validateExistingScopes (scopes) {
  return grabScopesAndExecute(scopes, val => val).catch(() => { throw new Error('One or more scopes don\'t exist'); });
}

function grabScopesAndExecute (scopes, fn) {
  return Promise.all(scopes.map(s.existsScope))
    .then(res => {
      if (res.every(fn)) {
        return scopes;
      }

      throw new Error('SCOPE_VALIDATION_FAILED');
    });
}

module.exports = s;
