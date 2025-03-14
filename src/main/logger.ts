/**
 * Copyright (c) 2021 OpenLens Authors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { app, remote } from "electron";
import winston from "winston";
import Transport from "winston-transport";
import { isDebugging, isTestEnv } from "../common/vars";
import { LEVEL } from "triple-beam";
import { Severity } from "@sentry/browser";
import * as Sentry from "@sentry/electron";

const SENTRY_LEVELS_MAP = {
  silly: Severity.Debug,
  verbose: Severity.Debug,
  debug: Severity.Debug,
  info: Severity.Info,
  warn: Severity.Warning,
  error: Severity.Error,
};
const WINSTON_CMP: Record<WinstonLevel, Set<WinstonLevel>> = {
  silly: new Set(["silly", "verbose", "debug", "info", "warn", "error"]),
  verbose: new Set(["verbose", "debug", "info", "warn", "error"]),
  debug: new Set(["debug", "info", "warn", "error"]),
  info: new Set(["info", "warn", "error"]),
  warn: new Set(["warn", "error"]),
  error: new Set(["error"]),
};

type WinstonLevel = keyof typeof SENTRY_LEVELS_MAP;

class SentryTransport extends Transport {
  logLevels: Set<WinstonLevel>;

  constructor(minWinstonLevel: WinstonLevel) {
    super();

    this.logLevels = WINSTON_CMP[minWinstonLevel];
  }

  log(info: any, next: () => void) {
    setImmediate(() => {
      this.emit("logged", info);
    });

    const { message, level: _, tags, user, ...extra } = info;
    const winstonLevel: WinstonLevel = info[LEVEL];
    const level = SENTRY_LEVELS_MAP[winstonLevel];

    try {
      if (this.logLevels.has(winstonLevel)) {
        Sentry.captureMessage(message, {
          level,
          tags,
          extra,
        });
      }
    } finally {
      next();
    }
  }
}

interface CreateLoggerOpts extends winston.LoggerOptions {
  transports?: Transport[];
}

const logLevel = process.env.LOG_LEVEL || (isDebugging ? "debug" : "info");

const loggerOpts: CreateLoggerOpts = {
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple(),
  ),
  transports: [
    new SentryTransport("error"),
    new winston.transports.Console({
      handleExceptions: false,
      level: logLevel,
    }),
  ],
};

if (!isTestEnv) {
  loggerOpts.transports.push(new winston.transports.File({
    handleExceptions: false,
    level: logLevel,
    filename: "lens.log",
    dirname: (app ?? remote?.app)?.getPath("logs"),
    maxsize: 16 * 1024,
    maxFiles: 16,
    tailable: true,
  }));
}

export default winston.createLogger(loggerOpts);
