const fs = require("fs");
const path = require("path");
const utils = require("loader-utils");
const { get, map, isEmpty, concat } = require("lodash");

const { warn } = require("console");

const regExecAll = function (r, string) {
  var match = null;
  var matches = [];
  while (!isEmpty(match = r.exec(string))) {
    var matchArray = [];
    for (var i in match) {
      if (parseInt(i, 10) == i) {
        matchArray.push(match[i]);
      }
    }
    matches.push(matchArray);
  }
  return matches;
};

const resolve = (m, filename, opt) => {
  const namepath = opt.namespace.replace(/\./g, "/");
  const sourceRoot = path.resolve(opt.sourceRoot ? opt.sourceRoot : process.cwd());
  var absPath = path.resolve(sourceRoot, `./${m}`);
  if (m.startsWith(namepath)) {
    absPath = path.resolve(sourceRoot, `./${m.replace(namepath, "")}`);
  }
  if (!absPath.endsWith(".js")) {
    absPath += ".js";
  }
  if (fs.existsSync(absPath)) {
    var relativePath = path.relative(path.dirname(filename), absPath);
    if (!relativePath.startsWith(".")) {
      relativePath = "./" + relativePath;
    }
    relativePath = relativePath.replace(/\\/g, "/");
    return relativePath;
  } else {
    try {
      const r = require.resolve(m);
      if (r) {
        return r;
      }
    } catch (error) {
      // ignore
    }

    if (!m.startsWith("sap")) {
      warn(`WARN: \nDependency "${absPath}" of "${path.relative(sourceRoot, filename)}" is not found in ${sourceRoot}.\n`);
    }
    return null;
  }
};

const resolveManifest = (path) => {

  var rt = []
  const content = fs.readFileSync(path);
  const manifest = JSON.parse(content);
  const routing = get(manifest, ["sap.ui5", "routing"], {});
  const rootViewName = get(manifest, ["sap.ui5", "rootView", "viewName"], "")

  if (rootViewName) {
    rt.push(`${rootViewName.replace(/\./g, "/")}.view`)
  }

  const { config, targets } = routing;
  if (config && targets) {
    var viewBase = config.viewPath.replace(/\./g, "/");
    var viewPath = map(targets, t => `${viewBase}/${t.viewName}.view`);
    rt = concat(rt, viewPath)
  }

  return rt;
};

const resolveJSView = (source = "") => {
  const views = regExecAll(/viewName: "([\s\S]*?)"/g, source);
  if (!isEmpty(views)) {
    return map(views, v => `${v[1].replace(/\./g, "/")}.view`);
  } else {
    return [];
  }
};

module.exports = function (source, map) {

  this.cacheable();

  if (!source) {
    return null;
  }

  var opt = utils.parseQuery(this.query);

  if (!opt.sourceRoot) {
    throw new Error("Please set source root in webpack config !!!\n");
  }

  if (!opt.namespace) {
    throw new Error("Please set namespace in webpack config !!!\n");
  }

  const webpackRemainingChain = utils.getRemainingRequest(this).split('!');

  const filename = webpackRemainingChain[webpackRemainingChain.length - 1];

  const groups = /sap\.ui\.define\(.*?(\[.*?\])/g.exec(source);

  const requires = [];


  // process sap.ui.define module import
  if (groups && groups.length > 0) {
    const dependencies = JSON.parse(groups[1]);

    dependencies.map(d => {
      const absPath = resolve(d, filename, opt);
      if (absPath !== null) {
        requires.push(`require("${absPath}");`);
      }
    });

  }

  if (/UIComponent\.extend/g.test(source)) {
    const views = resolveManifest(`${this.context}/manifest.json`);
    views.forEach(v => requires.push(`require("${resolve(v, filename, opt)}");`));
  }

  const importedViews = resolveJSView(source);
  if (!isEmpty(importedViews)) {
    importedViews.forEach(v => requires.push(`require("${resolve(v, filename, opt)}");`));
  }

  source = requires.join("\n") + source;


  return source;

};

