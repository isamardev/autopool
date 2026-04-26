"use strict";

/**
 * distDir outside the repo (see next.config.ts) makes server bundles live under
 * AppData\Temp; Node cannot find react without NODE_PATH. Shell `set NODE_PATH=`
 * is unreliable with npm on Windows; this runs before Next and refreshes paths.
 */
const path = require("path");
const Module = require("module");

const projectRoot = path.resolve(__dirname, "..");
const nm = path.join(projectRoot, "node_modules");
const prev = process.env.NODE_PATH;
process.env.NODE_PATH = [nm, prev].filter(Boolean).join(path.delimiter);
Module._initPaths();
