const { createLogger, format, transports } = require('winston');
const chalk = require('chalk').default;
const { combine, colorize, label, printf, splat, timestamp } = format;

const logFormat = (loggerLabel) => combine(
  timestamp(),
  splat(),
  colorize(),
  label({ label: loggerLabel }),
  printf(info => `${info.timestamp} ${chalk.cyan(info.label)} ${info.level}: ${info.message}`)
);

const createLoggerWithLabel = (label) => createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [new transports.Console({})],
  format: logFormat(label)
});

module.exports = {
  gateway: createLoggerWithLabel('[EG:gateway]'),
  policy: createLoggerWithLabel('[EG:policy]'),
  config: createLoggerWithLabel('[EG:config]'),
  admin: createLoggerWithLabel('[EG:admin]'),
  plugins: createLoggerWithLabel('[EG:plugins]'),

  db: createLoggerWithLabel('[EG:db]'),
  services: createLoggerWithLabel('[EG:services]'),

  dbAuthCode: createLoggerWithLabel('[EG:db:authorization-code]'),
  dbApplication: createLoggerWithLabel('[EG:db:application]'),
  dbUser: createLoggerWithLabel('[EG:db:user]'),
  dbCredential: createLoggerWithLabel('[EG:db:credential]'),
  dbToken: createLoggerWithLabel('[EG:db:token]'),

  servicesAuthCode: createLoggerWithLabel('[EG:services:authorization-code]'),
  servicesApplication: createLoggerWithLabel('[EG:services:application]'),
  servicesUser: createLoggerWithLabel('[EG:services:user]'),
  servicesCredential: createLoggerWithLabel('[EG:services:credential]'),
  servicesToken: createLoggerWithLabel('[EG:services:token]'),

  utils: createLoggerWithLabel('[EG:utils]'),
  createLoggerWithLabel
};
