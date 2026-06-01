/**
* @license React
 * react-server-dom-esm-client.browser.development.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as React from 'react';
import * as ReactDOM from 'react-dom';

var ReactVersion = '19.3.0-canary-e33071c6-20260224';

function createStringDecoder() {
  return new TextDecoder();
}
var decoderOptions = {
  stream: true
};
function readPartialStringChunk(decoder, buffer) {
  return decoder.decode(buffer, decoderOptions);
}
function readFinalStringChunk(decoder, buffer) {
  return decoder.decode(buffer);
}

// Keep in sync with ReactServerConsoleConfig
var badgeFormat = '%c%s%c';
// Same badge styling as DevTools.
var badgeStyle =
// We use a fixed background if light-dark is not supported, otherwise
// we use a transparent background.
'background: #e6e6e6;' + 'background: light-dark(rgba(0,0,0,0.1), rgba(255,255,255,0.25));' + 'color: #000000;' + 'color: light-dark(#000000, #ffffff);' + 'border-radius: 2px';
var resetStyle = '';
var pad = ' ';
var bind = Function.prototype.bind;
function bindToConsole(methodName, args, badgeName) {
  var offset = 0;
  switch (methodName) {
    case 'dir':
    case 'dirxml':
    case 'groupEnd':
    case 'table':
      {
        // These methods cannot be colorized because they don't take a formatting string.
        // $FlowFixMe
        return bind.apply(console[methodName], [console].concat(args)); // eslint-disable-line react-internal/no-production-logging
      }
    case 'assert':
      {
        // assert takes formatting options as the second argument.
        offset = 1;
      }
  }
  var newArgs = args.slice(0);
  if (typeof newArgs[offset] === 'string') {
    newArgs.splice(offset, 1, badgeFormat + ' ' + newArgs[offset], badgeStyle, pad + badgeName + pad, resetStyle);
  } else {
    newArgs.splice(offset, 0, badgeFormat, badgeStyle, pad + badgeName + pad, resetStyle);
  }

  // The "this" binding in the "bind";
  newArgs.unshift(console);

  // $FlowFixMe
  return bind.apply(console[methodName], newArgs); // eslint-disable-line react-internal/no-production-logging
}

var hasConfirmedEval = false;
function checkEvalAvailabilityOnceDev() {
  {
    if (!hasConfirmedEval) {
      hasConfirmedEval = true;
      try {
        // eslint-disable-next-line no-eval
        (0, eval)('null');
      } catch {
        console.error('eval() is not supported in this environment. ' + 'If this page was served with a `Content-Security-Policy` header, ' + 'make sure that `unsafe-eval` is included. ' + 'React requires eval() in development mode for various debugging features ' + 'like reconstructing callstacks from a different environment.\n' + 'React will never use eval() in production mode');
      }
    }
  }
}

// Module root path

function resolveClientReference(bundlerConfig, metadata) {
  var baseURL = bundlerConfig;
  return {
    specifier: baseURL + metadata[0],
    name: metadata[1]
  };
}
function resolveServerReference(config, id) {
  var baseURL = config;
  var idx = id.lastIndexOf('#');
  var exportName = id.slice(idx + 1);
  var fullURL = id.slice(0, idx);
  if (!fullURL.startsWith(baseURL)) {
    throw new Error('Attempted to load a Server Reference outside the hosted root.');
  }
  return {
    specifier: fullURL,
    name: exportName
  };
}
var asyncModuleCache = new Map();
function preloadModule(metadata) {
  var existingPromise = asyncModuleCache.get(metadata.specifier);
  if (existingPromise) {
    if (existingPromise.status === 'fulfilled') {
      return null;
    }
    return existingPromise;
  } else {
    // $FlowFixMe[unsupported-syntax]
    var modulePromise = import(metadata.specifier);
    modulePromise.then(function (value) {
      var fulfilledThenable = modulePromise;
      fulfilledThenable.status = 'fulfilled';
      fulfilledThenable.value = value;
    }, function (reason) {
      var rejectedThenable = modulePromise;
      rejectedThenable.status = 'rejected';
      rejectedThenable.reason = reason;
    });
    asyncModuleCache.set(metadata.specifier, modulePromise);
    return modulePromise;
  }
}
function requireModule(metadata) {
  var moduleExports;
  // We assume that preloadModule has been called before, which
  // should have added something to the module cache.
  var promise = asyncModuleCache.get(metadata.specifier);
  if (promise.status === 'fulfilled') {
    moduleExports = promise.value;
  } else {
    throw promise.reason;
  }
  return moduleExports[metadata.name];
}

// We cache ReactIOInfo across requests so that inner refreshes can dedupe with outer.
var moduleIOInfoCache = new Map() ;
function getModuleDebugInfo(metadata) {
  var filename = metadata.specifier;
  var ioInfo = moduleIOInfoCache.get(filename);
  if (ioInfo === undefined) {
    var href;
    try {
      // $FlowFixMe
      href = new URL(filename, document.baseURI).href;
    } catch (_) {
      href = filename;
    }
    var start = -1;
    var end = -1;
    var byteSize = 0;
    // $FlowFixMe[method-unbinding]
    if (typeof performance.getEntriesByType === 'function') {
      // We may be able to collect the start and end time of this resource from Performance Observer.
      var resourceEntries = performance.getEntriesByType('resource');
      for (var i = 0; i < resourceEntries.length; i++) {
        var resourceEntry = resourceEntries[i];
        if (resourceEntry.name === href) {
          start = resourceEntry.startTime;
          end = start + resourceEntry.duration;
          // $FlowFixMe[prop-missing]
          byteSize = resourceEntry.transferSize || 0;
        }
      }
    }
    var value = Promise.resolve(href);
    // $FlowFixMe
    value.status = 'fulfilled';
    // Is there some more useful representation for the chunk?
    // $FlowFixMe
    value.value = href;
    // Create a fake stack frame that points to the beginning of the chunk. This is
    // probably not source mapped so will link to the compiled source rather than
    // any individual file that goes into the chunks.
    var fakeStack = new Error('react-stack-top-frame');
    if (fakeStack.stack.startsWith('Error: react-stack-top-frame')) {
      // Looks like V8
      fakeStack.stack = 'Error: react-stack-top-frame\n' +
      // Add two frames since we always trim one off the top.
      '    at Client Component Bundle (' + href + ':1:1)\n' + '    at Client Component Bundle (' + href + ':1:1)';
    } else {
      // Looks like Firefox or Safari.
      // Add two frames since we always trim one off the top.
      fakeStack.stack = 'Client Component Bundle@' + href + ':1:1\n' + 'Client Component Bundle@' + href + ':1:1';
    }
    ioInfo = {
      name: 'script',
      start: start,
      end: end,
      value: value,
      debugStack: fakeStack
    };
    if (byteSize > 0) {
      // $FlowFixMe[cannot-write]
      ioInfo.byteSize = byteSize;
    }
    moduleIOInfoCache.set(filename, ioInfo);
  }
  // We could dedupe the async info too but conceptually each request is its own await.
  var asyncInfo = {
    awaited: ioInfo
  };
  return [asyncInfo];
}

var ReactDOMSharedInternals = ReactDOM.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

// This client file is in the shared folder because it applies to both SSR and browser contexts.
// It is the configuration of the FlightClient behavior which can run in either environment.

function dispatchHint(code, model) {
  var dispatcher = ReactDOMSharedInternals.d; /* ReactDOMCurrentDispatcher */
  switch (code) {
    case 'D':
      {
        var refined = refineModel(code, model);
        var href = refined;
        dispatcher.D( /* prefetchDNS */href);
        return;
      }
    case 'C':
      {
        var _refined = refineModel(code, model);
        if (typeof _refined === 'string') {
          var _href = _refined;
          dispatcher.C( /* preconnect */_href);
        } else {
          var _href2 = _refined[0];
          var crossOrigin = _refined[1];
          dispatcher.C( /* preconnect */_href2, crossOrigin);
        }
        return;
      }
    case 'L':
      {
        var _refined2 = refineModel(code, model);
        var _href3 = _refined2[0];
        var as = _refined2[1];
        if (_refined2.length === 3) {
          var options = _refined2[2];
          dispatcher.L( /* preload */_href3, as, options);
        } else {
          dispatcher.L( /* preload */_href3, as);
        }
        return;
      }
    case 'm':
      {
        var _refined3 = refineModel(code, model);
        if (typeof _refined3 === 'string') {
          var _href4 = _refined3;
          dispatcher.m( /* preloadModule */_href4);
        } else {
          var _href5 = _refined3[0];
          var _options = _refined3[1];
          dispatcher.m( /* preloadModule */_href5, _options);
        }
        return;
      }
    case 'X':
      {
        var _refined4 = refineModel(code, model);
        if (typeof _refined4 === 'string') {
          var _href6 = _refined4;
          dispatcher.X( /* preinitScript */_href6);
        } else {
          var _href7 = _refined4[0];
          var _options2 = _refined4[1];
          dispatcher.X( /* preinitScript */_href7, _options2);
        }
        return;
      }
    case 'S':
      {
        var _refined5 = refineModel(code, model);
        if (typeof _refined5 === 'string') {
          var _href8 = _refined5;
          dispatcher.S( /* preinitStyle */_href8);
        } else {
          var _href9 = _refined5[0];
          var precedence = _refined5[1] === 0 ? undefined : _refined5[1];
          var _options3 = _refined5.length === 3 ? _refined5[2] : undefined;
          dispatcher.S( /* preinitStyle */_href9, precedence, _options3);
        }
        return;
      }
    case 'M':
      {
        var _refined6 = refineModel(code, model);
        if (typeof _refined6 === 'string') {
          var _href10 = _refined6;
          dispatcher.M( /* preinitModuleScript */_href10);
        } else {
          var _href11 = _refined6[0];
          var _options4 = _refined6[1];
          dispatcher.M( /* preinitModuleScript */_href11, _options4);
        }
        return;
      }
  }
}

// Flow is having trouble refining the HintModels so we help it a bit.
// This should be compiled out in the production build.
function refineModel(code, model) {
  return model;
}

var rendererPackageName = 'react-server-dom-esm';

// ATTENTION
// When adding new symbols to this file,
// Please consider also adding to 'react-devtools-shared/src/backend/ReactSymbols'

var REACT_ELEMENT_TYPE = Symbol.for('react.transitional.element');
var REACT_PORTAL_TYPE = Symbol.for('react.portal');
var REACT_FRAGMENT_TYPE = Symbol.for('react.fragment');
var REACT_STRICT_MODE_TYPE = Symbol.for('react.strict_mode');
var REACT_PROFILER_TYPE = Symbol.for('react.profiler');
var REACT_CONSUMER_TYPE = Symbol.for('react.consumer');
var REACT_CONTEXT_TYPE = Symbol.for('react.context');
var REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
var REACT_SUSPENSE_TYPE = Symbol.for('react.suspense');
var REACT_SUSPENSE_LIST_TYPE = Symbol.for('react.suspense_list');
var REACT_MEMO_TYPE = Symbol.for('react.memo');
var REACT_LAZY_TYPE = Symbol.for('react.lazy');
var REACT_ACTIVITY_TYPE = Symbol.for('react.activity');
var REACT_VIEW_TRANSITION_TYPE = Symbol.for('react.view_transition');
var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
var FAUX_ITERATOR_SYMBOL = '@@iterator';
function getIteratorFn(maybeIterable) {
  if (maybeIterable === null || typeof maybeIterable !== 'object') {
    return null;
  }
  var maybeIterator = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable[FAUX_ITERATOR_SYMBOL];
  if (typeof maybeIterator === 'function') {
    return maybeIterator;
  }
  return null;
}
var ASYNC_ITERATOR = Symbol.asyncIterator;

// This is actually a symbol but Flow doesn't support comparison of symbols to refine.
// We use a boolean since in our code we often expect string (key) or number (index),
// so by pretending to be a boolean we cover a lot of cases that don't consider this case.

var isArrayImpl = Array.isArray;
function isArray(a) {
  return isArrayImpl(a);
}

var getPrototypeOf = Object.getPrototypeOf;

// Used for DEV messages to keep track of which parent rendered some props,
// in case they error.
var jsxPropsParents = new WeakMap();
var jsxChildrenParents = new WeakMap();
function isObjectPrototype(object) {
  if (!object) {
    return false;
  }
  var ObjectPrototype = Object.prototype;
  if (object === ObjectPrototype) {
    return true;
  }
  // It might be an object from a different Realm which is
  // still just a plain simple object.
  if (getPrototypeOf(object)) {
    return false;
  }
  var names = Object.getOwnPropertyNames(object);
  for (var i = 0; i < names.length; i++) {
    if (!(names[i] in ObjectPrototype)) {
      return false;
    }
  }
  return true;
}
function isSimpleObject(object) {
  if (!isObjectPrototype(getPrototypeOf(object))) {
    return false;
  }
  var names = Object.getOwnPropertyNames(object);
  for (var i = 0; i < names.length; i++) {
    var descriptor = Object.getOwnPropertyDescriptor(object, names[i]);
    if (!descriptor) {
      return false;
    }
    if (!descriptor.enumerable) {
      if ((names[i] === 'key' || names[i] === 'ref') && typeof descriptor.get === 'function') {
        // React adds key and ref getters to props objects to issue warnings.
        // Those getters will not be transferred to the client, but that's ok,
        // so we'll special case them.
        continue;
      }
      return false;
    }
  }
  return true;
}
function objectName(object) {
  // $FlowFixMe[method-unbinding]
  var name = Object.prototype.toString.call(object);
  // Extract 'Object' from '[object Object]':
  return name.slice(8, name.length - 1);
}
function describeKeyForErrorMessage(key) {
  var encodedKey = JSON.stringify(key);
  return '"' + key + '"' === encodedKey ? key : encodedKey;
}
function describeValueForErrorMessage(value) {
  switch (typeof value) {
    case 'string':
      {
        return JSON.stringify(value.length <= 10 ? value : value.slice(0, 10) + '...');
      }
    case 'object':
      {
        if (isArray(value)) {
          return '[...]';
        }
        if (value !== null && value.$$typeof === CLIENT_REFERENCE_TAG) {
          return describeClientReference();
        }
        var name = objectName(value);
        if (name === 'Object') {
          return '{...}';
        }
        return name;
      }
    case 'function':
      {
        if (value.$$typeof === CLIENT_REFERENCE_TAG) {
          return describeClientReference();
        }
        var _name = value.displayName || value.name;
        return _name ? 'function ' + _name : 'function';
      }
    default:
      // eslint-disable-next-line react-internal/safe-string-coercion
      return String(value);
  }
}
function describeElementType(type) {
  if (typeof type === 'string') {
    return type;
  }
  switch (type) {
    case REACT_SUSPENSE_TYPE:
      return 'Suspense';
    case REACT_SUSPENSE_LIST_TYPE:
      return 'SuspenseList';
    case REACT_VIEW_TRANSITION_TYPE:
      {
        return 'ViewTransition';
      }
  }
  if (typeof type === 'object') {
    switch (type.$$typeof) {
      case REACT_FORWARD_REF_TYPE:
        return describeElementType(type.render);
      case REACT_MEMO_TYPE:
        return describeElementType(type.type);
      case REACT_LAZY_TYPE:
        {
          var lazyComponent = type;
          var payload = lazyComponent._payload;
          var init = lazyComponent._init;
          try {
            // Lazy may contain any component type so we recursively resolve it.
            return describeElementType(init(payload));
          } catch (x) {}
        }
    }
  }
  return '';
}
var CLIENT_REFERENCE_TAG = Symbol.for('react.client.reference');
function describeClientReference(ref) {
  return 'client';
}
function describeObjectForErrorMessage(objectOrArray, expandedName) {
  var objKind = objectName(objectOrArray);
  if (objKind !== 'Object' && objKind !== 'Array') {
    return objKind;
  }
  var str = '';
  var start = -1;
  var length = 0;
  if (isArray(objectOrArray)) {
    if (jsxChildrenParents.has(objectOrArray)) {
      // Print JSX Children
      var type = jsxChildrenParents.get(objectOrArray);
      str = '<' + describeElementType(type) + '>';
      var array = objectOrArray;
      for (var i = 0; i < array.length; i++) {
        var value = array[i];
        var substr = void 0;
        if (typeof value === 'string') {
          substr = value;
        } else if (typeof value === 'object' && value !== null) {
          substr = '{' + describeObjectForErrorMessage(value) + '}';
        } else {
          substr = '{' + describeValueForErrorMessage(value) + '}';
        }
        if ('' + i === expandedName) {
          start = str.length;
          length = substr.length;
          str += substr;
        } else if (substr.length < 15 && str.length + substr.length < 40) {
          str += substr;
        } else {
          str += '{...}';
        }
      }
      str += '</' + describeElementType(type) + '>';
    } else {
      // Print Array
      str = '[';
      var _array = objectOrArray;
      for (var _i = 0; _i < _array.length; _i++) {
        if (_i > 0) {
          str += ', ';
        }
        var _value = _array[_i];
        var _substr = void 0;
        if (typeof _value === 'object' && _value !== null) {
          _substr = describeObjectForErrorMessage(_value);
        } else {
          _substr = describeValueForErrorMessage(_value);
        }
        if ('' + _i === expandedName) {
          start = str.length;
          length = _substr.length;
          str += _substr;
        } else if (_substr.length < 10 && str.length + _substr.length < 40) {
          str += _substr;
        } else {
          str += '...';
        }
      }
      str += ']';
    }
  } else {
    if (objectOrArray.$$typeof === REACT_ELEMENT_TYPE) {
      str = '<' + describeElementType(objectOrArray.type) + '/>';
    } else if (objectOrArray.$$typeof === CLIENT_REFERENCE_TAG) {
      return describeClientReference();
    } else if (jsxPropsParents.has(objectOrArray)) {
      // Print JSX
      var _type = jsxPropsParents.get(objectOrArray);
      str = '<' + (describeElementType(_type) || '...');
      var object = objectOrArray;
      var names = Object.keys(object);
      for (var _i2 = 0; _i2 < names.length; _i2++) {
        str += ' ';
        var name = names[_i2];
        str += describeKeyForErrorMessage(name) + '=';
        var _value2 = object[name];
        var _substr2 = void 0;
        if (name === expandedName && typeof _value2 === 'object' && _value2 !== null) {
          _substr2 = describeObjectForErrorMessage(_value2);
        } else {
          _substr2 = describeValueForErrorMessage(_value2);
        }
        if (typeof _value2 !== 'string') {
          _substr2 = '{' + _substr2 + '}';
        }
        if (name === expandedName) {
          start = str.length;
          length = _substr2.length;
          str += _substr2;
        } else if (_substr2.length < 10 && str.length + _substr2.length < 40) {
          str += _substr2;
        } else {
          str += '...';
        }
      }
      str += '>';
    } else {
      // Print Object
      str = '{';
      var _object = objectOrArray;
      var _names = Object.keys(_object);
      for (var _i3 = 0; _i3 < _names.length; _i3++) {
        if (_i3 > 0) {
          str += ', ';
        }
        var _name2 = _names[_i3];
        str += describeKeyForErrorMessage(_name2) + ': ';
        var _value3 = _object[_name2];
        var _substr3 = void 0;
        if (typeof _value3 === 'object' && _value3 !== null) {
          _substr3 = describeObjectForErrorMessage(_value3);
        } else {
          _substr3 = describeValueForErrorMessage(_value3);
        }
        if (_name2 === expandedName) {
          start = str.length;
          length = _substr3.length;
          str += _substr3;
        } else if (_substr3.length < 10 && str.length + _substr3.length < 40) {
          str += _substr3;
        } else {
          str += '...';
        }
      }
      str += '}';
    }
  }
  if (expandedName === undefined) {
    return str;
  }
  if (start > -1 && length > 0) {
    var highlight = ' '.repeat(start) + '^'.repeat(length);
    return '\n  ' + str + '\n  ' + highlight;
  }
  return '\n  ' + str;
}

function createTemporaryReferenceSet() {
  return new Map();
}
function writeTemporaryReference(set, reference, object) {
  set.set(reference, object);
}
function readTemporaryReference(set, reference) {
  return set.get(reference);
}

var ObjectPrototype = Object.prototype;
var knownServerReferences = new WeakMap();

// Serializable values

// Thenable<ReactServerValue>

var __PROTO__$1 = '__proto__';
function serializeByValueID(id) {
  return '$' + id.toString(16);
}
function serializePromiseID(id) {
  return '$@' + id.toString(16);
}
function serializeServerReferenceID(id) {
  return '$h' + id.toString(16);
}
function serializeTemporaryReferenceMarker() {
  return '$T';
}
function serializeFormDataReference(id) {
  return '$K' + id.toString(16);
}
function serializeNumber(number) {
  if (Number.isFinite(number)) {
    if (number === 0 && 1 / number === -Infinity) {
      return '$-0';
    } else {
      return number;
    }
  } else {
    if (number === Infinity) {
      return '$Infinity';
    } else if (number === -Infinity) {
      return '$-Infinity';
    } else {
      return '$NaN';
    }
  }
}
function serializeUndefined() {
  return '$undefined';
}
function serializeDateFromDateJSON(dateJSON) {
  // JSON.stringify automatically calls Date.prototype.toJSON which calls toISOString.
  // We need only tack on a $D prefix.
  return '$D' + dateJSON;
}
function serializeBigInt(n) {
  return '$n' + n.toString(10);
}
function serializeMapID(id) {
  return '$Q' + id.toString(16);
}
function serializeSetID(id) {
  return '$W' + id.toString(16);
}
function serializeBlobID(id) {
  return '$B' + id.toString(16);
}
function serializeIteratorID(id) {
  return '$i' + id.toString(16);
}
function escapeStringValue(value) {
  if (value[0] === '$') {
    // We need to escape $ prefixed strings since we use those to encode
    // references to IDs and as special symbol values.
    return '$' + value;
  } else {
    return value;
  }
}
function processReply(root, formFieldPrefix, temporaryReferences, resolve, reject) {
  var nextPartId = 1;
  var pendingParts = 0;
  var formData = null;
  var writtenObjects = new WeakMap();
  var modelRoot = root;
  {
    // We use eval to create fake function stacks which includes Component stacks.
    // A warning would be noise if you used Flight without Components and don't encounter
    // errors. We're warning eagerly so that you configure your environment accordingly
    // before you encounter an error.
    checkEvalAvailabilityOnceDev();
  }
  function serializeTypedArray(tag, typedArray) {
    var blob = new Blob([
    // We should be able to pass the buffer straight through but Node < 18 treat
    // multi-byte array blobs differently so we first convert it to single-byte.
    new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength)]);
    var blobId = nextPartId++;
    if (formData === null) {
      formData = new FormData();
    }
    formData.append(formFieldPrefix + blobId, blob);
    return '$' + tag + blobId.toString(16);
  }
  function serializeBinaryReader(reader) {
    if (formData === null) {
      // Upgrade to use FormData to allow us to stream this value.
      formData = new FormData();
    }
    var data = formData;
    pendingParts++;
    var streamId = nextPartId++;
    var buffer = [];
    function progress(entry) {
      if (entry.done) {
        var blobId = nextPartId++;
        data.append(formFieldPrefix + blobId, new Blob(buffer));
        data.append(formFieldPrefix + streamId, '"$o' + blobId.toString(16) + '"');
        data.append(formFieldPrefix + streamId, 'C'); // Close signal
        pendingParts--;
        if (pendingParts === 0) {
          resolve(data);
        }
      } else {
        buffer.push(entry.value);
        reader.read(new Uint8Array(1024)).then(progress, reject);
      }
    }
    reader.read(new Uint8Array(1024)).then(progress, reject);
    return '$r' + streamId.toString(16);
  }
  function serializeReader(reader) {
    if (formData === null) {
      // Upgrade to use FormData to allow us to stream this value.
      formData = new FormData();
    }
    var data = formData;
    pendingParts++;
    var streamId = nextPartId++;
    function progress(entry) {
      if (entry.done) {
        data.append(formFieldPrefix + streamId, 'C'); // Close signal
        pendingParts--;
        if (pendingParts === 0) {
          resolve(data);
        }
      } else {
        try {
          // $FlowFixMe[incompatible-type]: While plain JSON can return undefined we never do here.
          var partJSON = JSON.stringify(entry.value, resolveToJSON);
          data.append(formFieldPrefix + streamId, partJSON);
          reader.read().then(progress, reject);
        } catch (x) {
          reject(x);
        }
      }
    }
    reader.read().then(progress, reject);
    return '$R' + streamId.toString(16);
  }
  function serializeReadableStream(stream) {
    // Detect if this is a BYOB stream. BYOB streams should be able to be read as bytes on the
    // receiving side. For binary streams, we serialize them as plain Blobs.
    var binaryReader;
    try {
      // $FlowFixMe[extra-arg]: This argument is accepted.
      binaryReader = stream.getReader({
        mode: 'byob'
      });
    } catch (x) {
      return serializeReader(stream.getReader());
    }
    return serializeBinaryReader(binaryReader);
  }
  function serializeAsyncIterable(iterable, iterator) {
    if (formData === null) {
      // Upgrade to use FormData to allow us to stream this value.
      formData = new FormData();
    }
    var data = formData;
    pendingParts++;
    var streamId = nextPartId++;

    // Generators/Iterators are Iterables but they're also their own iterator
    // functions. If that's the case, we treat them as single-shot. Otherwise,
    // we assume that this iterable might be a multi-shot and allow it to be
    // iterated more than once on the receiving server.
    var isIterator = iterable === iterator;

    // There's a race condition between when the stream is aborted and when the promise
    // resolves so we track whether we already aborted it to avoid writing twice.
    function progress(entry) {
      if (entry.done) {
        if (entry.value === undefined) {
          data.append(formFieldPrefix + streamId, 'C'); // Close signal
        } else {
          // Unlike streams, the last value may not be undefined. If it's not
          // we outline it and encode a reference to it in the closing instruction.
          try {
            // $FlowFixMe[incompatible-type]: While plain JSON can return undefined we never do here.
            var partJSON = JSON.stringify(entry.value, resolveToJSON);
            data.append(formFieldPrefix + streamId, 'C' + partJSON); // Close signal
          } catch (x) {
            reject(x);
            return;
          }
        }
        pendingParts--;
        if (pendingParts === 0) {
          resolve(data);
        }
      } else {
        try {
          // $FlowFixMe[incompatible-type]: While plain JSON can return undefined we never do here.
          var _partJSON = JSON.stringify(entry.value, resolveToJSON);
          data.append(formFieldPrefix + streamId, _partJSON);
          iterator.next().then(progress, reject);
        } catch (x) {
          reject(x);
          return;
        }
      }
    }
    iterator.next().then(progress, reject);
    return '$' + (isIterator ? 'x' : 'X') + streamId.toString(16);
  }
  function resolveToJSON(key, value) {
    var parent = this;
    {
      if (key === __PROTO__$1) {
        console.error('Expected not to serialize an object with own property `__proto__`. When parsed this property will be omitted.%s', describeObjectForErrorMessage(parent, key));
      }
    }

    // Make sure that `parent[key]` wasn't JSONified before `value` was passed to us
    {
      // $FlowFixMe[incompatible-use]
      var originalValue = parent[key];
      if (typeof originalValue === 'object' && originalValue !== value && !(originalValue instanceof Date)) {
        if (objectName(originalValue) !== 'Object') {
          console.error('Only plain objects can be passed to Server Functions from the Client. ' + '%s objects are not supported.%s', objectName(originalValue), describeObjectForErrorMessage(parent, key));
        } else {
          console.error('Only plain objects can be passed to Server Functions from the Client. ' + 'Objects with toJSON methods are not supported. Convert it manually ' + 'to a simple value before passing it to props.%s', describeObjectForErrorMessage(parent, key));
        }
      }
    }
    if (value === null) {
      return null;
    }
    if (typeof value === 'object') {
      switch (value.$$typeof) {
        case REACT_ELEMENT_TYPE:
          {
            if (temporaryReferences !== undefined && key.indexOf(':') === -1) {
              // TODO: If the property name contains a colon, we don't dedupe. Escape instead.
              var parentReference = writtenObjects.get(parent);
              if (parentReference !== undefined) {
                // If the parent has a reference, we can refer to this object indirectly
                // through the property name inside that parent.
                var reference = parentReference + ':' + key;
                // Store this object so that the server can refer to it later in responses.
                writeTemporaryReference(temporaryReferences, reference, value);
                return serializeTemporaryReferenceMarker();
              }
            }
            // This element is the root of a serializeModel call (e.g. JSX
            // passed directly to encodeReply, or a promise that resolved to
            // JSX). It was already registered as a temporary reference by
            // serializeModel so we just need to emit the marker.
            if (temporaryReferences !== undefined && modelRoot === value) {
              modelRoot = null;
              return serializeTemporaryReferenceMarker();
            }
            throw new Error('React Element cannot be passed to Server Functions from the Client without a ' + 'temporary reference set. Pass a TemporaryReferenceSet to the options.' + (describeObjectForErrorMessage(parent, key) ));
          }
        case REACT_LAZY_TYPE:
          {
            // Resolve lazy as if it wasn't here. In the future this will be encoded as a Promise.
            var lazy = value;
            var payload = lazy._payload;
            var init = lazy._init;
            if (formData === null) {
              // Upgrade to use FormData to allow us to stream this value.
              formData = new FormData();
            }
            pendingParts++;
            try {
              var resolvedModel = init(payload);
              // We always outline this as a separate part even though we could inline it
              // because it ensures a more deterministic encoding.
              var lazyId = nextPartId++;
              var partJSON = serializeModel(resolvedModel, lazyId);
              // $FlowFixMe[incompatible-type] We know it's not null because we assigned it above.
              var data = formData;
              data.append(formFieldPrefix + lazyId, partJSON);
              return serializeByValueID(lazyId);
            } catch (x) {
              if (typeof x === 'object' && x !== null && typeof x.then === 'function') {
                // Suspended
                pendingParts++;
                var _lazyId = nextPartId++;
                var thenable = x;
                var retry = function () {
                  // While the first promise resolved, its value isn't necessarily what we'll
                  // resolve into because we might suspend again.
                  try {
                    var _partJSON2 = serializeModel(value, _lazyId);
                    // $FlowFixMe[incompatible-type] We know it's not null because we assigned it above.
                    var _data = formData;
                    _data.append(formFieldPrefix + _lazyId, _partJSON2);
                    pendingParts--;
                    if (pendingParts === 0) {
                      resolve(_data);
                    }
                  } catch (reason) {
                    reject(reason);
                  }
                };
                thenable.then(retry, retry);
                return serializeByValueID(_lazyId);
              } else {
                // In the future we could consider serializing this as an error
                // that throws on the server instead.
                reject(x);
                return null;
              }
            } finally {
              pendingParts--;
            }
          }
      }
      var existingReference = writtenObjects.get(value);

      // $FlowFixMe[method-unbinding]
      if (typeof value.then === 'function') {
        if (existingReference !== undefined) {
          if (modelRoot === value) {
            // This is the ID we're currently emitting so we need to write it
            // once but if we discover it again, we refer to it by id.
            modelRoot = null;
          } else {
            // We've already emitted this as an outlined object, so we can
            // just refer to that by its existing ID.
            return existingReference;
          }
        }

        // We assume that any object with a .then property is a "Thenable" type,
        // or a Promise type. Either of which can be represented by a Promise.
        if (formData === null) {
          // Upgrade to use FormData to allow us to stream this value.
          formData = new FormData();
        }
        pendingParts++;
        var promiseId = nextPartId++;
        var promiseReference = serializePromiseID(promiseId);
        writtenObjects.set(value, promiseReference);
        var _thenable = value;
        _thenable.then(function (partValue) {
          try {
            var previousReference = writtenObjects.get(partValue);
            var _partJSON3;
            if (previousReference !== undefined) {
              _partJSON3 = JSON.stringify(previousReference);
            } else {
              _partJSON3 = serializeModel(partValue, promiseId);
            }
            // $FlowFixMe[incompatible-type] We know it's not null because we assigned it above.
            var _data2 = formData;
            _data2.append(formFieldPrefix + promiseId, _partJSON3);
            pendingParts--;
            if (pendingParts === 0) {
              resolve(_data2);
            }
          } catch (reason) {
            reject(reason);
          }
        },
        // In the future we could consider serializing this as an error
        // that throws on the server instead.
        reject);
        return promiseReference;
      }
      if (existingReference !== undefined) {
        if (modelRoot === value) {
          // This is the ID we're currently emitting so we need to write it
          // once but if we discover it again, we refer to it by id.
          modelRoot = null;
        } else {
          // We've already emitted this as an outlined object, so we can
          // just refer to that by its existing ID.
          return existingReference;
        }
      } else if (key.indexOf(':') === -1) {
        // TODO: If the property name contains a colon, we don't dedupe. Escape instead.
        var _parentReference = writtenObjects.get(parent);
        if (_parentReference !== undefined) {
          // If the parent has a reference, we can refer to this object indirectly
          // through the property name inside that parent.
          var _reference = _parentReference + ':' + key;
          writtenObjects.set(value, _reference);
          if (temporaryReferences !== undefined) {
            // Store this object so that the server can refer to it later in responses.
            writeTemporaryReference(temporaryReferences, _reference, value);
          }
        }
      }
      if (isArray(value)) {
        // $FlowFixMe[incompatible-return]
        return value;
      }
      // TODO: Should we the Object.prototype.toString.call() to test for cross-realm objects?
      if (value instanceof FormData) {
        if (formData === null) {
          // Upgrade to use FormData to allow us to use rich objects as its values.
          formData = new FormData();
        }
        var _data3 = formData;
        var refId = nextPartId++;
        // Copy all the form fields with a prefix for this reference.
        // These must come first in the form order because we assume that all the
        // fields are available before this is referenced.
        var prefix = formFieldPrefix + refId + '_';
        // $FlowFixMe[prop-missing]: FormData has forEach.
        value.forEach(function (originalValue, originalKey) {
          // $FlowFixMe[incompatible-call]
          _data3.append(prefix + originalKey, originalValue);
        });
        return serializeFormDataReference(refId);
      }
      if (value instanceof Map) {
        var mapId = nextPartId++;
        var _partJSON4 = serializeModel(Array.from(value), mapId);
        if (formData === null) {
          formData = new FormData();
        }
        formData.append(formFieldPrefix + mapId, _partJSON4);
        return serializeMapID(mapId);
      }
      if (value instanceof Set) {
        var setId = nextPartId++;
        var _partJSON5 = serializeModel(Array.from(value), setId);
        if (formData === null) {
          formData = new FormData();
        }
        formData.append(formFieldPrefix + setId, _partJSON5);
        return serializeSetID(setId);
      }
      if (value instanceof ArrayBuffer) {
        var blob = new Blob([value]);
        var blobId = nextPartId++;
        if (formData === null) {
          formData = new FormData();
        }
        formData.append(formFieldPrefix + blobId, blob);
        return '$' + 'A' + blobId.toString(16);
      }
      if (value instanceof Int8Array) {
        // char
        return serializeTypedArray('O', value);
      }
      if (value instanceof Uint8Array) {
        // unsigned char
        return serializeTypedArray('o', value);
      }
      if (value instanceof Uint8ClampedArray) {
        // unsigned clamped char
        return serializeTypedArray('U', value);
      }
      if (value instanceof Int16Array) {
        // sort
        return serializeTypedArray('S', value);
      }
      if (value instanceof Uint16Array) {
        // unsigned short
        return serializeTypedArray('s', value);
      }
      if (value instanceof Int32Array) {
        // long
        return serializeTypedArray('L', value);
      }
      if (value instanceof Uint32Array) {
        // unsigned long
        return serializeTypedArray('l', value);
      }
      if (value instanceof Float32Array) {
        // float
        return serializeTypedArray('G', value);
      }
      if (value instanceof Float64Array) {
        // double
        return serializeTypedArray('g', value);
      }
      if (value instanceof BigInt64Array) {
        // number
        return serializeTypedArray('M', value);
      }
      if (value instanceof BigUint64Array) {
        // unsigned number
        // We use "m" instead of "n" since JSON can start with "null"
        return serializeTypedArray('m', value);
      }
      if (value instanceof DataView) {
        return serializeTypedArray('V', value);
      }
      // TODO: Blob is not available in old Node/browsers. Remove the typeof check later.
      if (typeof Blob === 'function' && value instanceof Blob) {
        if (formData === null) {
          formData = new FormData();
        }
        var _blobId = nextPartId++;
        formData.append(formFieldPrefix + _blobId, value);
        return serializeBlobID(_blobId);
      }
      var iteratorFn = getIteratorFn(value);
      if (iteratorFn) {
        var iterator = iteratorFn.call(value);
        if (iterator === value) {
          // Iterator, not Iterable
          var iteratorId = nextPartId++;
          var _partJSON6 = serializeModel(Array.from(iterator), iteratorId);
          if (formData === null) {
            formData = new FormData();
          }
          formData.append(formFieldPrefix + iteratorId, _partJSON6);
          return serializeIteratorID(iteratorId);
        }
        return Array.from(iterator);
      }

      // TODO: ReadableStream is not available in old Node. Remove the typeof check later.
      if (typeof ReadableStream === 'function' && value instanceof ReadableStream) {
        return serializeReadableStream(value);
      }
      var getAsyncIterator = value[ASYNC_ITERATOR];
      if (typeof getAsyncIterator === 'function') {
        // We treat AsyncIterables as a Fragment and as such we might need to key them.
        return serializeAsyncIterable(value, getAsyncIterator.call(value));
      }

      // Verify that this is a simple plain object.
      var proto = getPrototypeOf(value);
      if (proto !== ObjectPrototype && (proto === null || getPrototypeOf(proto) !== null)) {
        if (temporaryReferences === undefined) {
          throw new Error('Only plain objects, and a few built-ins, can be passed to Server Functions. ' + 'Classes or null prototypes are not supported.' + (describeObjectForErrorMessage(parent, key) ));
        }
        // We will have written this object to the temporary reference set above
        // so we can replace it with a marker to refer to this slot later.
        return serializeTemporaryReferenceMarker();
      }
      {
        if (value.$$typeof === REACT_CONTEXT_TYPE) {
          console.error('React Context Providers cannot be passed to Server Functions from the Client.%s', describeObjectForErrorMessage(parent, key));
        } else if (objectName(value) !== 'Object') {
          console.error('Only plain objects can be passed to Server Functions from the Client. ' + '%s objects are not supported.%s', objectName(value), describeObjectForErrorMessage(parent, key));
        } else if (!isSimpleObject(value)) {
          console.error('Only plain objects can be passed to Server Functions from the Client. ' + 'Classes or other objects with methods are not supported.%s', describeObjectForErrorMessage(parent, key));
        } else if (Object.getOwnPropertySymbols) {
          var symbols = Object.getOwnPropertySymbols(value);
          if (symbols.length > 0) {
            console.error('Only plain objects can be passed to Server Functions from the Client. ' + 'Objects with symbol properties like %s are not supported.%s', symbols[0].description, describeObjectForErrorMessage(parent, key));
          }
        }
      }

      // $FlowFixMe[incompatible-return]
      return value;
    }
    if (typeof value === 'string') {
      // TODO: Maybe too clever. If we support URL there's no similar trick.
      if (value[value.length - 1] === 'Z') {
        // Possibly a Date, whose toJSON automatically calls toISOString
        // $FlowFixMe[incompatible-use]
        var _originalValue = parent[key];
        if (_originalValue instanceof Date) {
          return serializeDateFromDateJSON(value);
        }
      }
      return escapeStringValue(value);
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return serializeNumber(value);
    }
    if (typeof value === 'undefined') {
      return serializeUndefined();
    }
    if (typeof value === 'function') {
      var referenceClosure = knownServerReferences.get(value);
      if (referenceClosure !== undefined) {
        var _existingReference = writtenObjects.get(value);
        if (_existingReference !== undefined) {
          return _existingReference;
        }
        var id = referenceClosure.id,
          bound = referenceClosure.bound;
        var referenceClosureJSON = JSON.stringify({
          id: id,
          bound: bound
        }, resolveToJSON);
        if (formData === null) {
          // Upgrade to use FormData to allow us to stream this value.
          formData = new FormData();
        }
        // The reference to this function came from the same client so we can pass it back.
        var _refId = nextPartId++;
        formData.set(formFieldPrefix + _refId, referenceClosureJSON);
        var serverReferenceId = serializeServerReferenceID(_refId);
        // Store the server reference ID for deduplication.
        writtenObjects.set(value, serverReferenceId);
        return serverReferenceId;
      }
      if (temporaryReferences !== undefined && key.indexOf(':') === -1) {
        // TODO: If the property name contains a colon, we don't dedupe. Escape instead.
        var _parentReference2 = writtenObjects.get(parent);
        if (_parentReference2 !== undefined) {
          // If the parent has a reference, we can refer to this object indirectly
          // through the property name inside that parent.
          var _reference2 = _parentReference2 + ':' + key;
          // Store this object so that the server can refer to it later in responses.
          writeTemporaryReference(temporaryReferences, _reference2, value);
          return serializeTemporaryReferenceMarker();
        }
      }
      throw new Error('Client Functions cannot be passed directly to Server Functions. ' + 'Only Functions passed from the Server can be passed back again.');
    }
    if (typeof value === 'symbol') {
      if (temporaryReferences !== undefined && key.indexOf(':') === -1) {
        // TODO: If the property name contains a colon, we don't dedupe. Escape instead.
        var _parentReference3 = writtenObjects.get(parent);
        if (_parentReference3 !== undefined) {
          // If the parent has a reference, we can refer to this object indirectly
          // through the property name inside that parent.
          var _reference3 = _parentReference3 + ':' + key;
          // Store this object so that the server can refer to it later in responses.
          writeTemporaryReference(temporaryReferences, _reference3, value);
          return serializeTemporaryReferenceMarker();
        }
      }
      throw new Error('Symbols cannot be passed to a Server Function without a ' + 'temporary reference set. Pass a TemporaryReferenceSet to the options.' + (describeObjectForErrorMessage(parent, key) ));
    }
    if (typeof value === 'bigint') {
      return serializeBigInt(value);
    }
    throw new Error("Type " + typeof value + " is not supported as an argument to a Server Function.");
  }
  function serializeModel(model, id) {
    if (typeof model === 'object' && model !== null) {
      var reference = serializeByValueID(id);
      writtenObjects.set(model, reference);
      if (temporaryReferences !== undefined) {
        // Store this object so that the server can refer to it later in responses.
        writeTemporaryReference(temporaryReferences, reference, model);
      }
    }
    modelRoot = model;
    // $FlowFixMe[incompatible-return] it's not going to be undefined because we'll encode it.
    return JSON.stringify(model, resolveToJSON);
  }
  function abort(reason) {
    if (pendingParts > 0) {
      pendingParts = 0; // Don't resolve again later.
      // Resolve with what we have so far, which may have holes at this point.
      // They'll error when the stream completes on the server.
      if (formData === null) {
        resolve(json);
      } else {
        resolve(formData);
      }
    }
  }
  var json = serializeModel(root, 0);
  if (formData === null) {
    // If it's a simple data structure, we just use plain JSON.
    resolve(json);
  } else {
    // Otherwise, we use FormData to let us stream in the result.
    formData.set(formFieldPrefix + '0', json);
    if (pendingParts === 0) {
      // $FlowFixMe[incompatible-call] this has already been refined.
      resolve(formData);
    }
  }
  return abort;
}
var fakeServerFunctionIdx = 0;
function createFakeServerFunction(name, filename, sourceMap, line, col, environmentName, innerFunction) {
  // This creates a fake copy of a Server Module. It represents the Server Action on the server.
  // We use an eval so we can source map it to the original location.

  var comment = '/* This module is a proxy to a Server Action. Turn on Source Maps to see the server source. */';
  if (!name) {
    // An eval:ed function with no name gets the name "eval". We give it something more descriptive.
    name = '<anonymous>';
  }
  var encodedName = JSON.stringify(name);
  // We generate code where both the beginning of the function and its parenthesis is at the line
  // and column of the server executed code. We use a method form since that lets us name it
  // anything we want and because the beginning of the function and its parenthesis is the same
  // column. Because Chrome inspects the location of the parenthesis and Firefox inspects the
  // location of the beginning of the function. By not using a function expression we avoid the
  // ambiguity.
  var code;
  if (line <= 1) {
    var minSize = encodedName.length + 7;
    code = 's=>({' + encodedName + ' '.repeat(col < minSize ? 0 : col - minSize) + ':' + '(...args) => s(...args)' + '})\n' + comment;
  } else {
    code = comment + '\n'.repeat(line - 2) + 'server=>({' + encodedName + ':\n' + ' '.repeat(col < 1 ? 0 : col - 1) +
    // The function body can get printed so we make it look nice.
    // This "calls the server with the arguments".
    '(...args) => server(...args)' + '})';
  }
  if (filename.startsWith('/')) {
    // If the filename starts with `/` we assume that it is a file system file
    // rather than relative to the current host. Since on the server fully qualified
    // stack traces use the file path.
    // TODO: What does this look like on Windows?
    filename = 'file://' + filename;
  }
  if (sourceMap) {
    // We use the prefix about://React/ to separate these from other files listed in
    // the Chrome DevTools. We need a "host name" and not just a protocol because
    // otherwise the group name becomes the root folder. Ideally we don't want to
    // show these at all but there's two reasons to assign a fake URL.
    // 1) A printed stack trace string needs a unique URL to be able to source map it.
    // 2) If source maps are disabled or fails, you should at least be able to tell
    //    which file it was.
    code += '\n//# sourceURL=about://React/' + encodeURIComponent(environmentName) + '/' + encodeURI(filename) + '?s' +
    // We add an extra s here to distinguish from the fake stack frames
    fakeServerFunctionIdx++;
    code += '\n//# sourceMappingURL=' + sourceMap;
  } else if (filename) {
    code += '\n//# sourceURL=' + filename;
  }
  try {
    // Eval a factory and then call it to create a closure over the inner function.
    // eslint-disable-next-line no-eval
    return (0, eval)(code)(innerFunction)[name];
  } catch (x) {
    // If eval fails, such as if in an environment that doesn't support it,
    // we fallback to just returning the inner function.
    return innerFunction;
  }
}
function registerBoundServerReference(reference, id, bound, encodeFormAction) {
  if (knownServerReferences.has(reference)) {
    return;
  }
  knownServerReferences.set(reference, {
    id: id,
    originalBind: reference.bind,
    bound: bound
  });
}
function registerServerReference(reference, id, encodeFormAction) {
  registerBoundServerReference(reference, id, null);
  return reference;
}
function createBoundServerReference(metaData, callServer, encodeFormAction, findSourceMapURL // DEV-only
) {
  var id = metaData.id;
  var bound = metaData.bound;
  var action = function () {
    // $FlowFixMe[method-unbinding]
    var args = Array.prototype.slice.call(arguments);
    var p = bound;
    if (!p) {
      return callServer(id, args);
    }
    if (p.status === 'fulfilled') {
      var boundArgs = p.value;
      return callServer(id, boundArgs.concat(args));
    }
    // Since this is a fake Promise whose .then doesn't chain, we have to wrap it.
    // TODO: Remove the wrapper once that's fixed.
    return Promise.resolve(p).then(function (boundArgs) {
      return callServer(id, boundArgs.concat(args));
    });
  };
  {
    var location = metaData.location;
    if (location) {
      var functionName = metaData.name || '';
      var filename = location[1],
        line = location[2],
        col = location[3];
      var env = metaData.env || 'Server';
      var sourceMap = findSourceMapURL == null ? null : findSourceMapURL(filename, env);
      action = createFakeServerFunction(functionName, filename, sourceMap, line, col, env, action);
    }
  }
  registerBoundServerReference(action, id, bound);
  return action;
}

// This matches either of these V8 formats.
//     at name (filename:0:0)
//     at filename:0:0
//     at async filename:0:0
var v8FrameRegExp = /^ {3} at (?:(.+) \((.+):(\d+):(\d+)\)|(?:async )?(.+):(\d+):(\d+))$/;
// This matches either of these JSC/SpiderMonkey formats.
// name@filename:0:0
// filename:0:0
var jscSpiderMonkeyFrameRegExp = /(?:(.*)@)?(.*):(\d+):(\d+)/;
function parseStackLocation(error) {
  // This parsing is special in that we know that the calling function will always
  // be a module that initializes the server action. We also need this part to work
  // cross-browser so not worth a Config. It's DEV only so not super code size
  // sensitive but also a non-essential feature.
  var stack = error.stack;
  if (stack.startsWith('Error: react-stack-top-frame\n')) {
    // V8's default formatting prefixes with the error message which we
    // don't want/need.
    stack = stack.slice(29);
  }
  var endOfFirst = stack.indexOf('\n');
  var secondFrame;
  if (endOfFirst !== -1) {
    // Skip the first frame.
    var endOfSecond = stack.indexOf('\n', endOfFirst + 1);
    if (endOfSecond === -1) {
      secondFrame = stack.slice(endOfFirst + 1);
    } else {
      secondFrame = stack.slice(endOfFirst + 1, endOfSecond);
    }
  } else {
    secondFrame = stack;
  }
  var parsed = v8FrameRegExp.exec(secondFrame);
  if (!parsed) {
    parsed = jscSpiderMonkeyFrameRegExp.exec(secondFrame);
    if (!parsed) {
      return null;
    }
  }
  var name = parsed[1] || '';
  if (name === '<anonymous>') {
    name = '';
  }
  var filename = parsed[2] || parsed[5] || '';
  if (filename === '<anonymous>') {
    filename = '';
  }
  // This is really the enclosingLine/Column.
  var line = +(parsed[3] || parsed[6]);
  var col = +(parsed[4] || parsed[7]);
  return [name, filename, line, col];
}
function createServerReference(id, callServer, encodeFormAction, findSourceMapURL,
// DEV-only
functionName) {
  var action = function () {
    // $FlowFixMe[method-unbinding]
    var args = Array.prototype.slice.call(arguments);
    return callServer(id, args);
  };
  {
    // Let's see if we can find a source map for the file which contained the
    // server action. We extract it from the runtime so that it's resilient to
    // multiple passes of compilation as long as we can find the final source map.
    var location = parseStackLocation(new Error('react-stack-top-frame'));
    if (location !== null) {
      var filename = location[1],
        line = location[2],
        col = location[3]; // While the environment that the Server Reference points to can be
      // in any environment, what matters here is where the compiled source
      // is from and that's in the currently executing environment. We hard
      // code that as the value "Client" in case the findSourceMapURL helper
      // needs it.
      var env = 'Client';
      var sourceMap = findSourceMapURL == null ? null : findSourceMapURL(filename, env);
      action = createFakeServerFunction(functionName || '', filename, sourceMap, line, col, env, action);
    }
  }
  registerBoundServerReference(action, id, null);
  return action;
}

var OMITTED_PROP_ERROR = 'This object has been omitted by React in the console log ' + 'to avoid sending too much data from the server. Try logging smaller ' + 'or more specific objects.';

// $FlowFixMe[method-unbinding]
var hasOwnProperty = Object.prototype.hasOwnProperty;

// Keep in sync with react-reconciler/getComponentNameFromFiber
function getWrappedName(outerType, innerType, wrapperName) {
  var displayName = outerType.displayName;
  if (displayName) {
    return displayName;
  }
  var functionName = innerType.displayName || innerType.name || '';
  return functionName !== '' ? wrapperName + "(" + functionName + ")" : wrapperName;
}

// Keep in sync with react-reconciler/getComponentNameFromFiber
function getContextName(type) {
  return type.displayName || 'Context';
}
var REACT_CLIENT_REFERENCE = Symbol.for('react.client.reference');

// Note that the reconciler package should generally prefer to use getComponentNameFromFiber() instead.
function getComponentNameFromType(type) {
  if (type == null) {
    // Host root, text node or just invalid type.
    return null;
  }
  if (typeof type === 'function') {
    if (type.$$typeof === REACT_CLIENT_REFERENCE) {
      // TODO: Create a convention for naming client references with debug info.
      return null;
    }
    return type.displayName || type.name || null;
  }
  if (typeof type === 'string') {
    return type;
  }
  switch (type) {
    case REACT_FRAGMENT_TYPE:
      return 'Fragment';
    case REACT_PROFILER_TYPE:
      return 'Profiler';
    case REACT_STRICT_MODE_TYPE:
      return 'StrictMode';
    case REACT_SUSPENSE_TYPE:
      return 'Suspense';
    case REACT_SUSPENSE_LIST_TYPE:
      return 'SuspenseList';
    case REACT_ACTIVITY_TYPE:
      return 'Activity';
    case REACT_VIEW_TRANSITION_TYPE:
      {
        return 'ViewTransition';
      }
  }
  if (typeof type === 'object') {
    {
      if (typeof type.tag === 'number') {
        console.error('Received an unexpected object in getComponentNameFromType(). ' + 'This is likely a bug in React. Please file an issue.');
      }
    }
    switch (type.$$typeof) {
      case REACT_PORTAL_TYPE:
        return 'Portal';
      case REACT_CONTEXT_TYPE:
        var context = type;
        return getContextName(context);
      case REACT_CONSUMER_TYPE:
        var consumer = type;
        return getContextName(consumer._context) + '.Consumer';
      case REACT_FORWARD_REF_TYPE:
        return getWrappedName(type, type.render, 'ForwardRef');
      case REACT_MEMO_TYPE:
        var outerName = type.displayName || null;
        if (outerName !== null) {
          return outerName;
        }
        return getComponentNameFromType(type.type) || 'Memo';
      case REACT_LAZY_TYPE:
        {
          var lazyComponent = type;
          var payload = lazyComponent._payload;
          var init = lazyComponent._init;
          try {
            return getComponentNameFromType(init(payload));
          } catch (x) {
            return null;
          }
        }
    }
  }
  return null;
}

var EMPTY_ARRAY = 0;
var COMPLEX_ARRAY = 1;
var PRIMITIVE_ARRAY = 2; // Primitive values only that are accepted by JSON.stringify
var ENTRIES_ARRAY = 3; // Tuple arrays of string and value (like Headers, Map, etc)

// Showing wider objects in the devtools is not useful.
var OBJECT_WIDTH_LIMIT = 100;
function getArrayKind(array) {
  var kind = EMPTY_ARRAY;
  for (var i = 0; i < array.length && i < OBJECT_WIDTH_LIMIT; i++) {
    var value = array[i];
    if (typeof value === 'object' && value !== null) {
      if (isArray(value) && value.length === 2 && typeof value[0] === 'string') {
        // Key value tuple
        if (kind !== EMPTY_ARRAY && kind !== ENTRIES_ARRAY) {
          return COMPLEX_ARRAY;
        }
        kind = ENTRIES_ARRAY;
      } else {
        return COMPLEX_ARRAY;
      }
    } else if (typeof value === 'function') {
      return COMPLEX_ARRAY;
    } else if (typeof value === 'string' && value.length > 50) {
      return COMPLEX_ARRAY;
    } else if (kind !== EMPTY_ARRAY && kind !== PRIMITIVE_ARRAY) {
      return COMPLEX_ARRAY;
    } else if (typeof value === 'bigint') {
      return COMPLEX_ARRAY;
    } else {
      kind = PRIMITIVE_ARRAY;
    }
  }
  return kind;
}
function addObjectToProperties(object, properties, indent, prefix) {
  var addedProperties = 0;
  for (var key in object) {
    if (hasOwnProperty.call(object, key) && key[0] !== '_') {
      addedProperties++;
      var value = object[key];
      addValueToProperties(key, value, properties, indent, prefix);
      if (addedProperties >= OBJECT_WIDTH_LIMIT) {
        properties.push([prefix + '\xa0\xa0'.repeat(indent) + 'Only ' + OBJECT_WIDTH_LIMIT + ' properties are shown. React will not log more properties of this object.', '']);
        break;
      }
    }
  }
}
function readReactElementTypeof(value) {
  // Prevents dotting into $$typeof in opaque origin windows.
  return '$$typeof' in value && hasOwnProperty.call(value, '$$typeof') ? value.$$typeof : undefined;
}
function addValueToProperties(propertyName, value, properties, indent, prefix) {
  var desc;
  switch (typeof value) {
    case 'object':
      if (value === null) {
        desc = 'null';
        break;
      } else {
        if (readReactElementTypeof(value) === REACT_ELEMENT_TYPE) {
          // JSX
          var typeName = getComponentNameFromType(value.type) || "\u2026";
          var key = value.key;
          var props = value.props;
          var propsKeys = Object.keys(props);
          var propsLength = propsKeys.length;
          if (key == null && propsLength === 0) {
            desc = '<' + typeName + ' />';
            break;
          }
          if (indent < 3 || propsLength === 1 && propsKeys[0] === 'children' && key == null) {
            desc = '<' + typeName + " \u2026 />";
            break;
          }
          properties.push([prefix + '\xa0\xa0'.repeat(indent) + propertyName, '<' + typeName]);
          if (key !== null) {
            addValueToProperties('key', key, properties, indent + 1, prefix);
          }
          var hasChildren = false;
          var addedProperties = 0;
          for (var propKey in props) {
            addedProperties++;
            if (propKey === 'children') {
              if (props.children != null && (!isArray(props.children) || props.children.length > 0)) {
                hasChildren = true;
              }
            } else if (hasOwnProperty.call(props, propKey) && propKey[0] !== '_') {
              addValueToProperties(propKey, props[propKey], properties, indent + 1, prefix);
            }
            if (addedProperties >= OBJECT_WIDTH_LIMIT) {
              break;
            }
          }
          properties.push(['', hasChildren ? ">\u2026</" + typeName + '>' : '/>']);
          return;
        }
        // $FlowFixMe[method-unbinding]
        var objectToString = Object.prototype.toString.call(value);
        var objectName = objectToString.slice(8, objectToString.length - 1);
        if (objectName === 'Array') {
          var array = value;
          var didTruncate = array.length > OBJECT_WIDTH_LIMIT;
          var kind = getArrayKind(array);
          if (kind === PRIMITIVE_ARRAY || kind === EMPTY_ARRAY) {
            desc = JSON.stringify(didTruncate ? array.slice(0, OBJECT_WIDTH_LIMIT).concat('…') : array);
            break;
          } else if (kind === ENTRIES_ARRAY) {
            properties.push([prefix + '\xa0\xa0'.repeat(indent) + propertyName, '']);
            for (var i = 0; i < array.length && i < OBJECT_WIDTH_LIMIT; i++) {
              var entry = array[i];
              addValueToProperties(entry[0], entry[1], properties, indent + 1, prefix);
            }
            if (didTruncate) {
              addValueToProperties(OBJECT_WIDTH_LIMIT.toString(), '…', properties, indent + 1, prefix);
            }
            return;
          }
        }
        if (objectName === 'Promise') {
          if (value.status === 'fulfilled') {
            // Print the inner value
            var idx = properties.length;
            addValueToProperties(propertyName, value.value, properties, indent, prefix);
            if (properties.length > idx) {
              // Wrap the value or type in Promise descriptor.
              var insertedEntry = properties[idx];
              insertedEntry[1] = 'Promise<' + (insertedEntry[1] || 'Object') + '>';
              return;
            }
          } else if (value.status === 'rejected') {
            // Print the inner error
            var _idx = properties.length;
            addValueToProperties(propertyName, value.reason, properties, indent, prefix);
            if (properties.length > _idx) {
              // Wrap the value or type in Promise descriptor.
              var _insertedEntry = properties[_idx];
              _insertedEntry[1] = 'Rejected Promise<' + _insertedEntry[1] + '>';
              return;
            }
          }
          properties.push(['\xa0\xa0'.repeat(indent) + propertyName, 'Promise']);
          return;
        }
        if (objectName === 'Object') {
          var proto = Object.getPrototypeOf(value);
          if (proto && typeof proto.constructor === 'function') {
            objectName = proto.constructor.name;
          }
        }
        properties.push([prefix + '\xa0\xa0'.repeat(indent) + propertyName, objectName === 'Object' ? indent < 3 ? '' : "\u2026" : objectName]);
        if (indent < 3) {
          addObjectToProperties(value, properties, indent + 1, prefix);
        }
        return;
      }
    case 'function':
      var functionName = value.name;
      if (functionName === '' ||
      // e.g. proxied functions or classes with a static property "name" that's not a string
      typeof functionName !== 'string') {
        desc = '() => {}';
      } else {
        desc = functionName + '() {}';
      }
      break;
    case 'string':
      if (value === OMITTED_PROP_ERROR) {
        desc = "\u2026"; // ellipsis
      } else {
        desc = JSON.stringify(value);
      }
      break;
    case 'undefined':
      desc = 'undefined';
      break;
    case 'boolean':
      desc = value ? 'true' : 'false';
      break;
    default:
      // eslint-disable-next-line react-internal/safe-string-coercion
      desc = String(value);
  }
  properties.push([prefix + '\xa0\xa0'.repeat(indent) + propertyName, desc]);
}

function getIODescription(value) {
  try {
    switch (typeof value) {
      case 'function':
        return value.name || '';
      case 'object':
        // Test the object for a bunch of common property names that are useful identifiers.
        // While we only have the return value here, it should ideally be a name that
        // describes the arguments requested.
        if (value === null) {
          return '';
        } else if (value instanceof Error) {
          // eslint-disable-next-line react-internal/safe-string-coercion
          return String(value.message);
        } else if (typeof value.url === 'string') {
          return value.url;
        } else if (typeof value.href === 'string') {
          return value.href;
        } else if (typeof value.src === 'string') {
          return value.src;
        } else if (typeof value.currentSrc === 'string') {
          return value.currentSrc;
        } else if (typeof value.command === 'string') {
          return value.command;
        } else if (typeof value.request === 'object' && value.request !== null && typeof value.request.url === 'string') {
          return value.request.url;
        } else if (typeof value.response === 'object' && value.response !== null && typeof value.response.url === 'string') {
          return value.response.url;
        } else if (typeof value.id === 'string' || typeof value.id === 'number' || typeof value.id === 'bigint') {
          // eslint-disable-next-line react-internal/safe-string-coercion
          return String(value.id);
        } else if (typeof value.name === 'string') {
          return value.name;
        } else {
          var str = value.toString();
          if (str.startsWith('[object ') || str.length < 5 || str.length > 500) {
            // This is probably not a useful description.
            return '';
          }
          return str;
        }
      case 'string':
        if (value.length < 5 || value.length > 500) {
          return '';
        }
        return value;
      case 'number':
      case 'bigint':
        // eslint-disable-next-line react-internal/safe-string-coercion
        return String(value);
      default:
        // Not useful descriptors.
        return '';
    }
  } catch (x) {
    return '';
  }
}

/* eslint-disable react-internal/no-production-logging */

var supportsUserTiming = typeof console !== 'undefined' && typeof console.timeStamp === 'function' && typeof performance !== 'undefined' &&
// $FlowFixMe[method-unbinding]
typeof performance.measure === 'function';
var IO_TRACK = 'Server Requests ⚛';
var COMPONENTS_TRACK = 'Server Components ⚛';
function markAllTracksInOrder() {
  if (supportsUserTiming) {
    // Ensure we create the Server Component track groups earlier than the Client Scheduler
    // and Client Components. We can always add the 0 time slot even if it's in the past.
    // That's still considered for ordering.
    console.timeStamp('Server Requests Track', 0.001, 0.001, IO_TRACK, undefined, 'primary-light');
    console.timeStamp('Server Components Track', 0.001, 0.001, 'Primary', COMPONENTS_TRACK, 'primary-light');
  }
}
var trackNames = ['Primary', 'Parallel', "Parallel\u200B",
// Padded with zero-width space to give each track a unique name.
"Parallel\u200B\u200B", "Parallel\u200B\u200B\u200B", "Parallel\u200B\u200B\u200B\u200B", "Parallel\u200B\u200B\u200B\u200B\u200B", "Parallel\u200B\u200B\u200B\u200B\u200B\u200B", "Parallel\u200B\u200B\u200B\u200B\u200B\u200B\u200B", "Parallel\u200B\u200B\u200B\u200B\u200B\u200B\u200B\u200B"];
function logComponentRender(componentInfo, trackIdx, startTime, endTime, childrenEndTime, rootEnv) {
  if (supportsUserTiming && childrenEndTime >= 0 && trackIdx < 10) {
    var env = componentInfo.env;
    var name = componentInfo.name;
    var isPrimaryEnv = env === rootEnv;
    var selfTime = endTime - startTime;
    var color = selfTime < 0.5 ? isPrimaryEnv ? 'primary-light' : 'secondary-light' : selfTime < 50 ? isPrimaryEnv ? 'primary' : 'secondary' : selfTime < 500 ? isPrimaryEnv ? 'primary-dark' : 'secondary-dark' : 'error';
    var entryName = isPrimaryEnv || env === undefined ? name : name + ' [' + env + ']';
    var debugTask = componentInfo.debugTask;
    var measureName = "\u200B" + entryName;
    if (debugTask) {
      var properties = [];
      if (componentInfo.key != null) {
        addValueToProperties('key', componentInfo.key, properties, 0, '');
      }
      if (componentInfo.props != null) {
        addObjectToProperties(componentInfo.props, properties, 0, '');
      }
      debugTask.run(
      // $FlowFixMe[method-unbinding]
      performance.measure.bind(performance, measureName, {
        start: startTime < 0 ? 0 : startTime,
        end: childrenEndTime,
        detail: {
          devtools: {
            color: color,
            track: trackNames[trackIdx],
            trackGroup: COMPONENTS_TRACK,
            properties: properties
          }
        }
      }));
      performance.clearMeasures(measureName);
    } else {
      console.timeStamp(measureName, startTime < 0 ? 0 : startTime, childrenEndTime, trackNames[trackIdx], COMPONENTS_TRACK, color);
    }
  }
}
function logComponentAborted(componentInfo, trackIdx, startTime, endTime, childrenEndTime, rootEnv) {
  if (supportsUserTiming) {
    var env = componentInfo.env;
    var name = componentInfo.name;
    var isPrimaryEnv = env === rootEnv;
    var entryName = isPrimaryEnv || env === undefined ? name : name + ' [' + env + ']';
    var measureName = "\u200B" + entryName;
    {
      var properties = [['Aborted', 'The stream was aborted before this Component finished rendering.']];
      if (componentInfo.key != null) {
        addValueToProperties('key', componentInfo.key, properties, 0, '');
      }
      if (componentInfo.props != null) {
        addObjectToProperties(componentInfo.props, properties, 0, '');
      }
      performance.measure(measureName, {
        start: startTime < 0 ? 0 : startTime,
        end: childrenEndTime,
        detail: {
          devtools: {
            color: 'warning',
            track: trackNames[trackIdx],
            trackGroup: COMPONENTS_TRACK,
            tooltipText: entryName + ' Aborted',
            properties: properties
          }
        }
      });
      performance.clearMeasures(measureName);
    }
  }
}
function logComponentErrored(componentInfo, trackIdx, startTime, endTime, childrenEndTime, rootEnv, error) {
  if (supportsUserTiming) {
    var env = componentInfo.env;
    var name = componentInfo.name;
    var isPrimaryEnv = env === rootEnv;
    var entryName = isPrimaryEnv || env === undefined ? name : name + ' [' + env + ']';
    var measureName = "\u200B" + entryName;
    {
      var message = typeof error === 'object' && error !== null && typeof error.message === 'string' ?
      // eslint-disable-next-line react-internal/safe-string-coercion
      String(error.message) :
      // eslint-disable-next-line react-internal/safe-string-coercion
      String(error);
      var properties = [['Error', message]];
      if (componentInfo.key != null) {
        addValueToProperties('key', componentInfo.key, properties, 0, '');
      }
      if (componentInfo.props != null) {
        addObjectToProperties(componentInfo.props, properties, 0, '');
      }
      performance.measure(measureName, {
        start: startTime < 0 ? 0 : startTime,
        end: childrenEndTime,
        detail: {
          devtools: {
            color: 'error',
            track: trackNames[trackIdx],
            trackGroup: COMPONENTS_TRACK,
            tooltipText: entryName + ' Errored',
            properties: properties
          }
        }
      });
      performance.clearMeasures(measureName);
    }
  }
}
function logDedupedComponentRender(componentInfo, trackIdx, startTime, endTime, rootEnv) {
  if (supportsUserTiming && endTime >= 0 && trackIdx < 10) {
    var env = componentInfo.env;
    var name = componentInfo.name;
    var isPrimaryEnv = env === rootEnv;
    var color = isPrimaryEnv ? 'primary-light' : 'secondary-light';
    var entryName = name + ' [deduped]';
    var debugTask = componentInfo.debugTask;
    if (debugTask) {
      debugTask.run(
      // $FlowFixMe[method-unbinding]
      console.timeStamp.bind(console, entryName, startTime < 0 ? 0 : startTime, endTime, trackNames[trackIdx], COMPONENTS_TRACK, color));
    } else {
      console.timeStamp(entryName, startTime < 0 ? 0 : startTime, endTime, trackNames[trackIdx], COMPONENTS_TRACK, color);
    }
  }
}
function getIOColor(functionName) {
  // Add some color variation to be able to distinguish various sources.
  switch (functionName.charCodeAt(0) % 3) {
    case 0:
      return 'tertiary-light';
    case 1:
      return 'tertiary';
    default:
      return 'tertiary-dark';
  }
}
function getIOLongName(ioInfo, description, env, rootEnv) {
  var name = ioInfo.name;
  var longName = description === '' ? name : name + ' (' + description + ')';
  var isPrimaryEnv = env === rootEnv;
  return isPrimaryEnv || env === undefined ? longName : longName + ' [' + env + ']';
}
function getIOShortName(ioInfo, description, env, rootEnv) {
  var name = ioInfo.name;
  var isPrimaryEnv = env === rootEnv;
  var envSuffix = isPrimaryEnv || env === undefined ? '' : ' [' + env + ']';
  var desc = '';
  var descMaxLength = 30 - name.length - envSuffix.length;
  if (descMaxLength > 1) {
    var l = description.length;
    if (l > 0 && l <= descMaxLength) {
      // We can fit the full description
      desc = ' (' + description + ')';
    } else if (description.startsWith('http://') || description.startsWith('https://') || description.startsWith('/')) {
      // Looks like a URL. Let's see if we can extract something shorter.
      // We don't have to do a full parse so let's try something cheaper.
      var queryIdx = description.indexOf('?');
      if (queryIdx === -1) {
        queryIdx = description.length;
      }
      if (description.charCodeAt(queryIdx - 1) === 47 /* "/" */) {
        // Ends with slash. Look before that.
        queryIdx--;
      }
      var slashIdx = description.lastIndexOf('/', queryIdx - 1);
      if (queryIdx - slashIdx < descMaxLength) {
        // This may now be either the file name or the host.
        // Include the slash to make it more obvious what we trimmed.
        desc = ' (…' + description.slice(slashIdx, queryIdx) + ')';
      } else {
        // cut out the middle to not exceed the max length
        var start = description.slice(slashIdx, slashIdx + descMaxLength / 2);
        var end = description.slice(queryIdx - descMaxLength / 2, queryIdx);
        desc = ' (' + (slashIdx > 0 ? '…' : '') + start + '…' + end + ')';
      }
    }
  }
  return name + desc + envSuffix;
}
function logComponentAwaitAborted(asyncInfo, trackIdx, startTime, endTime, rootEnv) {
  if (supportsUserTiming && endTime > 0) {
    var entryName = 'await ' + getIOShortName(asyncInfo.awaited, '', asyncInfo.env, rootEnv);
    var debugTask = asyncInfo.debugTask || asyncInfo.awaited.debugTask;
    if (debugTask) {
      var properties = [['Aborted', 'The stream was aborted before this Promise resolved.']];
      var tooltipText = getIOLongName(asyncInfo.awaited, '', asyncInfo.env, rootEnv) + ' Aborted';
      debugTask.run(
      // $FlowFixMe[method-unbinding]
      performance.measure.bind(performance, entryName, {
        start: startTime < 0 ? 0 : startTime,
        end: endTime,
        detail: {
          devtools: {
            color: 'warning',
            track: trackNames[trackIdx],
            trackGroup: COMPONENTS_TRACK,
            properties: properties,
            tooltipText: tooltipText
          }
        }
      }));
      performance.clearMeasures(entryName);
    } else {
      console.timeStamp(entryName, startTime < 0 ? 0 : startTime, endTime, trackNames[trackIdx], COMPONENTS_TRACK, 'warning');
    }
  }
}
function logComponentAwaitErrored(asyncInfo, trackIdx, startTime, endTime, rootEnv, error) {
  if (supportsUserTiming && endTime > 0) {
    var description = getIODescription(error);
    var entryName = 'await ' + getIOShortName(asyncInfo.awaited, description, asyncInfo.env, rootEnv);
    var debugTask = asyncInfo.debugTask || asyncInfo.awaited.debugTask;
    if (debugTask) {
      var message = typeof error === 'object' && error !== null && typeof error.message === 'string' ?
      // eslint-disable-next-line react-internal/safe-string-coercion
      String(error.message) :
      // eslint-disable-next-line react-internal/safe-string-coercion
      String(error);
      var properties = [['Rejected', message]];
      var tooltipText = getIOLongName(asyncInfo.awaited, description, asyncInfo.env, rootEnv) + ' Rejected';
      debugTask.run(
      // $FlowFixMe[method-unbinding]
      performance.measure.bind(performance, entryName, {
        start: startTime < 0 ? 0 : startTime,
        end: endTime,
        detail: {
          devtools: {
            color: 'error',
            track: trackNames[trackIdx],
            trackGroup: COMPONENTS_TRACK,
            properties: properties,
            tooltipText: tooltipText
          }
        }
      }));
      performance.clearMeasures(entryName);
    } else {
      console.timeStamp(entryName, startTime < 0 ? 0 : startTime, endTime, trackNames[trackIdx], COMPONENTS_TRACK, 'error');
    }
  }
}
function logComponentAwait(asyncInfo, trackIdx, startTime, endTime, rootEnv, value) {
  if (supportsUserTiming && endTime > 0) {
    var description = getIODescription(value);
    var name = getIOShortName(asyncInfo.awaited, description, asyncInfo.env, rootEnv);
    var entryName = 'await ' + name;
    var color = getIOColor(name);
    var debugTask = asyncInfo.debugTask || asyncInfo.awaited.debugTask;
    if (debugTask) {
      var properties = [];
      if (typeof value === 'object' && value !== null) {
        addObjectToProperties(value, properties, 0, '');
      } else if (value !== undefined) {
        addValueToProperties('awaited value', value, properties, 0, '');
      }
      var tooltipText = getIOLongName(asyncInfo.awaited, description, asyncInfo.env, rootEnv);
      debugTask.run(
      // $FlowFixMe[method-unbinding]
      performance.measure.bind(performance, entryName, {
        start: startTime < 0 ? 0 : startTime,
        end: endTime,
        detail: {
          devtools: {
            color: color,
            track: trackNames[trackIdx],
            trackGroup: COMPONENTS_TRACK,
            properties: properties,
            tooltipText: tooltipText
          }
        }
      }));
      performance.clearMeasures(entryName);
    } else {
      console.timeStamp(entryName, startTime < 0 ? 0 : startTime, endTime, trackNames[trackIdx], COMPONENTS_TRACK, color);
    }
  }
}
function logIOInfoErrored(ioInfo, rootEnv, error) {
  var startTime = ioInfo.start;
  var endTime = ioInfo.end;
  if (supportsUserTiming && endTime >= 0) {
    var description = getIODescription(error);
    var entryName = getIOShortName(ioInfo, description, ioInfo.env, rootEnv);
    var debugTask = ioInfo.debugTask;
    var measureName = "\u200B" + entryName;
    if (debugTask) {
      var message = typeof error === 'object' && error !== null && typeof error.message === 'string' ?
      // eslint-disable-next-line react-internal/safe-string-coercion
      String(error.message) :
      // eslint-disable-next-line react-internal/safe-string-coercion
      String(error);
      var properties = [['rejected with', message]];
      var tooltipText = getIOLongName(ioInfo, description, ioInfo.env, rootEnv) + ' Rejected';
      debugTask.run(
      // $FlowFixMe[method-unbinding]
      performance.measure.bind(performance, measureName, {
        start: startTime < 0 ? 0 : startTime,
        end: endTime,
        detail: {
          devtools: {
            color: 'error',
            track: IO_TRACK,
            properties: properties,
            tooltipText: tooltipText
          }
        }
      }));
      performance.clearMeasures(measureName);
    } else {
      console.timeStamp(measureName, startTime < 0 ? 0 : startTime, endTime, IO_TRACK, undefined, 'error');
    }
  }
}
function logIOInfo(ioInfo, rootEnv, value) {
  var startTime = ioInfo.start;
  var endTime = ioInfo.end;
  if (supportsUserTiming && endTime >= 0) {
    var description = getIODescription(value);
    var entryName = getIOShortName(ioInfo, description, ioInfo.env, rootEnv);
    var color = getIOColor(entryName);
    var debugTask = ioInfo.debugTask;
    var measureName = "\u200B" + entryName;
    if (debugTask) {
      var properties = [];
      if (typeof value === 'object' && value !== null) {
        addObjectToProperties(value, properties, 0, '');
      } else if (value !== undefined) {
        addValueToProperties('Resolved', value, properties, 0, '');
      }
      var tooltipText = getIOLongName(ioInfo, description, ioInfo.env, rootEnv);
      debugTask.run(
      // $FlowFixMe[method-unbinding]
      performance.measure.bind(performance, measureName, {
        start: startTime < 0 ? 0 : startTime,
        end: endTime,
        detail: {
          devtools: {
            color: color,
            track: IO_TRACK,
            properties: properties,
            tooltipText: tooltipText
          }
        }
      }));
      performance.clearMeasures(measureName);
    } else {
      console.timeStamp(measureName, startTime < 0 ? 0 : startTime, endTime, IO_TRACK, undefined, color);
    }
  }
}

// This is forked in server builds where the default stack frame may be source mapped.

var DefaultPrepareStackTrace = undefined;

function formatOwnerStack(error) {
  var prevPrepareStackTrace = Error.prepareStackTrace;
  Error.prepareStackTrace = DefaultPrepareStackTrace;
  var stack = error.stack;
  Error.prepareStackTrace = prevPrepareStackTrace;
  if (stack.startsWith('Error: react-stack-top-frame\n')) {
    // V8's default formatting prefixes with the error message which we
    // don't want/need.
    stack = stack.slice(29);
  }
  var idx = stack.indexOf('\n');
  if (idx !== -1) {
    // Pop the JSX frame.
    stack = stack.slice(idx + 1);
  }
  idx = stack.indexOf('react_stack_bottom_frame');
  if (idx !== -1) {
    idx = stack.lastIndexOf('\n', idx);
  }
  if (idx !== -1) {
    // Cut off everything after the bottom frame since it'll be internals.
    stack = stack.slice(0, idx);
  } else {
    // We didn't find any internal callsite out to user space.
    // This means that this was called outside an owner or the owner is fully internal.
    // To keep things light we exclude the entire trace in this case.
    return '';
  }
  return stack;
}

var prefix;
var suffix;
function describeBuiltInComponentFrame(name) {
  if (prefix === undefined) {
    // Extract the VM specific prefix used by each line.
    try {
      throw Error();
    } catch (x) {
      var match = x.stack.trim().match(/\n( *(at )?)/);
      prefix = match && match[1] || '';
      suffix = x.stack.indexOf('\n    at') > -1 ?
      // V8
      ' (<anonymous>)' :
      // JSC/Spidermonkey
      x.stack.indexOf('@') > -1 ? '@unknown:0:0' :
      // Other
      '';
    }
  }
  // We use the prefix to ensure our stacks line up with native stack frames.
  return '\n' + prefix + name + suffix;
}
{
  var PossiblyWeakMap = typeof WeakMap === 'function' ? WeakMap : Map;
  new PossiblyWeakMap();
}

function getOwnerStackByComponentInfoInDev(componentInfo) {
  try {
    var info = '';

    // The owner stack of the current component will be where it was created, i.e. inside its owner.
    // There's no actual name of the currently executing component. Instead, that is available
    // on the regular stack that's currently executing. However, if there is no owner at all, then
    // there's no stack frame so we add the name of the root component to the stack to know which
    // component is currently executing.
    if (!componentInfo.owner && typeof componentInfo.name === 'string') {
      return describeBuiltInComponentFrame(componentInfo.name);
    }
    var owner = componentInfo;
    while (owner) {
      var ownerStack = owner.debugStack;
      if (ownerStack != null) {
        // Server Component
        owner = owner.owner;
        if (owner) {
          // TODO: Should we stash this somewhere for caching purposes?
          info += '\n' + formatOwnerStack(ownerStack);
        }
      } else {
        break;
      }
    }
    return info;
  } catch (x) {
    return '\nError generating stack: ' + x.message + '\n' + x.stack;
  }
}

function injectInternals(internals) {
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === 'undefined') {
    // No DevTools
    return false;
  }
  var hook = __REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (hook.isDisabled) {
    // This isn't a real property on the hook, but it can be set to opt out
    // of DevTools integration and associated warnings and logs.
    // https://github.com/facebook/react/issues/3877
    return true;
  }
  if (!hook.supportsFlight) {
    // DevTools exists, even though it doesn't support Flight.
    return true;
  }
  try {
    hook.inject(internals);
  } catch (err) {
    // Catch all errors because it is unsafe to throw during initialization.
    {
      console.error('React instrumentation encountered an error: %o.', err);
    }
  }
  if (hook.checkDCE) {
    // This is the real DevTools.
    return true;
  } else {
    // This is likely a hook installed by Fast Refresh runtime.
    return false;
  }
}

// TODO: This is an unfortunate hack. We shouldn't feature detect the internals
// like this. It's just that for now we support the same build of the Flight
// client both in the RSC environment, in the SSR environments as well as the
// browser client. We should probably have a separate RSC build. This is DEV
// only though.
var ReactSharedInteralsServer = React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
var ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE || ReactSharedInteralsServer;
var ROW_ID = 0;
var ROW_TAG = 1;
var ROW_LENGTH = 2;
var ROW_CHUNK_BY_NEWLINE = 3;
var ROW_CHUNK_BY_LENGTH = 4;
var PENDING = 'pending';
var BLOCKED = 'blocked';
var RESOLVED_MODEL = 'resolved_model';
var RESOLVED_MODULE = 'resolved_module';
var INITIALIZED = 'fulfilled';
var ERRORED = 'rejected';
var HALTED = 'halted'; // DEV-only. Means it never resolves even if connection closes.

var __PROTO__ = '__proto__';

// $FlowFixMe[missing-this-annot]
function ReactPromise(status, value, reason) {
  this.status = status;
  this.value = value;
  this.reason = reason;
  {
    this._children = [];
  }
  {
    this._debugChunk = null;
    this._debugInfo = [];
  }
}
// We subclass Promise.prototype so that we get other methods like .catch
ReactPromise.prototype = Object.create(Promise.prototype);
// TODO: This doesn't return a new Promise chain unlike the real .then
ReactPromise.prototype.then = function (resolve, reject) {
  var _this = this;
  var chunk = this;
  // If we have resolved content, we try to initialize it first which
  // might put us back into one of the other states.
  switch (chunk.status) {
    case RESOLVED_MODEL:
      initializeModelChunk(chunk);
      break;
    case RESOLVED_MODULE:
      initializeModuleChunk(chunk);
      break;
  }
  {
    // Because only native Promises get picked up when we're awaiting we need to wrap
    // this in a native Promise in DEV. This means that these callbacks are no longer sync
    // but the lazy initialization is still sync and the .value can be inspected after,
    // allowing it to be read synchronously anyway.
    var resolveCallback = resolve;
    var rejectCallback = reject;
    var wrapperPromise = new Promise(function (res, rej) {
      resolve = function (value) {
        // $FlowFixMe
        wrapperPromise._debugInfo = _this._debugInfo;
        res(value);
      };
      reject = function (reason) {
        // $FlowFixMe
        wrapperPromise._debugInfo = _this._debugInfo;
        rej(reason);
      };
    });
    wrapperPromise.then(resolveCallback, rejectCallback);
  }
  // The status might have changed after initialization.
  switch (chunk.status) {
    case INITIALIZED:
      if (typeof resolve === 'function') {
        resolve(chunk.value);
      }
      break;
    case PENDING:
    case BLOCKED:
      if (typeof resolve === 'function') {
        if (chunk.value === null) {
          chunk.value = [];
        }
        chunk.value.push(resolve);
      }
      if (typeof reject === 'function') {
        if (chunk.reason === null) {
          chunk.reason = [];
        }
        chunk.reason.push(reject);
      }
      break;
    case HALTED:
      {
        break;
      }
    default:
      if (typeof reject === 'function') {
        reject(chunk.reason);
      }
      break;
  }
};

// This indirection exists only to clean up DebugChannel when all Lazy References are GC:ed.
// Therefore we only use the indirection in DEV.

function hasGCedResponse(weakResponse) {
  return weakResponse.weak.deref() === undefined;
}
function unwrapWeakResponse(weakResponse) {
  {
    var response = weakResponse.weak.deref();
    if (response === undefined) {
      // eslint-disable-next-line react-internal/prod-error-codes
      throw new Error('We did not expect to receive new data after GC:ing the response.');
    }
    return response;
  }
}
function getWeakResponse(response) {
  {
    return response._weakResponse;
  }
}
function closeDebugChannel(debugChannel) {
  if (debugChannel.callback) {
    debugChannel.callback('');
  }
}

// If FinalizationRegistry doesn't exist, we cannot use the debugChannel.
var debugChannelRegistry = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry(closeDebugChannel) : null;
function readChunk(chunk) {
  // If we have resolved content, we try to initialize it first which
  // might put us back into one of the other states.
  switch (chunk.status) {
    case RESOLVED_MODEL:
      initializeModelChunk(chunk);
      break;
    case RESOLVED_MODULE:
      initializeModuleChunk(chunk);
      break;
  }
  // The status might have changed after initialization.
  switch (chunk.status) {
    case INITIALIZED:
      return chunk.value;
    case PENDING:
    case BLOCKED:
    case HALTED:
      // eslint-disable-next-line no-throw-literal
      throw chunk;
    default:
      throw chunk.reason;
  }
}
function getRoot(weakResponse) {
  var response = unwrapWeakResponse(weakResponse);
  var chunk = getChunk(response, 0);
  return chunk;
}
function createPendingChunk(response) {
  {
    // Retain a strong reference to the Response while we wait for the result.
    if (response._pendingChunks++ === 0) {
      response._weakResponse.response = response;
      if (response._pendingInitialRender !== null) {
        clearTimeout(response._pendingInitialRender);
        response._pendingInitialRender = null;
      }
    }
  }
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(PENDING, null, null);
}
function releasePendingChunk(response, chunk) {
  if (chunk.status === PENDING) {
    if (--response._pendingChunks === 0) {
      // We're no longer waiting for any more chunks. We can release the strong reference
      // to the response. We'll regain it if we ask for any more data later on.
      response._weakResponse.response = null;
      // Wait a short period to see if any more chunks get asked for. E.g. by a React render.
      // These chunks might discover more pending chunks.
      // If we don't ask for more then we assume that those chunks weren't blocking initial
      // render and are excluded from the performance track.
      response._pendingInitialRender = setTimeout(flushInitialRenderPerformance.bind(null, response), 100);
    }
  }
}
function createBlockedChunk(response) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(BLOCKED, null, null);
}
function createErrorChunk(response, error) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(ERRORED, null, error);
}
function filterDebugInfo(response, value) {
  if (response._debugEndTime === null) {
    // No end time was defined, so we keep all debug info entries.
    return;
  }

  // Remove any debug info entries after the defined end time. For async info
  // that means we're including anything that was awaited before the end time,
  // but it doesn't need to be resolved before the end time.
  var relativeEndTime = response._debugEndTime -
  // $FlowFixMe[prop-missing]
  performance.timeOrigin;
  var debugInfo = [];
  for (var i = 0; i < value._debugInfo.length; i++) {
    var info = value._debugInfo[i];
    if (typeof info.time === 'number' && info.time > relativeEndTime) {
      break;
    }
    debugInfo.push(info);
  }
  value._debugInfo = debugInfo;
}
function moveDebugInfoFromChunkToInnerValue(chunk, value) {
  // Remove the debug info from the initialized chunk, and add it to the inner
  // value instead. This can be a React element, an array, or an uninitialized
  // Lazy.
  var resolvedValue = resolveLazy(value);
  if (typeof resolvedValue === 'object' && resolvedValue !== null && (isArray(resolvedValue) || typeof resolvedValue[ASYNC_ITERATOR] === 'function' || resolvedValue.$$typeof === REACT_ELEMENT_TYPE || resolvedValue.$$typeof === REACT_LAZY_TYPE)) {
    var debugInfo = chunk._debugInfo.splice(0);
    if (isArray(resolvedValue._debugInfo)) {
      // $FlowFixMe[method-unbinding]
      resolvedValue._debugInfo.unshift.apply(resolvedValue._debugInfo, debugInfo);
    } else if (!Object.isFrozen(resolvedValue)) {
      Object.defineProperty(resolvedValue, '_debugInfo', {
        configurable: false,
        enumerable: false,
        writable: true,
        value: debugInfo
      });
    }
    // TODO: If the resolved value is a frozen element (e.g. a client-created
    // element from a temporary reference, or a JSX element exported as a client
    // reference), server debug info is currently dropped because the element
    // can't be mutated. We should probably clone the element so each rendering
    // context gets its own mutable copy with the correct debug info.
  }
}
function processChunkDebugInfo(response, chunk, value) {
  filterDebugInfo(response, chunk);
  moveDebugInfoFromChunkToInnerValue(chunk, value);
}
function wakeChunk(response, listeners, value, chunk) {
  for (var i = 0; i < listeners.length; i++) {
    var listener = listeners[i];
    if (typeof listener === 'function') {
      listener(value);
    } else {
      fulfillReference(response, listener, value, chunk);
    }
  }
  {
    processChunkDebugInfo(response, chunk, value);
  }
}
function rejectChunk(response, listeners, error) {
  for (var i = 0; i < listeners.length; i++) {
    var listener = listeners[i];
    if (typeof listener === 'function') {
      listener(error);
    } else {
      rejectReference(response, listener.handler, error);
    }
  }
}
function resolveBlockedCycle(resolvedChunk, reference) {
  var referencedChunk = reference.handler.chunk;
  if (referencedChunk === null) {
    return null;
  }
  if (referencedChunk === resolvedChunk) {
    // We found the cycle. We can resolve the blocked cycle now.
    return reference.handler;
  }
  var resolveListeners = referencedChunk.value;
  if (resolveListeners !== null) {
    for (var i = 0; i < resolveListeners.length; i++) {
      var listener = resolveListeners[i];
      if (typeof listener !== 'function') {
        var foundHandler = resolveBlockedCycle(resolvedChunk, listener);
        if (foundHandler !== null) {
          return foundHandler;
        }
      }
    }
  }
  return null;
}
function wakeChunkIfInitialized(response, chunk, resolveListeners, rejectListeners) {
  switch (chunk.status) {
    case INITIALIZED:
      wakeChunk(response, resolveListeners, chunk.value, chunk);
      break;
    case BLOCKED:
      // It is possible that we're blocked on our own chunk if it's a cycle.
      // Before adding back the listeners to the chunk, let's check if it would
      // result in a cycle.
      for (var i = 0; i < resolveListeners.length; i++) {
        var listener = resolveListeners[i];
        if (typeof listener !== 'function') {
          var reference = listener;
          var cyclicHandler = resolveBlockedCycle(chunk, reference);
          if (cyclicHandler !== null) {
            // This reference points back to this chunk. We can resolve the cycle by
            // using the value from that handler.
            fulfillReference(response, reference, cyclicHandler.value, chunk);
            resolveListeners.splice(i, 1);
            i--;
            if (rejectListeners !== null) {
              var rejectionIdx = rejectListeners.indexOf(reference);
              if (rejectionIdx !== -1) {
                rejectListeners.splice(rejectionIdx, 1);
              }
            }
            // The status might have changed after fulfilling the reference.
            switch (chunk.status) {
              case INITIALIZED:
                var initializedChunk = chunk;
                wakeChunk(response, resolveListeners, initializedChunk.value, initializedChunk);
                return;
              case ERRORED:
                if (rejectListeners !== null) {
                  rejectChunk(response, rejectListeners, chunk.reason);
                }
                return;
            }
          }
        }
      }
    // Fallthrough
    case PENDING:
      if (chunk.value) {
        for (var _i = 0; _i < resolveListeners.length; _i++) {
          chunk.value.push(resolveListeners[_i]);
        }
      } else {
        chunk.value = resolveListeners;
      }
      if (chunk.reason) {
        if (rejectListeners) {
          for (var _i2 = 0; _i2 < rejectListeners.length; _i2++) {
            chunk.reason.push(rejectListeners[_i2]);
          }
        }
      } else {
        chunk.reason = rejectListeners;
      }
      break;
    case ERRORED:
      if (rejectListeners) {
        rejectChunk(response, rejectListeners, chunk.reason);
      }
      break;
  }
}
function triggerErrorOnChunk(response, chunk, error) {
  if (chunk.status !== PENDING && chunk.status !== BLOCKED) {
    // If we get more data to an already resolved ID, we assume that it's
    // a stream chunk since any other row shouldn't have more than one entry.
    var streamChunk = chunk;
    var controller = streamChunk.reason;
    // $FlowFixMe[incompatible-call]: The error method should accept mixed.
    controller.error(error);
    return;
  }
  releasePendingChunk(response, chunk);
  var listeners = chunk.reason;
  if (chunk.status === PENDING) {
    // Lazily initialize any debug info and block the initializing chunk on any unresolved entries.
    if (chunk._debugChunk != null) {
      var prevHandler = initializingHandler;
      var prevChunk = initializingChunk;
      initializingHandler = null;
      var cyclicChunk = chunk;
      cyclicChunk.status = BLOCKED;
      cyclicChunk.value = null;
      cyclicChunk.reason = null;
      {
        initializingChunk = cyclicChunk;
      }
      try {
        initializeDebugChunk(response, chunk);
        if (initializingHandler !== null) {
          if (initializingHandler.errored) {
            // Ignore error parsing debug info, we'll report the original error instead.
          } else if (initializingHandler.deps > 0) {
            // TODO: Block the resolution of the error until all the debug info has loaded.
            // We currently don't have a way to throw an error after all dependencies have
            // loaded because we currently treat errors as immediately cancelling the handler.
          }
        }
      } finally {
        initializingHandler = prevHandler;
        initializingChunk = prevChunk;
      }
    }
  }
  var erroredChunk = chunk;
  erroredChunk.status = ERRORED;
  erroredChunk.reason = error;
  if (listeners !== null) {
    rejectChunk(response, listeners, error);
  }
}
function createResolvedModelChunk(response, value) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(RESOLVED_MODEL, value, response);
}
function createResolvedModuleChunk(response, value) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(RESOLVED_MODULE, value, null);
}
function createInitializedTextChunk(response, value) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(INITIALIZED, value, null);
}
function createInitializedBufferChunk(response, value) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(INITIALIZED, value, null);
}
function createInitializedIteratorResultChunk(response, value, done) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(INITIALIZED, {
    done: done,
    value: value
  }, null);
}
function createInitializedStreamChunk(response, value, controller) {
  {
    // Retain a strong reference to the Response while we wait for chunks.
    if (response._pendingChunks++ === 0) {
      response._weakResponse.response = response;
    }
  }
  // We use the reason field to stash the controller since we already have that
  // field. It's a bit of a hack but efficient.
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(INITIALIZED, value, controller);
}
function createResolvedIteratorResultChunk(response, value, done) {
  // To reuse code as much code as possible we add the wrapper element as part of the JSON.
  var iteratorResultJSON = (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + '}';
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(RESOLVED_MODEL, iteratorResultJSON, response);
}
function resolveIteratorResultChunk(response, chunk, value, done) {
  // To reuse code as much code as possible we add the wrapper element as part of the JSON.
  var iteratorResultJSON = (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + '}';
  resolveModelChunk(response, chunk, iteratorResultJSON);
}
function resolveModelChunk(response, chunk, value) {
  if (chunk.status !== PENDING) {
    // If we get more data to an already resolved ID, we assume that it's
    // a stream chunk since any other row shouldn't have more than one entry.
    var streamChunk = chunk;
    var controller = streamChunk.reason;
    controller.enqueueModel(value);
    return;
  }
  releasePendingChunk(response, chunk);
  var resolveListeners = chunk.value;
  var rejectListeners = chunk.reason;
  var resolvedChunk = chunk;
  resolvedChunk.status = RESOLVED_MODEL;
  resolvedChunk.value = value;
  resolvedChunk.reason = response;
  if (resolveListeners !== null) {
    // This is unfortunate that we're reading this eagerly if
    // we already have listeners attached since they might no
    // longer be rendered or might not be the highest pri.
    initializeModelChunk(resolvedChunk);
    // The status might have changed after initialization.
    wakeChunkIfInitialized(response, chunk, resolveListeners, rejectListeners);
  }
}
function resolveModuleChunk(response, chunk, value) {
  if (chunk.status !== PENDING && chunk.status !== BLOCKED) {
    // We already resolved. We didn't expect to see this.
    return;
  }
  releasePendingChunk(response, chunk);
  var resolveListeners = chunk.value;
  var rejectListeners = chunk.reason;
  var resolvedChunk = chunk;
  resolvedChunk.status = RESOLVED_MODULE;
  resolvedChunk.value = value;
  resolvedChunk.reason = null;
  {
    var debugInfo = getModuleDebugInfo(value);
    if (debugInfo !== null) {
      // Add to the live set if it was already initialized.
      // $FlowFixMe[method-unbinding]
      resolvedChunk._debugInfo.push.apply(resolvedChunk._debugInfo, debugInfo);
    }
  }
  if (resolveListeners !== null) {
    initializeModuleChunk(resolvedChunk);
    wakeChunkIfInitialized(response, chunk, resolveListeners, rejectListeners);
  }
}
var initializingHandler = null;
var initializingChunk = null;
var isInitializingDebugInfo = false;
function initializeDebugChunk(response, chunk) {
  var debugChunk = chunk._debugChunk;
  if (debugChunk !== null) {
    var debugInfo = chunk._debugInfo;
    var prevIsInitializingDebugInfo = isInitializingDebugInfo;
    isInitializingDebugInfo = true;
    try {
      if (debugChunk.status === RESOLVED_MODEL) {
        // Find the index of this debug info by walking the linked list.
        var idx = debugInfo.length;
        var c = debugChunk._debugChunk;
        while (c !== null) {
          if (c.status !== INITIALIZED) {
            idx++;
          }
          c = c._debugChunk;
        }
        // Initializing the model for the first time.
        initializeModelChunk(debugChunk);
        var initializedChunk = debugChunk;
        switch (initializedChunk.status) {
          case INITIALIZED:
            {
              debugInfo[idx] = initializeDebugInfo(response, initializedChunk.value);
              break;
            }
          case BLOCKED:
          case PENDING:
            {
              waitForReference(initializedChunk, debugInfo, '' + idx, response, initializeDebugInfo, [''],
              // path
              true);
              break;
            }
          default:
            throw initializedChunk.reason;
        }
      } else {
        switch (debugChunk.status) {
          case INITIALIZED:
            {
              // Already done.
              break;
            }
          case BLOCKED:
          case PENDING:
            {
              // Signal to the caller that we need to wait.
              waitForReference(debugChunk, {},
              // noop, since we'll have already added an entry to debug info
              'debug',
              // noop, but we need it to not be empty string since that indicates the root object
              response, initializeDebugInfo, [''],
              // path
              true);
              break;
            }
          default:
            throw debugChunk.reason;
        }
      }
    } catch (error) {
      triggerErrorOnChunk(response, chunk, error);
    } finally {
      isInitializingDebugInfo = prevIsInitializingDebugInfo;
    }
  }
}
function initializeModelChunk(chunk) {
  var prevHandler = initializingHandler;
  var prevChunk = initializingChunk;
  initializingHandler = null;
  var resolvedModel = chunk.value;
  var response = chunk.reason;

  // We go to the BLOCKED state until we've fully resolved this.
  // We do this before parsing in case we try to initialize the same chunk
  // while parsing the model. Such as in a cyclic reference.
  var cyclicChunk = chunk;
  cyclicChunk.status = BLOCKED;
  cyclicChunk.value = null;
  cyclicChunk.reason = null;
  {
    initializingChunk = cyclicChunk;
  }
  {
    // Initialize any debug info and block the initializing chunk on any
    // unresolved entries.
    initializeDebugChunk(response, chunk);
  }
  try {
    var value = parseModel(response, resolvedModel);
    // Invoke any listeners added while resolving this model. I.e. cyclic
    // references. This may or may not fully resolve the model depending on
    // if they were blocked.
    var resolveListeners = cyclicChunk.value;
    if (resolveListeners !== null) {
      cyclicChunk.value = null;
      cyclicChunk.reason = null;
      for (var i = 0; i < resolveListeners.length; i++) {
        var listener = resolveListeners[i];
        if (typeof listener === 'function') {
          listener(value);
        } else {
          fulfillReference(response, listener, value, cyclicChunk);
        }
      }
    }
    if (initializingHandler !== null) {
      if (initializingHandler.errored) {
        throw initializingHandler.reason;
      }
      if (initializingHandler.deps > 0) {
        // We discovered new dependencies on modules that are not yet resolved.
        // We have to keep the BLOCKED state until they're resolved.
        initializingHandler.value = value;
        initializingHandler.chunk = cyclicChunk;
        return;
      }
    }
    var initializedChunk = chunk;
    initializedChunk.status = INITIALIZED;
    initializedChunk.value = value;
    if (true) {
      processChunkDebugInfo(response, initializedChunk, value);
    }
  } catch (error) {
    var erroredChunk = chunk;
    erroredChunk.status = ERRORED;
    erroredChunk.reason = error;
  } finally {
    initializingHandler = prevHandler;
    {
      initializingChunk = prevChunk;
    }
  }
}
function initializeModuleChunk(chunk) {
  try {
    var value = requireModule(chunk.value);
    var initializedChunk = chunk;
    initializedChunk.status = INITIALIZED;
    initializedChunk.value = value;
  } catch (error) {
    var erroredChunk = chunk;
    erroredChunk.status = ERRORED;
    erroredChunk.reason = error;
  }
}

// Report that any missing chunks in the model is now going to throw this
// error upon read. Also notify any pending promises.
function reportGlobalError(weakResponse, error) {
  if (hasGCedResponse(weakResponse)) {
    // Ignore close signal if we are not awaiting any more pending chunks.
    return;
  }
  var response = unwrapWeakResponse(weakResponse);
  response._closed = true;
  response._closedReason = error;
  response._chunks.forEach(function (chunk) {
    // If this chunk was already resolved or errored, it won't
    // trigger an error but if it wasn't then we need to
    // because we won't be getting any new data to resolve it.
    if (chunk.status === PENDING) {
      triggerErrorOnChunk(response, chunk, error);
    } else if (chunk.status === INITIALIZED && chunk.reason !== null) {
      chunk.reason.error(error);
    }
  });
  {
    var debugChannel = response._debugChannel;
    if (debugChannel !== undefined) {
      // If we don't have any more ways of reading data, we don't have to send
      // any more neither. So we close the writable side.
      closeDebugChannel(debugChannel);
      response._debugChannel = undefined;
      // Make sure the debug channel is not closed a second time when the
      // Response gets GC:ed.
      if (debugChannelRegistry !== null) {
        debugChannelRegistry.unregister(response);
      }
    }
  }
}
function nullRefGetter() {
  {
    return null;
  }
}
function getIOInfoTaskName(ioInfo) {
  return ioInfo.name || 'unknown';
}
function getAsyncInfoTaskName(asyncInfo) {
  return 'await ' + getIOInfoTaskName(asyncInfo.awaited);
}
function getServerComponentTaskName(componentInfo) {
  return '<' + (componentInfo.name || '...') + '>';
}
function getTaskName(type) {
  if (type === REACT_FRAGMENT_TYPE) {
    return '<>';
  }
  if (typeof type === 'function') {
    // This is a function so it must have been a Client Reference that resolved to
    // a function. We use "use client" to indicate that this is the boundary into
    // the client. There should only be one for any given owner chain.
    return '"use client"';
  }
  if (typeof type === 'object' && type !== null && type.$$typeof === REACT_LAZY_TYPE) {
    if (type._init === readChunk) {
      // This is a lazy node created by Flight. It is probably a client reference.
      // We use the "use client" string to indicate that this is the boundary into
      // the client. There will only be one for any given owner chain.
      return '"use client"';
    }
    // We don't want to eagerly initialize the initializer in DEV mode so we can't
    // call it to extract the type so we don't know the type of this component.
    return '<...>';
  }
  try {
    var name = getComponentNameFromType(type);
    return name ? '<' + name + '>' : '<...>';
  } catch (x) {
    return '<...>';
  }
}
function initializeElement(response, element, lazyNode) {
  var stack = element._debugStack;
  var owner = element._owner;
  if (owner === null) {
    element._owner = response._debugRootOwner;
  }
  var env = response._rootEnvironmentName;
  if (owner !== null && owner.env != null) {
    // Interestingly we don't actually have the environment name of where
    // this JSX was created if it doesn't have an owner but if it does
    // it must be the same environment as the owner. We could send it separately
    // but it seems a bit unnecessary for this edge case.
    env = owner.env;
  }
  var normalizedStackTrace = null;
  if (owner === null && response._debugRootStack != null) {
    // We override the stack if we override the owner since the stack where the root JSX
    // was created on the server isn't very useful but where the request was made is.
    normalizedStackTrace = response._debugRootStack;
  } else if (stack !== null) {
    // We create a fake stack and then create an Error object inside of it.
    // This means that the stack trace is now normalized into the native format
    // of the browser and the stack frames will have been registered with
    // source mapping information.
    // This can unfortunately happen within a user space callstack which will
    // remain on the stack.
    normalizedStackTrace = createFakeJSXCallStackInDEV(response, stack, env);
  }
  element._debugStack = normalizedStackTrace;
  var task = null;
  if (supportsCreateTask && stack !== null) {
    var createTaskFn = console.createTask.bind(console, getTaskName(element.type));
    var callStack = buildFakeCallStack(response, stack, env, false, createTaskFn);
    // This owner should ideally have already been initialized to avoid getting
    // user stack frames on the stack.
    var ownerTask = owner === null ? null : initializeFakeTask(response, owner);
    if (ownerTask === null) {
      var rootTask = response._debugRootTask;
      if (rootTask != null) {
        task = rootTask.run(callStack);
      } else {
        task = callStack();
      }
    } else {
      task = ownerTask.run(callStack);
    }
  }
  element._debugTask = task;

  // This owner should ideally have already been initialized to avoid getting
  // user stack frames on the stack.
  if (owner !== null) {
    initializeFakeStack(response, owner);
  }
  if (lazyNode !== null) {
    // In case the JSX runtime has validated the lazy type as a static child, we
    // need to transfer this information to the element.
    if (lazyNode._store && lazyNode._store.validated && !element._store.validated) {
      element._store.validated = lazyNode._store.validated;
    }

    // If the lazy node is initialized, we move its debug info to the inner
    // value.
    if (lazyNode._payload.status === INITIALIZED && lazyNode._debugInfo) {
      var debugInfo = lazyNode._debugInfo.splice(0);
      if (element._debugInfo) {
        // $FlowFixMe[method-unbinding]
        element._debugInfo.unshift.apply(element._debugInfo, debugInfo);
      } else {
        Object.defineProperty(element, '_debugInfo', {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugInfo
        });
      }
    }
  }

  // TODO: We should be freezing the element but currently, we might write into
  // _debugInfo later. We could move it into _store which remains mutable.
  Object.freeze(element.props);
}
function createElement(response, type, key, props, owner,
// DEV-only
stack,
// DEV-only
validated // DEV-only
) {
  var element;
  {
    // `ref` is non-enumerable in dev
    element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: type,
      key: key,
      props: props,
      _owner: owner === undefined ? null : owner
    };
    Object.defineProperty(element, 'ref', {
      enumerable: false,
      get: nullRefGetter
    });
  }
  {
    // We don't really need to add any of these but keeping them for good measure.
    // Unfortunately, _store is enumerable in jest matchers so for equality to
    // work, I need to keep it or make _store non-enumerable in the other file.
    element._store = {};
    Object.defineProperty(element._store, 'validated', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: validated // Whether the element has already been validated on the server.
    });
    // debugInfo contains Server Component debug information.
    Object.defineProperty(element, '_debugInfo', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: null
    });
    Object.defineProperty(element, '_debugStack', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: stack === undefined ? null : stack
    });
    Object.defineProperty(element, '_debugTask', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: null
    });
  }
  if (initializingHandler !== null) {
    var handler = initializingHandler;
    // We pop the stack to the previous outer handler before leaving the Element.
    // This is effectively the complete phase.
    initializingHandler = handler.parent;
    if (handler.errored) {
      // Something errored inside this Element's props. We can turn this Element
      // into a Lazy so that we can still render up until that Lazy is rendered.
      var erroredChunk = createErrorChunk(response, handler.reason);
      {
        initializeElement(response, element, null);
        // Conceptually the error happened inside this Element but right before
        // it was rendered. We don't have a client side component to render but
        // we can add some DebugInfo to explain that this was conceptually a
        // Server side error that errored inside this element. That way any stack
        // traces will point to the nearest JSX that errored - e.g. during
        // serialization.
        var erroredComponent = {
          name: getComponentNameFromType(element.type) || '',
          owner: element._owner
        };
        // $FlowFixMe[cannot-write]
        erroredComponent.debugStack = element._debugStack;
        if (supportsCreateTask) {
          // $FlowFixMe[cannot-write]
          erroredComponent.debugTask = element._debugTask;
        }
        erroredChunk._debugInfo = [erroredComponent];
      }
      return createLazyChunkWrapper(erroredChunk, validated);
    }
    if (handler.deps > 0) {
      // We have blocked references inside this Element but we can turn this into
      // a Lazy node referencing this Element to let everything around it proceed.
      var blockedChunk = createBlockedChunk();
      handler.value = element;
      handler.chunk = blockedChunk;
      var lazyNode = createLazyChunkWrapper(blockedChunk, validated);
      {
        // After we have initialized any blocked references, initialize stack etc.
        var init = initializeElement.bind(null, response, element, lazyNode);
        blockedChunk.then(init, init);
      }
      return lazyNode;
    }
  }
  {
    initializeElement(response, element, null);
  }
  return element;
}
function createLazyChunkWrapper(chunk, validated // DEV-only
) {
  var lazyType = {
    $$typeof: REACT_LAZY_TYPE,
    _payload: chunk,
    _init: readChunk
  };
  {
    // Forward the live array
    lazyType._debugInfo = chunk._debugInfo;
    // Initialize a store for key validation by the JSX runtime.
    lazyType._store = {
      validated: validated
    };
  }
  return lazyType;
}
function getChunk(response, id) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);
  if (!chunk) {
    if (response._closed) {
      if (response._allowPartialStream) {
        // For partial streams, chunks accessed after close should be HALTED
        // (never resolve).
        chunk = createPendingChunk(response);
        var haltedChunk = chunk;
        haltedChunk.status = HALTED;
        haltedChunk.value = null;
        haltedChunk.reason = null;
      } else {
        // We have already errored the response and we're not going to get
        // anything more streaming in so this will immediately error.
        chunk = createErrorChunk(response, response._closedReason);
      }
    } else {
      chunk = createPendingChunk(response);
    }
    chunks.set(id, chunk);
  }
  return chunk;
}
function fulfillReference(response, reference, value, fulfilledChunk) {
  var handler = reference.handler,
    parentObject = reference.parentObject,
    key = reference.key,
    map = reference.map,
    path = reference.path;
  try {
    for (var i = 1; i < path.length; i++) {
      while (typeof value === 'object' && value !== null && value.$$typeof === REACT_LAZY_TYPE) {
        // We never expect to see a Lazy node on this path because we encode those as
        // separate models. This must mean that we have inserted an extra lazy node
        // e.g. to replace a blocked element. We must instead look for it inside.
        var referencedChunk = value._payload;
        if (referencedChunk === handler.chunk) {
          // This is a reference to the thing we're currently blocking. We can peak
          // inside of it to get the value.
          value = handler.value;
          continue;
        } else {
          switch (referencedChunk.status) {
            case RESOLVED_MODEL:
              initializeModelChunk(referencedChunk);
              break;
            case RESOLVED_MODULE:
              initializeModuleChunk(referencedChunk);
              break;
          }
          switch (referencedChunk.status) {
            case INITIALIZED:
              {
                value = referencedChunk.value;
                continue;
              }
            case BLOCKED:
              {
                // It is possible that we're blocked on our own chunk if it's a cycle.
                // Before adding the listener to the inner chunk, let's check if it would
                // result in a cycle.
                var cyclicHandler = resolveBlockedCycle(referencedChunk, reference);
                if (cyclicHandler !== null) {
                  // This reference points back to this chunk. We can resolve the cycle by
                  // using the value from that handler.
                  value = cyclicHandler.value;
                  continue;
                }
                // Fallthrough
              }
            case PENDING:
              {
                // If we're not yet initialized we need to skip what we've already drilled
                // through and then wait for the next value to become available.
                path.splice(0, i - 1);
                // Add "listener" to our new chunk dependency.
                if (referencedChunk.value === null) {
                  referencedChunk.value = [reference];
                } else {
                  referencedChunk.value.push(reference);
                }
                if (referencedChunk.reason === null) {
                  referencedChunk.reason = [reference];
                } else {
                  referencedChunk.reason.push(reference);
                }
                return;
              }
            case HALTED:
              {
                // Do nothing. We couldn't fulfill.
                // TODO: Mark downstreams as halted too.
                return;
              }
            default:
              {
                rejectReference(response, reference.handler, referencedChunk.reason);
                return;
              }
          }
        }
      }
      var name = path[i];
      if (typeof value === 'object' && value !== null && hasOwnProperty.call(value, name)) {
        value = value[name];
      } else {
        throw new Error('Invalid reference.');
      }
    }
    while (typeof value === 'object' && value !== null && value.$$typeof === REACT_LAZY_TYPE) {
      // If what we're referencing is a Lazy it must be because we inserted one as a virtual node
      // while it was blocked by other data. If it's no longer blocked, we can unwrap it.
      var _referencedChunk = value._payload;
      if (_referencedChunk === handler.chunk) {
        // This is a reference to the thing we're currently blocking. We can peak
        // inside of it to get the value.
        value = handler.value;
        continue;
      } else {
        switch (_referencedChunk.status) {
          case RESOLVED_MODEL:
            initializeModelChunk(_referencedChunk);
            break;
          case RESOLVED_MODULE:
            initializeModuleChunk(_referencedChunk);
            break;
        }
        switch (_referencedChunk.status) {
          case INITIALIZED:
            {
              value = _referencedChunk.value;
              continue;
            }
        }
      }
      break;
    }
    var mappedValue = map(response, value, parentObject, key);
    if (key !== __PROTO__) {
      parentObject[key] = mappedValue;
    }

    // If this is the root object for a model reference, where `handler.value`
    // is a stale `null`, the resolved value can be used directly.
    if (key === '' && handler.value === null) {
      handler.value = mappedValue;
    }

    // If the parent object is an unparsed React element tuple, we also need to
    // update the props and owner of the parsed element object (i.e.
    // handler.value).
    if (parentObject[0] === REACT_ELEMENT_TYPE && typeof handler.value === 'object' && handler.value !== null && handler.value.$$typeof === REACT_ELEMENT_TYPE) {
      var element = handler.value;
      switch (key) {
        case '3':
          if (true) {
            transferReferencedDebugInfo(handler.chunk, fulfilledChunk);
          }
          element.props = mappedValue;
          break;
        case '4':
          // This path doesn't call transferReferencedDebugInfo because this reference is to a debug chunk.
          if (true) {
            element._owner = mappedValue;
          }
          break;
        case '5':
          // This path doesn't call transferReferencedDebugInfo because this reference is to a debug chunk.
          if (true) {
            element._debugStack = mappedValue;
          }
          break;
        default:
          if (true) {
            transferReferencedDebugInfo(handler.chunk, fulfilledChunk);
          }
          break;
      }
    } else if (true && !reference.isDebug) {
      transferReferencedDebugInfo(handler.chunk, fulfilledChunk);
    }
  } catch (error) {
    rejectReference(response, reference.handler, error);
    return;
  }
  handler.deps--;
  if (handler.deps === 0) {
    var chunk = handler.chunk;
    if (chunk === null || chunk.status !== BLOCKED) {
      return;
    }
    var resolveListeners = chunk.value;
    var initializedChunk = chunk;
    initializedChunk.status = INITIALIZED;
    initializedChunk.value = handler.value;
    initializedChunk.reason = handler.reason; // Used by streaming chunks
    if (resolveListeners !== null) {
      wakeChunk(response, resolveListeners, handler.value, initializedChunk);
    } else {
      {
        processChunkDebugInfo(response, initializedChunk, handler.value);
      }
    }
  }
}
function rejectReference(response, handler, error) {
  if (handler.errored) {
    // We've already errored. We could instead build up an AggregateError
    // but if there are multiple errors we just take the first one like
    // Promise.all.
    return;
  }
  var blockedValue = handler.value;
  handler.errored = true;
  handler.value = null;
  handler.reason = error;
  var chunk = handler.chunk;
  if (chunk === null || chunk.status !== BLOCKED) {
    return;
  }
  {
    if (typeof blockedValue === 'object' && blockedValue !== null && blockedValue.$$typeof === REACT_ELEMENT_TYPE) {
      var element = blockedValue;
      // Conceptually the error happened inside this Element but right before
      // it was rendered. We don't have a client side component to render but
      // we can add some DebugInfo to explain that this was conceptually a
      // Server side error that errored inside this element. That way any stack
      // traces will point to the nearest JSX that errored - e.g. during
      // serialization.
      var erroredComponent = {
        name: getComponentNameFromType(element.type) || '',
        owner: element._owner
      };
      // $FlowFixMe[cannot-write]
      erroredComponent.debugStack = element._debugStack;
      if (supportsCreateTask) {
        // $FlowFixMe[cannot-write]
        erroredComponent.debugTask = element._debugTask;
      }
      chunk._debugInfo.push(erroredComponent);
    }
  }
  triggerErrorOnChunk(response, chunk, error);
}
function waitForReference(referencedChunk, parentObject, key, response, map, path, isAwaitingDebugInfo // DEV-only
) {
  if ((response._debugChannel === undefined || !response._debugChannel.hasReadable)) {
    if (referencedChunk.status === PENDING && parentObject[0] === REACT_ELEMENT_TYPE && (key === '4' || key === '5')) {
      // If the parent object is an unparsed React element tuple, and this is a reference
      // to the owner or debug stack. Then we expect the chunk to have been emitted earlier
      // in the stream. It might be blocked on other things but chunk should no longer be pending.
      // If it's still pending that suggests that it was referencing an object in the debug
      // channel, but no debug channel was wired up so it's missing. In this case we can just
      // drop the debug info instead of halting the whole stream.
      return null;
    }
  }
  var handler;
  if (initializingHandler) {
    handler = initializingHandler;
    handler.deps++;
  } else {
    handler = initializingHandler = {
      parent: null,
      chunk: null,
      value: null,
      reason: null,
      deps: 1,
      errored: false
    };
  }
  var reference = {
    handler: handler,
    parentObject: parentObject,
    key: key,
    map: map,
    path: path
  };
  {
    reference.isDebug = isAwaitingDebugInfo;
  }

  // Add "listener".
  if (referencedChunk.value === null) {
    referencedChunk.value = [reference];
  } else {
    referencedChunk.value.push(reference);
  }
  if (referencedChunk.reason === null) {
    referencedChunk.reason = [reference];
  } else {
    referencedChunk.reason.push(reference);
  }

  // Return a place holder value for now.
  return null;
}
function loadServerReference(response, metaData, parentObject, key) {
  if (!response._serverReferenceConfig) {
    // In the normal case, we can't load this Server Reference in the current environment and
    // we just return a proxy to it.
    return createBoundServerReference(metaData, response._callServer, response._encodeFormAction, response._debugFindSourceMapURL );
  }
  // If we have a module mapping we can load the real version of this Server Reference.
  var serverReference = resolveServerReference(response._serverReferenceConfig, metaData.id);
  var promise = preloadModule(serverReference);
  if (!promise) {
    if (!metaData.bound) {
      var resolvedValue = requireModule(serverReference);
      registerBoundServerReference(resolvedValue, metaData.id, metaData.bound);
      return resolvedValue;
    } else {
      promise = Promise.resolve(metaData.bound);
    }
  } else if (metaData.bound) {
    promise = Promise.all([promise, metaData.bound]);
  }
  var handler;
  if (initializingHandler) {
    handler = initializingHandler;
    handler.deps++;
  } else {
    handler = initializingHandler = {
      parent: null,
      chunk: null,
      value: null,
      reason: null,
      deps: 1,
      errored: false
    };
  }
  function fulfill() {
    var resolvedValue = requireModule(serverReference);
    if (metaData.bound) {
      // This promise is coming from us and should have initilialized by now.
      var boundArgs = metaData.bound.value.slice(0);
      boundArgs.unshift(null); // this
      resolvedValue = resolvedValue.bind.apply(resolvedValue, boundArgs);
    }
    registerBoundServerReference(resolvedValue, metaData.id, metaData.bound);
    if (key !== __PROTO__) {
      parentObject[key] = resolvedValue;
    }

    // If this is the root object for a model reference, where `handler.value`
    // is a stale `null`, the resolved value can be used directly.
    if (key === '' && handler.value === null) {
      handler.value = resolvedValue;
    }

    // If the parent object is an unparsed React element tuple, we also need to
    // update the props and owner of the parsed element object (i.e.
    // handler.value).
    if (parentObject[0] === REACT_ELEMENT_TYPE && typeof handler.value === 'object' && handler.value !== null && handler.value.$$typeof === REACT_ELEMENT_TYPE) {
      var element = handler.value;
      switch (key) {
        case '3':
          element.props = resolvedValue;
          break;
        case '4':
          {
            element._owner = resolvedValue;
          }
          break;
      }
    }
    handler.deps--;
    if (handler.deps === 0) {
      var chunk = handler.chunk;
      if (chunk === null || chunk.status !== BLOCKED) {
        return;
      }
      var resolveListeners = chunk.value;
      var initializedChunk = chunk;
      initializedChunk.status = INITIALIZED;
      initializedChunk.value = handler.value;
      initializedChunk.reason = null;
      if (resolveListeners !== null) {
        wakeChunk(response, resolveListeners, handler.value, initializedChunk);
      } else {
        {
          processChunkDebugInfo(response, initializedChunk, handler.value);
        }
      }
    }
  }
  function reject(error) {
    if (handler.errored) {
      // We've already errored. We could instead build up an AggregateError
      // but if there are multiple errors we just take the first one like
      // Promise.all.
      return;
    }
    var blockedValue = handler.value;
    handler.errored = true;
    handler.value = null;
    handler.reason = error;
    var chunk = handler.chunk;
    if (chunk === null || chunk.status !== BLOCKED) {
      return;
    }
    {
      if (typeof blockedValue === 'object' && blockedValue !== null && blockedValue.$$typeof === REACT_ELEMENT_TYPE) {
        var element = blockedValue;
        // Conceptually the error happened inside this Element but right before
        // it was rendered. We don't have a client side component to render but
        // we can add some DebugInfo to explain that this was conceptually a
        // Server side error that errored inside this element. That way any stack
        // traces will point to the nearest JSX that errored - e.g. during
        // serialization.
        var erroredComponent = {
          name: getComponentNameFromType(element.type) || '',
          owner: element._owner
        };
        // $FlowFixMe[cannot-write]
        erroredComponent.debugStack = element._debugStack;
        if (supportsCreateTask) {
          // $FlowFixMe[cannot-write]
          erroredComponent.debugTask = element._debugTask;
        }
        chunk._debugInfo.push(erroredComponent);
      }
    }
    triggerErrorOnChunk(response, chunk, error);
  }
  promise.then(fulfill, reject);

  // Return a place holder value for now.
  return null;
}
function resolveLazy(value) {
  while (typeof value === 'object' && value !== null && value.$$typeof === REACT_LAZY_TYPE) {
    var payload = value._payload;
    if (payload.status === INITIALIZED) {
      value = payload.value;
      continue;
    }
    break;
  }
  return value;
}
function transferReferencedDebugInfo(parentChunk, referencedChunk) {
  {
    // We add the debug info to the initializing chunk since the resolution of
    // that promise is also blocked by the referenced debug info. By adding it
    // to both we can track it even if the array/element/lazy is extracted, or
    // if the root is rendered as is.
    if (parentChunk !== null) {
      var referencedDebugInfo = referencedChunk._debugInfo;
      var parentDebugInfo = parentChunk._debugInfo;
      for (var i = 0; i < referencedDebugInfo.length; ++i) {
        var debugInfoEntry = referencedDebugInfo[i];
        if (debugInfoEntry.name != null) ; else {
          parentDebugInfo.push(debugInfoEntry);
        }
      }
    }
  }
}
function getOutlinedModel(response, reference, parentObject, key, map) {
  var path = reference.split(':');
  var id = parseInt(path[0], 16);
  var chunk = getChunk(response, id);
  {
    if (initializingChunk !== null && isArray(initializingChunk._children)) {
      initializingChunk._children.push(chunk);
    }
  }
  switch (chunk.status) {
    case RESOLVED_MODEL:
      initializeModelChunk(chunk);
      break;
    case RESOLVED_MODULE:
      initializeModuleChunk(chunk);
      break;
  }
  // The status might have changed after initialization.
  switch (chunk.status) {
    case INITIALIZED:
      var value = chunk.value;
      for (var i = 1; i < path.length; i++) {
        while (typeof value === 'object' && value !== null && value.$$typeof === REACT_LAZY_TYPE) {
          var referencedChunk = value._payload;
          switch (referencedChunk.status) {
            case RESOLVED_MODEL:
              initializeModelChunk(referencedChunk);
              break;
            case RESOLVED_MODULE:
              initializeModuleChunk(referencedChunk);
              break;
          }
          switch (referencedChunk.status) {
            case INITIALIZED:
              {
                value = referencedChunk.value;
                break;
              }
            case BLOCKED:
            case PENDING:
              {
                return waitForReference(referencedChunk, parentObject, key, response, map, path.slice(i - 1), isInitializingDebugInfo);
              }
            case HALTED:
              {
                // Add a dependency that will never resolve.
                // TODO: Mark downstreams as halted too.
                var handler = void 0;
                if (initializingHandler) {
                  handler = initializingHandler;
                  handler.deps++;
                } else {
                  handler = initializingHandler = {
                    parent: null,
                    chunk: null,
                    value: null,
                    reason: null,
                    deps: 1,
                    errored: false
                  };
                }
                return null;
              }
            default:
              {
                // This is an error. Instead of erroring directly, we're going to encode this on
                // an initialization handler so that we can catch it at the nearest Element.
                if (initializingHandler) {
                  initializingHandler.errored = true;
                  initializingHandler.value = null;
                  initializingHandler.reason = referencedChunk.reason;
                } else {
                  initializingHandler = {
                    parent: null,
                    chunk: null,
                    value: null,
                    reason: referencedChunk.reason,
                    deps: 0,
                    errored: true
                  };
                }
                return null;
              }
          }
        }
        value = value[path[i]];
      }
      while (typeof value === 'object' && value !== null && value.$$typeof === REACT_LAZY_TYPE) {
        // If what we're referencing is a Lazy it must be because we inserted one as a virtual node
        // while it was blocked by other data. If it's no longer blocked, we can unwrap it.
        var _referencedChunk2 = value._payload;
        switch (_referencedChunk2.status) {
          case RESOLVED_MODEL:
            initializeModelChunk(_referencedChunk2);
            break;
          case RESOLVED_MODULE:
            initializeModuleChunk(_referencedChunk2);
            break;
        }
        switch (_referencedChunk2.status) {
          case INITIALIZED:
            {
              value = _referencedChunk2.value;
              continue;
            }
        }
        break;
      }
      var chunkValue = map(response, value, parentObject, key);
      {
        if (parentObject[0] === REACT_ELEMENT_TYPE && (key === '4' || key === '5')) ; else if (isInitializingDebugInfo) ; else {
          transferReferencedDebugInfo(initializingChunk, chunk);
        }
      }
      return chunkValue;
    case PENDING:
    case BLOCKED:
      return waitForReference(chunk, parentObject, key, response, map, path, isInitializingDebugInfo);
    case HALTED:
      {
        // Add a dependency that will never resolve.
        // TODO: Mark downstreams as halted too.
        var _handler;
        if (initializingHandler) {
          _handler = initializingHandler;
          _handler.deps++;
        } else {
          _handler = initializingHandler = {
            parent: null,
            chunk: null,
            value: null,
            reason: null,
            deps: 1,
            errored: false
          };
        }
        return null;
      }
    default:
      // This is an error. Instead of erroring directly, we're going to encode this on
      // an initialization handler so that we can catch it at the nearest Element.
      if (initializingHandler) {
        initializingHandler.errored = true;
        initializingHandler.value = null;
        initializingHandler.reason = chunk.reason;
      } else {
        initializingHandler = {
          parent: null,
          chunk: null,
          value: null,
          reason: chunk.reason,
          deps: 0,
          errored: true
        };
      }
      // Placeholder
      return null;
  }
}
function createMap(response, model) {
  return new Map(model);
}
function createSet(response, model) {
  return new Set(model);
}
function createBlob(response, model) {
  return new Blob(model.slice(1), {
    type: model[0]
  });
}
function createFormData(response, model) {
  var formData = new FormData();
  for (var i = 0; i < model.length; i++) {
    formData.append(model[i][0], model[i][1]);
  }
  return formData;
}
function applyConstructor(response, model, parentObject, key) {
  Object.setPrototypeOf(parentObject, model.prototype);
  // Delete the property. It was just a placeholder.
  return undefined;
}
function defineLazyGetter(response, chunk, parentObject, key) {
  // We don't immediately initialize it even if it's resolved.
  // Instead, we wait for the getter to get accessed.
  if (key !== __PROTO__) {
    Object.defineProperty(parentObject, key, {
      get: function () {
        if (chunk.status === RESOLVED_MODEL) {
          // If it was now resolved, then we initialize it. This may then discover
          // a new set of lazy references that are then asked for eagerly in case
          // we get that deep.
          initializeModelChunk(chunk);
        }
        switch (chunk.status) {
          case INITIALIZED:
            {
              return chunk.value;
            }
          case ERRORED:
            throw chunk.reason;
        }
        // Otherwise, we didn't have enough time to load the object before it was
        // accessed or the connection closed. So we just log that it was omitted.
        // TODO: We should ideally throw here to indicate a difference.
        return OMITTED_PROP_ERROR;
      },
      // no-op: the walk function may try to reassign this property after
      // parseModelString returns. With the JSON.parse reviver, the engine's
      // internal CreateDataProperty silently failed. We use a no-op setter
      // to match that behavior in strict mode.
      set: function () {},
      enumerable: true,
      configurable: false
    });
  }
  return null;
}
function extractIterator(response, model) {
  // $FlowFixMe[incompatible-use]: This uses raw Symbols because we're extracting from a native array.
  return model[Symbol.iterator]();
}
function createModel(response, model) {
  return model;
}
var mightHaveStaticConstructor = /\bclass\b.*\bstatic\b/;
function getInferredFunctionApproximate(code) {
  var slicedCode;
  if (code.startsWith('Object.defineProperty(')) {
    slicedCode = code.slice('Object.defineProperty('.length);
  } else if (code.startsWith('(')) {
    slicedCode = code.slice(1);
  } else {
    slicedCode = code;
  }
  if (slicedCode.startsWith('async function')) {
    var idx = slicedCode.indexOf('(', 14);
    if (idx !== -1) {
      var name = slicedCode.slice(14, idx).trim();
      // eslint-disable-next-line no-eval
      return (0, eval)('({' + JSON.stringify(name) + ':async function(){}})')[name];
    }
  } else if (slicedCode.startsWith('function')) {
    var _idx = slicedCode.indexOf('(', 8);
    if (_idx !== -1) {
      var _name = slicedCode.slice(8, _idx).trim();
      // eslint-disable-next-line no-eval
      return (0, eval)('({' + JSON.stringify(_name) + ':function(){}})')[_name];
    }
  } else if (slicedCode.startsWith('class')) {
    var _idx2 = slicedCode.indexOf('{', 5);
    if (_idx2 !== -1) {
      var _name2 = slicedCode.slice(5, _idx2).trim();
      // eslint-disable-next-line no-eval
      return (0, eval)('({' + JSON.stringify(_name2) + ':class{}})')[_name2];
    }
  }
  return function () {};
}
function parseModelString(response, parentObject, key, value) {
  if (value[0] === '$') {
    if (value === '$') {
      // A very common symbol.
      if (initializingHandler !== null && key === '0') {
        // We we already have an initializing handler and we're abound to enter
        // a new element, we need to shadow it because we're now in a new scope.
        // This is effectively the "begin" or "push" phase of Element parsing.
        // We'll pop later when we parse the array itself.
        initializingHandler = {
          parent: initializingHandler,
          chunk: null,
          value: null,
          reason: null,
          deps: 0,
          errored: false
        };
      }
      return REACT_ELEMENT_TYPE;
    }
    switch (value[1]) {
      case '$':
        {
          // This was an escaped string value.
          return value.slice(1);
        }
      case 'L':
        {
          // Lazy node
          var id = parseInt(value.slice(2), 16);
          var chunk = getChunk(response, id);
          {
            if (initializingChunk !== null && isArray(initializingChunk._children)) {
              initializingChunk._children.push(chunk);
            }
          }
          // We create a React.lazy wrapper around any lazy values.
          // When passed into React, we'll know how to suspend on this.
          return createLazyChunkWrapper(chunk, 0);
        }
      case '@':
        {
          // Promise
          var _id = parseInt(value.slice(2), 16);
          var _chunk = getChunk(response, _id);
          {
            if (initializingChunk !== null && isArray(initializingChunk._children)) {
              initializingChunk._children.push(_chunk);
            }
          }
          return _chunk;
        }
      case 'S':
        {
          // Symbol
          return Symbol.for(value.slice(2));
        }
      case 'h':
        {
          // Server Reference
          var ref = value.slice(2);
          return getOutlinedModel(response, ref, parentObject, key, loadServerReference);
        }
      case 'T':
        {
          // Temporary Reference
          var reference = '$' + value.slice(2);
          var temporaryReferences = response._tempRefs;
          if (temporaryReferences == null) {
            throw new Error('Missing a temporary reference set but the RSC response returned a temporary reference. ' + 'Pass a temporaryReference option with the set that was used with the reply.');
          }
          return readTemporaryReference(temporaryReferences, reference);
        }
      case 'Q':
        {
          // Map
          var _ref = value.slice(2);
          return getOutlinedModel(response, _ref, parentObject, key, createMap);
        }
      case 'W':
        {
          // Set
          var _ref2 = value.slice(2);
          return getOutlinedModel(response, _ref2, parentObject, key, createSet);
        }
      case 'B':
        {
          // Blob
          var _ref3 = value.slice(2);
          return getOutlinedModel(response, _ref3, parentObject, key, createBlob);
        }
      case 'K':
        {
          // FormData
          var _ref4 = value.slice(2);
          return getOutlinedModel(response, _ref4, parentObject, key, createFormData);
        }
      case 'Z':
        {
          // Error
          {
            var _ref5 = value.slice(2);
            return getOutlinedModel(response, _ref5, parentObject, key, resolveErrorDev);
          }
        }
      case 'i':
        {
          // Iterator
          var _ref6 = value.slice(2);
          return getOutlinedModel(response, _ref6, parentObject, key, extractIterator);
        }
      case 'I':
        {
          // $Infinity
          return Infinity;
        }
      case '-':
        {
          // $-0 or $-Infinity
          if (value === '$-0') {
            return -0;
          } else {
            return -Infinity;
          }
        }
      case 'N':
        {
          // $NaN
          return NaN;
        }
      case 'u':
        {
          // matches "$undefined"
          // Special encoding for `undefined` which can't be serialized as JSON otherwise.
          return undefined;
        }
      case 'D':
        {
          // Date
          return new Date(Date.parse(value.slice(2)));
        }
      case 'n':
        {
          // BigInt
          return BigInt(value.slice(2));
        }
      case 'P':
        {
          {
            // In DEV mode we allow debug objects to specify themselves as instances of
            // another constructor.
            var _ref7 = value.slice(2);
            return getOutlinedModel(response, _ref7, parentObject, key, applyConstructor);
          }
          //Fallthrough
        }
      case 'E':
        {
          {
            // In DEV mode we allow indirect eval to produce functions for logging.
            // This should not compile to eval() because then it has local scope access.
            var code = value.slice(2);
            try {
              // If this might be a class constructor with a static initializer or
              // static constructor then don't eval it. It might cause unexpected
              // side-effects. Instead, fallback to parsing out the function type
              // and name.
              if (!mightHaveStaticConstructor.test(code)) {
                // eslint-disable-next-line no-eval
                return (0, eval)(code);
              }
            } catch (x) {
              // Fallthrough to fallback case.
            }
            // We currently use this to express functions so we fail parsing it,
            // let's just return a blank function as a place holder.
            var fn;
            try {
              fn = getInferredFunctionApproximate(code);
              if (code.startsWith('Object.defineProperty(')) {
                var DESCRIPTOR = ',"name",{value:"';
                var idx = code.lastIndexOf(DESCRIPTOR);
                if (idx !== -1) {
                  var name = JSON.parse(code.slice(idx + DESCRIPTOR.length - 1, code.length - 2));
                  // $FlowFixMe[cannot-write]
                  Object.defineProperty(fn, 'name', {
                    value: name
                  });
                }
              }
            } catch (_) {
              fn = function () {};
            }
            return fn;
          }
          // Fallthrough
        }
      case 'Y':
        {
          {
            if (value.length > 2) {
              var debugChannelCallback = response._debugChannel && response._debugChannel.callback;
              if (debugChannelCallback) {
                if (value[2] === '@') {
                  // This is a deferred Promise.
                  var _ref9 = value.slice(3); // We assume this doesn't have a path just id.
                  var _id3 = parseInt(_ref9, 16);
                  if (!response._chunks.has(_id3)) {
                    // We haven't seen this id before. Query the server to start sending it.
                    debugChannelCallback('P:' + _ref9);
                  }
                  // Start waiting. This now creates a pending chunk if it doesn't already exist.
                  // This is the actual Promise we're waiting for.
                  return getChunk(response, _id3);
                }
                var _ref8 = value.slice(2); // We assume this doesn't have a path just id.
                var _id2 = parseInt(_ref8, 16);
                if (!response._chunks.has(_id2)) {
                  // We haven't seen this id before. Query the server to start sending it.
                  debugChannelCallback('Q:' + _ref8);
                }
                // Start waiting. This now creates a pending chunk if it doesn't already exist.
                var _chunk2 = getChunk(response, _id2);
                if (_chunk2.status === INITIALIZED) {
                  // We already loaded this before. We can just use the real value.
                  return _chunk2.value;
                }
                return defineLazyGetter(response, _chunk2, parentObject, key);
              }
            }

            // In DEV mode we encode omitted objects in logs as a getter that throws
            // so that when you try to access it on the client, you know why that
            // happened.
            if (key !== __PROTO__) {
              Object.defineProperty(parentObject, key, {
                get: function () {
                  // TODO: We should ideally throw here to indicate a difference.
                  return OMITTED_PROP_ERROR;
                },
                // no-op: the walk function may try to reassign this property
                // after parseModelString returns. With the JSON.parse reviver,
                // the engine's internal CreateDataProperty silently failed.
                // We use a no-op setter to match that behavior in strict mode.
                set: function () {},
                enumerable: true,
                configurable: false
              });
            }
            return null;
          }
          // Fallthrough
        }
      default:
        {
          // We assume that anything else is a reference ID.
          var _ref10 = value.slice(1);
          return getOutlinedModel(response, _ref10, parentObject, key, createModel);
        }
    }
  }
  return value;
}
function parseModelTuple(response, value) {
  var tuple = value;
  if (tuple[0] === REACT_ELEMENT_TYPE) {
    // TODO: Consider having React just directly accept these arrays as elements.
    // Or even change the ReactElement type to be an array.
    return createElement(response, tuple[1], tuple[2], tuple[3], tuple[4] , tuple[5] , tuple[6] );
  }
  return value;
}
function missingCall() {
  throw new Error('Trying to call a function from "use server" but the callServer option ' + 'was not implemented in your router runtime.');
}
function markIOStarted() {
  this._debugIOStarted = true;
}
function ResponseInstance(bundlerConfig, serverReferenceConfig, moduleLoading, callServer, encodeFormAction, nonce, temporaryReferences, allowPartialStream, findSourceMapURL,
// DEV-only
replayConsole,
// DEV-only
environmentName,
// DEV-only
debugStartTime,
// DEV-only
debugEndTime,
// DEV-only
debugChannel // DEV-only
) {
  var chunks = new Map();
  this._bundlerConfig = bundlerConfig;
  this._serverReferenceConfig = serverReferenceConfig;
  this._moduleLoading = moduleLoading;
  this._callServer = callServer !== undefined ? callServer : missingCall;
  this._encodeFormAction = encodeFormAction;
  this._nonce = nonce;
  this._chunks = chunks;
  this._stringDecoder = createStringDecoder();
  this._closed = false;
  this._closedReason = null;
  this._allowPartialStream = allowPartialStream;
  this._tempRefs = temporaryReferences;
  {
    this._timeOrigin = 0;
    this._pendingInitialRender = null;
  }
  {
    this._pendingChunks = 0;
    this._weakResponse = {
      weak: new WeakRef(this),
      response: this
    };
    // TODO: The Flight Client can be used in a Client Environment too and we should really support
    // getting the owner there as well, but currently the owner of ReactComponentInfo is typed as only
    // supporting other ReactComponentInfo as owners (and not Fiber or Fizz's ComponentStackNode).
    // We need to update all the callsites consuming ReactComponentInfo owners to support those.
    // In the meantime we only check ReactSharedInteralsServer since we know that in an RSC environment
    // the only owners will be ReactComponentInfo.
    var rootOwner = ReactSharedInteralsServer === undefined || ReactSharedInteralsServer.A === null ? null : ReactSharedInteralsServer.A.getOwner();
    this._debugRootOwner = rootOwner;
    this._debugRootStack = rootOwner !== null ?
    // TODO: Consider passing the top frame in so we can avoid internals showing up.
    new Error('react-stack-top-frame') : null;
    var rootEnv = environmentName === undefined ? 'Server' : environmentName;
    if (supportsCreateTask) {
      // Any stacks that appear on the server need to be rooted somehow on the client
      // so we create a root Task for this response which will be the root owner for any
      // elements created by the server. We use the "use server" string to indicate that
      // this is where we enter the server from the client.
      // TODO: Make this string configurable.
      this._debugRootTask = console.createTask('"use ' + rootEnv.toLowerCase() + '"');
    }
    {
      // Track the start of the fetch to the best of our knowledge.
      // Note: createFromFetch allows this to be marked at the start of the fetch
      // where as if you use createFromReadableStream from the body of the fetch
      // then the start time is when the headers resolved.
      this._debugStartTime = debugStartTime == null ? performance.now() : debugStartTime;
      this._debugIOStarted = false;
      // We consider everything before the first setTimeout task to be cached data
      // and is not considered I/O required to load the stream.
      setTimeout(markIOStarted.bind(this), 0);
    }
    this._debugEndTime = debugEndTime == null ? null : debugEndTime;
    this._debugFindSourceMapURL = findSourceMapURL;
    this._debugChannel = debugChannel;
    this._blockedConsole = null;
    this._replayConsole = replayConsole;
    this._rootEnvironmentName = rootEnv;
    if (debugChannel) {
      if (debugChannelRegistry === null) {
        // We can't safely clean things up later, so we immediately close the
        // debug channel.
        closeDebugChannel(debugChannel);
        this._debugChannel = undefined;
      } else {
        // When a Response gets GC:ed because nobody is referring to any of the
        // objects that lazily load from the Response anymore, then we can close
        // the debug channel.
        debugChannelRegistry.register(this, debugChannel, this);
      }
    }
  }
  {
    // Since we don't know when recording of profiles will start and stop, we have to
    // mark the order over and over again.
    if (replayConsole) {
      markAllTracksInOrder();
    }
  }
}
function createResponse(bundlerConfig, serverReferenceConfig, moduleLoading, callServer, encodeFormAction, nonce, temporaryReferences, allowPartialStream, findSourceMapURL,
// DEV-only
replayConsole,
// DEV-only
environmentName,
// DEV-only
debugStartTime,
// DEV-only
debugEndTime,
// DEV-only
debugChannel // DEV-only
) {
  {
    // We use eval to create fake function stacks which includes Component stacks.
    // A warning would be noise if you used Flight without Components and don't encounter
    // errors. We're warning eagerly so that you configure your environment accordingly
    // before you encounter an error.
    checkEvalAvailabilityOnceDev();
  }
  return getWeakResponse(
  // $FlowFixMe[invalid-constructor]: the shapes are exact here but Flow doesn't like constructors
  new ResponseInstance(bundlerConfig, serverReferenceConfig, moduleLoading, callServer, encodeFormAction, nonce, temporaryReferences, allowPartialStream, findSourceMapURL, replayConsole, environmentName, debugStartTime, debugEndTime, debugChannel));
}
function createStreamState(weakResponse,
// DEV-only
streamDebugValue // DEV-only
) {
  var streamState = {
    _rowState: 0,
    _rowID: 0,
    _rowTag: 0,
    _rowLength: 0,
    _buffer: []
  };
  {
    var response = unwrapWeakResponse(weakResponse);
    // Create an entry for the I/O to load the stream itself.
    var debugValuePromise = Promise.resolve(streamDebugValue);
    debugValuePromise.status = 'fulfilled';
    debugValuePromise.value = streamDebugValue;
    streamState._debugInfo = {
      name: 'rsc stream',
      start: response._debugStartTime,
      end: response._debugStartTime,
      // will be updated once we finish a chunk
      byteSize: 0,
      // will be updated as we resolve a data chunk
      value: debugValuePromise,
      owner: response._debugRootOwner,
      debugStack: response._debugRootStack,
      debugTask: response._debugRootTask
    };
    streamState._debugTargetChunkSize = MIN_CHUNK_SIZE;
  }
  return streamState;
}

// Depending on set up the chunks of a TLS connection can vary in size. However in practice it's often
// at 64kb or even multiples of 64kb. It can also be smaller but in practice it also happens that 64kb
// is around what you can download on fast 4G connection in 300ms which is what we throttle reveals at
// anyway. The net effect is that in practice, you won't really reveal anything in smaller units than
// 64kb if they're revealing at maximum speed in production. Therefore we group smaller chunks into
// these larger chunks since in production that's more realistic.
// TODO: If the stream is compressed, then you could fit much more in a single 300ms so maybe it should
// actually be larger.
var MIN_CHUNK_SIZE = 65536;
function incrementChunkDebugInfo(streamState, chunkLength) {
  {
    var debugInfo = streamState._debugInfo;
    var endTime = performance.now();
    var previousEndTime = debugInfo.end;
    var newByteLength = debugInfo.byteSize + chunkLength;
    if (newByteLength > streamState._debugTargetChunkSize || endTime > previousEndTime + 10) {
      // This new chunk would overshoot the chunk size so therefore we treat it as its own new chunk
      // by cloning the old one. Similarly, if some time has passed we assume that it was actually
      // due to the server being unable to flush chunks faster e.g. due to I/O so it would be a
      // new chunk in production even if the buffer hasn't been reached.
      streamState._debugInfo = {
        name: debugInfo.name,
        start: debugInfo.start,
        end: endTime,
        byteSize: newByteLength,
        value: debugInfo.value,
        owner: debugInfo.owner,
        debugStack: debugInfo.debugStack,
        debugTask: debugInfo.debugTask
      };
      streamState._debugTargetChunkSize = newByteLength + MIN_CHUNK_SIZE;
    } else {
      // Otherwise we reuse the old chunk but update the end time and byteSize to the latest.
      // $FlowFixMe[cannot-write]
      debugInfo.end = endTime;
      // $FlowFixMe[cannot-write]
      debugInfo.byteSize = newByteLength;
    }
  }
}
function addAsyncInfo(chunk, asyncInfo) {
  var value = resolveLazy(chunk.value);
  if (typeof value === 'object' && value !== null && (isArray(value) || typeof value[ASYNC_ITERATOR] === 'function' || value.$$typeof === REACT_ELEMENT_TYPE || value.$$typeof === REACT_LAZY_TYPE)) {
    if (isArray(value._debugInfo)) {
      // $FlowFixMe[method-unbinding]
      value._debugInfo.push(asyncInfo);
    } else if (!Object.isFrozen(value)) {
      // TODO: Debug info is dropped for frozen elements. See the TODO in
      // moveDebugInfoFromChunkToInnerValue.
      Object.defineProperty(value, '_debugInfo', {
        configurable: false,
        enumerable: false,
        writable: true,
        value: [asyncInfo]
      });
    }
  } else {
    // $FlowFixMe[method-unbinding]
    chunk._debugInfo.push(asyncInfo);
  }
}
function resolveChunkDebugInfo(response, streamState, chunk) {
  {
    // Only include stream information after a macrotask. Any chunk processed
    // before that is considered cached data.
    if (response._debugIOStarted) {
      // Add the currently resolving chunk's debug info representing the stream
      // to the Promise that was waiting on the stream, or its underlying value.
      var asyncInfo = {
        awaited: streamState._debugInfo
      };
      if (chunk.status === PENDING || chunk.status === BLOCKED) {
        var boundAddAsyncInfo = addAsyncInfo.bind(null, chunk, asyncInfo);
        chunk.then(boundAddAsyncInfo, boundAddAsyncInfo);
      } else {
        addAsyncInfo(chunk, asyncInfo);
      }
    }
  }
}
function resolveDebugHalt(response, id) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);
  if (!chunk) {
    chunks.set(id, chunk = createPendingChunk(response));
  }
  if (chunk.status !== PENDING && chunk.status !== BLOCKED) {
    return;
  }
  releasePendingChunk(response, chunk);
  var haltedChunk = chunk;
  haltedChunk.status = HALTED;
  haltedChunk.value = null;
  haltedChunk.reason = null;
}
function resolveModel(response, id, model, streamState) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);
  if (!chunk) {
    var newChunk = createResolvedModelChunk(response, model);
    {
      resolveChunkDebugInfo(response, streamState, newChunk);
    }
    chunks.set(id, newChunk);
  } else {
    {
      resolveChunkDebugInfo(response, streamState, chunk);
    }
    resolveModelChunk(response, chunk, model);
  }
}
function resolveText(response, id, text, streamState) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);
  if (chunk && chunk.status !== PENDING) {
    // If we get more data to an already resolved ID, we assume that it's
    // a stream chunk since any other row shouldn't have more than one entry.
    var streamChunk = chunk;
    var controller = streamChunk.reason;
    controller.enqueueValue(text);
    return;
  }
  if (chunk) {
    releasePendingChunk(response, chunk);
  }
  var newChunk = createInitializedTextChunk(response, text);
  {
    resolveChunkDebugInfo(response, streamState, newChunk);
  }
  chunks.set(id, newChunk);
}
function resolveBuffer(response, id, buffer, streamState) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);
  if (chunk && chunk.status !== PENDING) {
    // If we get more data to an already resolved ID, we assume that it's
    // a stream chunk since any other row shouldn't have more than one entry.
    var streamChunk = chunk;
    var controller = streamChunk.reason;
    controller.enqueueValue(buffer);
    return;
  }
  if (chunk) {
    releasePendingChunk(response, chunk);
  }
  var newChunk = createInitializedBufferChunk(response, buffer);
  {
    resolveChunkDebugInfo(response, streamState, newChunk);
  }
  chunks.set(id, newChunk);
}
function resolveModule(response, id, model, streamState) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);
  var clientReferenceMetadata = parseModel(response, model);
  var clientReference = resolveClientReference(response._bundlerConfig, clientReferenceMetadata);

  // TODO: Add an option to encode modules that are lazy loaded.
  // For now we preload all modules as early as possible since it's likely
  // that we'll need them.
  var promise = preloadModule(clientReference);
  if (promise) {
    var blockedChunk;
    if (!chunk) {
      // Technically, we should just treat promise as the chunk in this
      // case. Because it'll just behave as any other promise.
      blockedChunk = createBlockedChunk();
      chunks.set(id, blockedChunk);
    } else {
      releasePendingChunk(response, chunk);
      // This can't actually happen because we don't have any forward
      // references to modules.
      blockedChunk = chunk;
      blockedChunk.status = BLOCKED;
    }
    {
      resolveChunkDebugInfo(response, streamState, blockedChunk);
    }
    promise.then(function () {
      return resolveModuleChunk(response, blockedChunk, clientReference);
    }, function (error) {
      return triggerErrorOnChunk(response, blockedChunk, error);
    });
  } else {
    if (!chunk) {
      var newChunk = createResolvedModuleChunk(response, clientReference);
      {
        resolveChunkDebugInfo(response, streamState, newChunk);
      }
      chunks.set(id, newChunk);
    } else {
      {
        resolveChunkDebugInfo(response, streamState, chunk);
      }
      // This can't actually happen because we don't have any forward
      // references to modules.
      resolveModuleChunk(response, chunk, clientReference);
    }
  }
}
function resolveStream(response, id, stream, controller, streamState) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);
  if (!chunk) {
    var newChunk = createInitializedStreamChunk(response, stream, controller);
    {
      resolveChunkDebugInfo(response, streamState, newChunk);
    }
    chunks.set(id, newChunk);
    return;
  }
  {
    resolveChunkDebugInfo(response, streamState, chunk);
  }
  if (chunk.status !== PENDING) {
    // We already resolved. We didn't expect to see this.
    return;
  }
  var resolveListeners = chunk.value;
  {
    // Initialize any debug info and block the initializing chunk on any
    // unresolved entries.
    if (chunk._debugChunk != null) {
      var prevHandler = initializingHandler;
      var prevChunk = initializingChunk;
      initializingHandler = null;
      var cyclicChunk = chunk;
      cyclicChunk.status = BLOCKED;
      cyclicChunk.value = null;
      cyclicChunk.reason = null;
      {
        initializingChunk = cyclicChunk;
      }
      try {
        initializeDebugChunk(response, chunk);
        if (initializingHandler !== null) {
          if (initializingHandler.errored) {
            // Ignore error parsing debug info, we'll report the original error instead.
          } else if (initializingHandler.deps > 0) {
            // Leave blocked until we can resolve all the debug info.
            initializingHandler.value = stream;
            initializingHandler.reason = controller;
            initializingHandler.chunk = cyclicChunk;
            return;
          }
        }
      } finally {
        initializingHandler = prevHandler;
        initializingChunk = prevChunk;
      }
    }
  }
  var resolvedChunk = chunk;
  resolvedChunk.status = INITIALIZED;
  resolvedChunk.value = stream;
  resolvedChunk.reason = controller;
  if (resolveListeners !== null) {
    wakeChunk(response, resolveListeners, chunk.value, chunk);
  } else {
    {
      processChunkDebugInfo(response, resolvedChunk, stream);
    }
  }
}
function startReadableStream(response, id, type, streamState) {
  var controller = null;
  var closed = false;
  var stream = new ReadableStream({
    type: type,
    start: function (c) {
      controller = c;
    }
  });
  var previousBlockedChunk = null;
  var flightController = {
    enqueueValue: function (value) {
      if (previousBlockedChunk === null) {
        controller.enqueue(value);
      } else {
        // We're still waiting on a previous chunk so we can't enqueue quite yet.
        previousBlockedChunk.then(function () {
          controller.enqueue(value);
        });
      }
    },
    enqueueModel: function (json) {
      if (previousBlockedChunk === null) {
        // If we're not blocked on any other chunks, we can try to eagerly initialize
        // this as a fast-path to avoid awaiting them.
        var chunk = createResolvedModelChunk(response, json);
        initializeModelChunk(chunk);
        var initializedChunk = chunk;
        if (initializedChunk.status === INITIALIZED) {
          controller.enqueue(initializedChunk.value);
        } else {
          chunk.then(function (v) {
            return controller.enqueue(v);
          }, function (e) {
            return controller.error(e);
          });
          previousBlockedChunk = chunk;
        }
      } else {
        // We're still waiting on a previous chunk so we can't enqueue quite yet.
        var blockedChunk = previousBlockedChunk;
        var _chunk3 = createPendingChunk(response);
        _chunk3.then(function (v) {
          return controller.enqueue(v);
        }, function (e) {
          return controller.error(e);
        });
        previousBlockedChunk = _chunk3;
        blockedChunk.then(function () {
          if (previousBlockedChunk === _chunk3) {
            // We were still the last chunk so we can now clear the queue and return
            // to synchronous emitting.
            previousBlockedChunk = null;
          }
          resolveModelChunk(response, _chunk3, json);
        });
      }
    },
    close: function (json) {
      if (closed) {
        return;
      }
      closed = true;
      if (previousBlockedChunk === null) {
        controller.close();
      } else {
        var blockedChunk = previousBlockedChunk;
        // We shouldn't get any more enqueues after this so we can set it back to null.
        previousBlockedChunk = null;
        blockedChunk.then(function () {
          return controller.close();
        });
      }
    },
    error: function (error) {
      if (closed) {
        return;
      }
      closed = true;
      if (previousBlockedChunk === null) {
        // $FlowFixMe[incompatible-call]
        controller.error(error);
      } else {
        var blockedChunk = previousBlockedChunk;
        // We shouldn't get any more enqueues after this so we can set it back to null.
        previousBlockedChunk = null;
        blockedChunk.then(function () {
          return controller.error(error);
        });
      }
    }
  };
  resolveStream(response, id, stream, flightController, streamState);
}
function asyncIterator() {
  // Self referencing iterator.
  return this;
}
function createIterator(next) {
  var iterator = {
    next: next
    // TODO: Add return/throw as options for aborting.
  };
  // TODO: The iterator could inherit the AsyncIterator prototype which is not exposed as
  // a global but exists as a prototype of an AsyncGenerator. However, it's not needed
  // to satisfy the iterable protocol.
  iterator[ASYNC_ITERATOR] = asyncIterator;
  return iterator;
}
function startAsyncIterable(response, id, iterator, streamState) {
  var buffer = [];
  var closed = false;
  var nextWriteIndex = 0;
  var flightController = {
    enqueueValue: function (value) {
      if (nextWriteIndex === buffer.length) {
        buffer[nextWriteIndex] = createInitializedIteratorResultChunk(response, value, false);
      } else {
        var chunk = buffer[nextWriteIndex];
        var resolveListeners = chunk.value;
        var rejectListeners = chunk.reason;
        var initializedChunk = chunk;
        initializedChunk.status = INITIALIZED;
        initializedChunk.value = {
          done: false,
          value: value
        };
        initializedChunk.reason = null;
        if (resolveListeners !== null) {
          wakeChunkIfInitialized(response, chunk, resolveListeners, rejectListeners);
        }
      }
      nextWriteIndex++;
    },
    enqueueModel: function (value) {
      if (nextWriteIndex === buffer.length) {
        buffer[nextWriteIndex] = createResolvedIteratorResultChunk(response, value, false);
      } else {
        resolveIteratorResultChunk(response, buffer[nextWriteIndex], value, false);
      }
      nextWriteIndex++;
    },
    close: function (value) {
      if (closed) {
        return;
      }
      closed = true;
      if (nextWriteIndex === buffer.length) {
        buffer[nextWriteIndex] = createResolvedIteratorResultChunk(response, value, true);
      } else {
        resolveIteratorResultChunk(response, buffer[nextWriteIndex], value, true);
      }
      nextWriteIndex++;
      while (nextWriteIndex < buffer.length) {
        // In generators, any extra reads from the iterator have the value undefined.
        resolveIteratorResultChunk(response, buffer[nextWriteIndex++], '"$undefined"', true);
      }
    },
    error: function (error) {
      if (closed) {
        return;
      }
      closed = true;
      if (nextWriteIndex === buffer.length) {
        buffer[nextWriteIndex] = createPendingChunk(response);
      }
      while (nextWriteIndex < buffer.length) {
        triggerErrorOnChunk(response, buffer[nextWriteIndex++], error);
      }
    }
  };
  var iterable = {};
  // $FlowFixMe[cannot-write]
  iterable[ASYNC_ITERATOR] = function () {
    var nextReadIndex = 0;
    return createIterator(function (arg) {
      if (arg !== undefined) {
        throw new Error('Values cannot be passed to next() of AsyncIterables passed to Client Components.');
      }
      if (nextReadIndex === buffer.length) {
        if (closed) {
          // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
          return new ReactPromise(INITIALIZED, {
            done: true,
            value: undefined
          }, null);
        }
        buffer[nextReadIndex] = createPendingChunk(response);
      }
      return buffer[nextReadIndex++];
    });
  };

  // TODO: If it's a single shot iterator we can optimize memory by cleaning up the buffer after
  // reading through the end, but currently we favor code size over this optimization.
  resolveStream(response, id, iterator ? iterable[ASYNC_ITERATOR]() : iterable, flightController, streamState);
}
function stopStream(response, id, row) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);
  if (!chunk || chunk.status !== INITIALIZED) {
    // We didn't expect not to have an existing stream;
    return;
  }
  {
    if (--response._pendingChunks === 0) {
      // We're no longer waiting for any more chunks. We can release the strong
      // reference to the response. We'll regain it if we ask for any more data
      // later on.
      response._weakResponse.response = null;
    }
  }
  var streamChunk = chunk;
  var controller = streamChunk.reason;
  controller.close(row === '' ? '"$undefined"' : row);
}
function resolveErrorDev(response, errorInfo) {
  var name = errorInfo.name;
  var message = errorInfo.message;
  var stack = errorInfo.stack;
  var env = errorInfo.env;
  var error;
  var errorOptions = 'cause' in errorInfo ? {
    cause: reviveModel(response,
    // $FlowFixMe[incompatible-cast] -- Flow thinks `cause` in `cause?: JSONValue` can be undefined after `in` check.
    errorInfo.cause, errorInfo, 'cause')
  } : undefined;
  var callStack = buildFakeCallStack(response, stack, env, false,
  // $FlowFixMe[incompatible-use]
  Error.bind(null, message || 'An error occurred in the Server Components render but no message was provided', errorOptions));
  var ownerTask = null;
  if (errorInfo.owner != null) {
    var ownerRef = errorInfo.owner.slice(1);
    // TODO: This is not resilient to the owner loading later in an Error like a debug channel.
    // The whole error serialization should probably go through the regular model at least for DEV.
    var owner = getOutlinedModel(response, ownerRef, {}, '', createModel);
    if (owner !== null) {
      ownerTask = initializeFakeTask(response, owner);
    }
  }
  if (ownerTask === null) {
    var rootTask = getRootTask(response, env);
    if (rootTask != null) {
      error = rootTask.run(callStack);
    } else {
      error = callStack();
    }
  } else {
    error = ownerTask.run(callStack);
  }
  error.name = name;
  error.environmentName = env;
  return error;
}
function resolveErrorModel(response, id, row, streamState) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);
  var errorInfo = JSON.parse(row);
  var error;
  {
    error = resolveErrorDev(response, errorInfo);
  }
  error.digest = errorInfo.digest;
  var errorWithDigest = error;
  if (!chunk) {
    var newChunk = createErrorChunk(response, errorWithDigest);
    {
      resolveChunkDebugInfo(response, streamState, newChunk);
    }
    chunks.set(id, newChunk);
  } else {
    {
      resolveChunkDebugInfo(response, streamState, chunk);
    }
    triggerErrorOnChunk(response, chunk, errorWithDigest);
  }
}
function resolveHint(response, code, model) {
  var hintModel = parseModel(response, model);
  dispatchHint(code, hintModel);
}
var supportsCreateTask = !!console.createTask;
var fakeFunctionCache = new Map() ;
var fakeFunctionIdx = 0;
function createFakeFunction(name, filename, sourceMap, line, col, enclosingLine, enclosingCol, environmentName) {
  // This creates a fake copy of a Server Module. It represents a module that has already
  // executed on the server but we re-execute a blank copy for its stack frames on the client.

  var comment = '/* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */';
  if (!name) {
    // An eval:ed function with no name gets the name "eval". We give it something more descriptive.
    name = '<anonymous>';
  }
  var encodedName = JSON.stringify(name);
  // We generate code where the call is at the line and column of the server executed code.
  // This allows us to use the original source map as the source map of this fake file to
  // point to the original source.
  var code;
  // Normalize line/col to zero based.
  if (enclosingLine < 1) {
    enclosingLine = 0;
  } else {
    enclosingLine--;
  }
  if (enclosingCol < 1) {
    enclosingCol = 0;
  } else {
    enclosingCol--;
  }
  if (line < 1) {
    line = 0;
  } else {
    line--;
  }
  if (col < 1) {
    col = 0;
  } else {
    col--;
  }
  if (line < enclosingLine || line === enclosingLine && col < enclosingCol) {
    // Protection against invalid enclosing information. Should not happen.
    enclosingLine = 0;
    enclosingCol = 0;
  }
  if (line < 1) {
    // Fit everything on the first line.
    var minCol = encodedName.length + 3;
    var enclosingColDistance = enclosingCol - minCol;
    if (enclosingColDistance < 0) {
      enclosingColDistance = 0;
    }
    var colDistance = col - enclosingColDistance - minCol - 3;
    if (colDistance < 0) {
      colDistance = 0;
    }
    code = '({' + encodedName + ':' + ' '.repeat(enclosingColDistance) + '_=>' + ' '.repeat(colDistance) + '_()})';
  } else if (enclosingLine < 1) {
    // Fit just the enclosing function on the first line.
    var _minCol = encodedName.length + 3;
    var _enclosingColDistance = enclosingCol - _minCol;
    if (_enclosingColDistance < 0) {
      _enclosingColDistance = 0;
    }
    code = '({' + encodedName + ':' + ' '.repeat(_enclosingColDistance) + '_=>' + '\n'.repeat(line - enclosingLine) + ' '.repeat(col) + '_()})';
  } else if (enclosingLine === line) {
    // Fit the enclosing function and callsite on same line.
    var _colDistance = col - enclosingCol - 3;
    if (_colDistance < 0) {
      _colDistance = 0;
    }
    code = '\n'.repeat(enclosingLine - 1) + '({' + encodedName + ':\n' + ' '.repeat(enclosingCol) + '_=>' + ' '.repeat(_colDistance) + '_()})';
  } else {
    // This is the ideal because we can always encode any position.
    code = '\n'.repeat(enclosingLine - 1) + '({' + encodedName + ':\n' + ' '.repeat(enclosingCol) + '_=>' + '\n'.repeat(line - enclosingLine) + ' '.repeat(col) + '_()})';
  }
  if (enclosingLine < 1) {
    // If the function starts at the first line, we append the comment after.
    code = code + '\n' + comment;
  } else {
    // Otherwise we prepend the comment on the first line.
    code = comment + code;
  }
  if (filename.startsWith('/')) {
    // If the filename starts with `/` we assume that it is a file system file
    // rather than relative to the current host. Since on the server fully qualified
    // stack traces use the file path.
    // TODO: What does this look like on Windows?
    filename = 'file://' + filename;
  }
  if (sourceMap) {
    // We use the prefix about://React/ to separate these from other files listed in
    // the Chrome DevTools. We need a "host name" and not just a protocol because
    // otherwise the group name becomes the root folder. Ideally we don't want to
    // show these at all but there's two reasons to assign a fake URL.
    // 1) A printed stack trace string needs a unique URL to be able to source map it.
    // 2) If source maps are disabled or fails, you should at least be able to tell
    //    which file it was.
    code += '\n//# sourceURL=about://React/' + encodeURIComponent(environmentName) + '/' + encodeURI(filename) + '?' + fakeFunctionIdx++;
    code += '\n//# sourceMappingURL=' + sourceMap;
  } else if (filename) {
    code += '\n//# sourceURL=' + encodeURI(filename);
  } else {
    code += '\n//# sourceURL=<anonymous>';
  }
  var fn;
  try {
    // eslint-disable-next-line no-eval
    fn = (0, eval)(code)[name];
  } catch (x) {
    // If eval fails, such as if in an environment that doesn't support it,
    // we fallback to creating a function here. It'll still have the right
    // name but it'll lose line/column number and file name.
    fn = function (_) {
      return _();
    };
    // Using the usual {[name]: _() => _()}.bind() trick to avoid minifiers
    // doesn't work here since this will produce `Object.*` names.
    Object.defineProperty(fn,
    // $FlowFixMe[cannot-write] -- `name` is configurable though.
    'name', {
      value: name
    });
  }
  return fn;
}
function buildFakeCallStack(response, stack, environmentName, useEnclosingLine, innerCall) {
  var callStack = innerCall;
  for (var i = 0; i < stack.length; i++) {
    var frame = stack[i];
    var frameKey = frame.join('-') + '-' + environmentName + (useEnclosingLine ? '-e' : '-n');
    var fn = fakeFunctionCache.get(frameKey);
    if (fn === undefined) {
      var name = frame[0],
        filename = frame[1],
        line = frame[2],
        col = frame[3],
        enclosingLine = frame[4],
        enclosingCol = frame[5];
      var findSourceMapURL = response._debugFindSourceMapURL;
      var sourceMap = findSourceMapURL ? findSourceMapURL(filename, environmentName) : null;
      fn = createFakeFunction(name, filename, sourceMap, line, col, useEnclosingLine ? line : enclosingLine, useEnclosingLine ? col : enclosingCol, environmentName);
      // TODO: This cache should technically live on the response since the _debugFindSourceMapURL
      // function is an input and can vary by response.
      fakeFunctionCache.set(frameKey, fn);
    }
    callStack = fn.bind(null, callStack);
  }
  return callStack;
}
function getRootTask(response, childEnvironmentName) {
  var rootTask = response._debugRootTask;
  if (!rootTask) {
    return null;
  }
  if (response._rootEnvironmentName !== childEnvironmentName) {
    // If the root most owner component is itself in a different environment than the requested
    // environment then we create an extra task to indicate that we're transitioning into it.
    // Like if one environment just requests another environment.
    var createTaskFn = console.createTask.bind(console, '"use ' + childEnvironmentName.toLowerCase() + '"');
    return rootTask.run(createTaskFn);
  }
  return rootTask;
}
function initializeFakeTask(response, debugInfo) {
  if (!supportsCreateTask) {
    return null;
  }
  if (debugInfo.stack == null) {
    // If this is an error, we should've really already initialized the task.
    // If it's null, we can't initialize a task.
    return null;
  }
  var cachedEntry = debugInfo.debugTask;
  if (cachedEntry !== undefined) {
    return cachedEntry;
  }

  // Workaround for a bug where Chrome Performance tracking uses the enclosing line/column
  // instead of the callsite. For ReactAsyncInfo/ReactIOInfo, the only thing we're going
  // to use the fake task for is the Performance tracking so we encode the enclosing line/
  // column at the callsite to get a better line number. We could do this for Components too
  // but we're going to use those for other things too like console logs and it's not worth
  // duplicating. If this bug is every fixed in Chrome, this should be set to false.
  var useEnclosingLine = debugInfo.key === undefined;
  var stack = debugInfo.stack;
  var env = debugInfo.env == null ? response._rootEnvironmentName : debugInfo.env;
  var ownerEnv = debugInfo.owner == null || debugInfo.owner.env == null ? response._rootEnvironmentName : debugInfo.owner.env;
  var ownerTask = debugInfo.owner == null ? null : initializeFakeTask(response, debugInfo.owner);
  var taskName =
  // This is the boundary between two environments so we'll annotate the task name.
  // We assume that the stack frame of the entry into the new environment was done
  // from the old environment. So we use the owner's environment as the current.
  env !== ownerEnv ? '"use ' + env.toLowerCase() + '"' :
  // Some unfortunate pattern matching to refine the type.
  debugInfo.key !== undefined ? getServerComponentTaskName(debugInfo) : debugInfo.name !== undefined ? getIOInfoTaskName(debugInfo) : getAsyncInfoTaskName(debugInfo);
  // $FlowFixMe[cannot-write]: We consider this part of initialization.
  return debugInfo.debugTask = buildFakeTask(response, ownerTask, stack, taskName, ownerEnv, useEnclosingLine);
}
function buildFakeTask(response, ownerTask, stack, taskName, env, useEnclosingLine) {
  var createTaskFn = console.createTask.bind(console, taskName);
  var callStack = buildFakeCallStack(response, stack, env, useEnclosingLine, createTaskFn);
  if (ownerTask === null) {
    var rootTask = getRootTask(response, env);
    if (rootTask != null) {
      return rootTask.run(callStack);
    } else {
      return callStack();
    }
  } else {
    return ownerTask.run(callStack);
  }
}
var createFakeJSXCallStack = {
  react_stack_bottom_frame: function (response, stack, environmentName) {
    var callStackForError = buildFakeCallStack(response, stack, environmentName, false, fakeJSXCallSite);
    return callStackForError();
  }
};
var createFakeJSXCallStackInDEV = // We use this technique to trick minifiers to preserve the function name.
createFakeJSXCallStack.react_stack_bottom_frame.bind(createFakeJSXCallStack) ;

/** @noinline */
function fakeJSXCallSite() {
  // This extra call frame represents the JSX creation function. We always pop this frame
  // off before presenting so it needs to be part of the stack.
  return new Error('react-stack-top-frame');
}
function initializeFakeStack(response, debugInfo) {
  var cachedEntry = debugInfo.debugStack;
  if (cachedEntry !== undefined) {
    return;
  }
  if (debugInfo.stack != null) {
    var stack = debugInfo.stack;
    var env = debugInfo.env == null ? '' : debugInfo.env;
    // $FlowFixMe[cannot-write]
    debugInfo.debugStack = createFakeJSXCallStackInDEV(response, stack, env);
  }
  var owner = debugInfo.owner;
  if (owner != null) {
    // Initialize any owners not yet initialized.
    initializeFakeStack(response, owner);
    if (owner.debugLocation === undefined && debugInfo.debugStack != null) {
      // If we are the child of this owner, then the owner should be the bottom frame
      // our stack. We can use it as the implied location of the owner.
      owner.debugLocation = debugInfo.debugStack;
    }
  }
}
function initializeDebugInfo(response, debugInfo) {
  if (debugInfo.stack !== undefined) {
    var componentInfoOrAsyncInfo =
    // $FlowFixMe[incompatible-type]
    debugInfo;
    // We eagerly initialize the fake task because this resolving happens outside any
    // render phase so we're not inside a user space stack at this point. If we waited
    // to initialize it when we need it, we might be inside user code.
    initializeFakeTask(response, componentInfoOrAsyncInfo);
  }
  if (debugInfo.owner == null && response._debugRootOwner != null) {
    var _componentInfoOrAsyncInfo =
    // $FlowFixMe: By narrowing `owner` to `null`, we narrowed `debugInfo` to `ReactComponentInfo`
    debugInfo;
    // $FlowFixMe[cannot-write]
    _componentInfoOrAsyncInfo.owner = response._debugRootOwner;
    // We clear the parsed stack frames to indicate that it needs to be re-parsed from debugStack.
    // $FlowFixMe[cannot-write]
    _componentInfoOrAsyncInfo.stack = null;
    // We override the stack if we override the owner since the stack where the root JSX
    // was created on the server isn't very useful but where the request was made is.
    // $FlowFixMe[cannot-write]
    _componentInfoOrAsyncInfo.debugStack = response._debugRootStack;
    // $FlowFixMe[cannot-write]
    _componentInfoOrAsyncInfo.debugTask = response._debugRootTask;
  } else if (debugInfo.stack !== undefined) {
    var _componentInfoOrAsyncInfo2 =
    // $FlowFixMe[incompatible-type]
    debugInfo;
    initializeFakeStack(response, _componentInfoOrAsyncInfo2);
  }
  {
    if (typeof debugInfo.time === 'number') {
      // Adjust the time to the current environment's time space.
      // Since this might be a deduped object, we clone it to avoid
      // applying the adjustment twice.
      debugInfo = {
        time: debugInfo.time + response._timeOrigin
      };
    }
  }
  return debugInfo;
}
function resolveDebugModel(response, id, json) {
  var parentChunk = getChunk(response, id);
  if (parentChunk.status === INITIALIZED || parentChunk.status === ERRORED || parentChunk.status === HALTED || parentChunk.status === BLOCKED) {
    // We shouldn't really get debug info late. It's too late to add it after we resolved.
    return;
  }
  if (parentChunk.status === RESOLVED_MODULE) {
    // We don't expect to get debug info on modules.
    return;
  }
  var previousChunk = parentChunk._debugChunk;
  var debugChunk = createResolvedModelChunk(response, json);
  debugChunk._debugChunk = previousChunk; // Linked list of the debug chunks
  parentChunk._debugChunk = debugChunk;
  initializeDebugChunk(response, parentChunk);
  if (debugChunk.status === BLOCKED && (response._debugChannel === undefined || !response._debugChannel.hasReadable)) {
    if (json[0] === '"' && json[1] === '$') {
      var path = json.slice(2, json.length - 1).split(':');
      var outlinedId = parseInt(path[0], 16);
      var chunk = getChunk(response, outlinedId);
      if (chunk.status === PENDING) {
        // We expect the debug chunk to have been emitted earlier in the stream. It might be
        // blocked on other things but chunk should no longer be pending.
        // If it's still pending that suggests that it was referencing an object in the debug
        // channel, but no debug channel was wired up so it's missing. In this case we can just
        // drop the debug info instead of halting the whole stream.
        parentChunk._debugChunk = null;
      }
    }
  }
}
var currentOwnerInDEV = null;
function getCurrentStackInDEV() {
  {
    var owner = currentOwnerInDEV;
    if (owner === null) {
      return '';
    }
    return getOwnerStackByComponentInfoInDev(owner);
  }
}
var replayConsoleWithCallStack = {
  react_stack_bottom_frame: function (response, payload) {
    var methodName = payload[0];
    var stackTrace = payload[1];
    var owner = payload[2];
    var env = payload[3];
    var args = payload.slice(4);

    // There really shouldn't be anything else on the stack atm.
    var prevStack = ReactSharedInternals.getCurrentStack;
    ReactSharedInternals.getCurrentStack = getCurrentStackInDEV;
    currentOwnerInDEV = owner === null ? response._debugRootOwner : owner;
    try {
      var callStack = buildFakeCallStack(response, stackTrace, env, false, bindToConsole(methodName, args, env));
      if (owner != null) {
        var task = initializeFakeTask(response, owner);
        initializeFakeStack(response, owner);
        if (task !== null) {
          task.run(callStack);
          return;
        }
      }
      var rootTask = getRootTask(response, env);
      if (rootTask != null) {
        rootTask.run(callStack);
        return;
      }
      callStack();
    } finally {
      currentOwnerInDEV = null;
      ReactSharedInternals.getCurrentStack = prevStack;
    }
  }
};
var replayConsoleWithCallStackInDEV = // We use this technique to trick minifiers to preserve the function name.
replayConsoleWithCallStack.react_stack_bottom_frame.bind(replayConsoleWithCallStack) ;
function resolveConsoleEntry(response, json) {
  if (!response._replayConsole) {
    return;
  }
  var blockedChunk = response._blockedConsole;
  if (blockedChunk == null) {
    // If we're not blocked on any other chunks, we can try to eagerly initialize
    // this as a fast-path to avoid awaiting them.
    var chunk = createResolvedModelChunk(response, json);
    initializeModelChunk(chunk);
    var initializedChunk = chunk;
    if (initializedChunk.status === INITIALIZED) {
      replayConsoleWithCallStackInDEV(response, initializedChunk.value);
    } else {
      chunk.then(function (v) {
        return replayConsoleWithCallStackInDEV(response, v);
      }, function (e) {
        // Ignore console errors for now. Unnecessary noise.
      });
      response._blockedConsole = chunk;
    }
  } else {
    // We're still waiting on a previous chunk so we can't enqueue quite yet.
    var _chunk4 = createPendingChunk(response);
    _chunk4.then(function (v) {
      return replayConsoleWithCallStackInDEV(response, v);
    }, function (e) {
      // Ignore console errors for now. Unnecessary noise.
    });
    response._blockedConsole = _chunk4;
    var unblock = function () {
      if (response._blockedConsole === _chunk4) {
        // We were still the last chunk so we can now clear the queue and return
        // to synchronous emitting.
        response._blockedConsole = null;
      }
      resolveModelChunk(response, _chunk4, json);
    };
    blockedChunk.then(unblock, unblock);
  }
}
function initializeIOInfo(response, ioInfo) {
  if (ioInfo.stack !== undefined) {
    initializeFakeTask(response, ioInfo);
    initializeFakeStack(response, ioInfo);
  }
  // Adjust the time to the current environment's time space.
  // $FlowFixMe[cannot-write]
  ioInfo.start += response._timeOrigin;
  // $FlowFixMe[cannot-write]
  ioInfo.end += response._timeOrigin;
  if (response._replayConsole) {
    var env = response._rootEnvironmentName;
    var promise = ioInfo.value;
    if (promise) {
      var thenable = promise;
      switch (thenable.status) {
        case INITIALIZED:
          logIOInfo(ioInfo, env, thenable.value);
          break;
        case ERRORED:
          logIOInfoErrored(ioInfo, env, thenable.reason);
          break;
        default:
          // If we haven't resolved the Promise yet, wait to log until have so we can include
          // its data in the log.
          promise.then(logIOInfo.bind(null, ioInfo, env), logIOInfoErrored.bind(null, ioInfo, env));
          break;
      }
    } else {
      logIOInfo(ioInfo, env, undefined);
    }
  }
}
function resolveIOInfo(response, id, model) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);
  var prevIsInitializingDebugInfo = isInitializingDebugInfo;
  isInitializingDebugInfo = true;
  try {
    if (!chunk) {
      chunk = createResolvedModelChunk(response, model);
      chunks.set(id, chunk);
      initializeModelChunk(chunk);
    } else {
      resolveModelChunk(response, chunk, model);
      if (chunk.status === RESOLVED_MODEL) {
        initializeModelChunk(chunk);
      }
    }
  } finally {
    isInitializingDebugInfo = prevIsInitializingDebugInfo;
  }
  if (chunk.status === INITIALIZED) {
    initializeIOInfo(response, chunk.value);
  } else {
    chunk.then(function (v) {
      initializeIOInfo(response, v);
    }, function (e) {
      // Ignore debug info errors for now. Unnecessary noise.
    });
  }
}
function mergeBuffer(buffer, lastChunk) {
  var l = buffer.length;
  // Count the bytes we'll need
  var byteLength = lastChunk.length;
  for (var i = 0; i < l; i++) {
    byteLength += buffer[i].byteLength;
  }
  // Allocate enough contiguous space
  var result = new Uint8Array(byteLength);
  var offset = 0;
  // Copy all the buffers into it.
  for (var _i3 = 0; _i3 < l; _i3++) {
    var chunk = buffer[_i3];
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  result.set(lastChunk, offset);
  return result;
}
function resolveTypedArray(response, id, buffer, lastChunk, constructor, bytesPerElement, streamState) {
  // If the view fits into one original buffer, we just reuse that buffer instead of
  // copying it out to a separate copy. This means that it's not always possible to
  // transfer these values to other threads without copying first since they may
  // share array buffer. For this to work, it must also have bytes aligned to a
  // multiple of a size of the type.
  var chunk = buffer.length === 0 && lastChunk.byteOffset % bytesPerElement === 0 ? lastChunk : mergeBuffer(buffer, lastChunk);
  // TODO: The transfer protocol of RSC is little-endian. If the client isn't little-endian
  // we should convert it instead. In practice big endian isn't really Web compatible so it's
  // somewhat safe to assume that browsers aren't going to run it, but maybe there's some SSR
  // server that's affected.
  var view = new constructor(chunk.buffer, chunk.byteOffset, chunk.byteLength / bytesPerElement);
  resolveBuffer(response, id, view, streamState);
}
function logComponentInfo(response, root, componentInfo, trackIdx, startTime, componentEndTime, childrenEndTime, isLastComponent) {
  // $FlowFixMe: Refined.
  if (isLastComponent && root.status === ERRORED && root.reason !== response._closedReason) {
    // If this is the last component to render before this chunk rejected, then conceptually
    // this component errored. If this was a cancellation then it wasn't this component that
    // errored.
    logComponentErrored(componentInfo, trackIdx, startTime, componentEndTime, childrenEndTime, response._rootEnvironmentName, root.reason);
  } else {
    logComponentRender(componentInfo, trackIdx, startTime, componentEndTime, childrenEndTime, response._rootEnvironmentName);
  }
}
function flushComponentPerformance(response, root, trackIdx,
// Next available track
trackTime,
// The time after which it is available,
parentEndTime) {
  // Write performance.measure() entries for Server Components in tree order.
  // This must be done at the end to collect the end time from the whole tree.
  if (!isArray(root._children)) {
    // We have already written this chunk. If this was a cycle, then this will
    // be -Infinity and it won't contribute to the parent end time.
    // If this was already emitted by another sibling then we reused the same
    // chunk in two places. We should extend the current end time as if it was
    // rendered as part of this tree.
    var previousResult = root._children;
    var previousEndTime = previousResult.endTime;
    if (parentEndTime > -Infinity && parentEndTime < previousEndTime && previousResult.component !== null) {
      // Log a placeholder for the deduped value under this child starting
      // from the end of the self time of the parent and spanning until the
      // the deduped end.
      logDedupedComponentRender(previousResult.component, trackIdx, parentEndTime, previousEndTime, response._rootEnvironmentName);
    }
    // Since we didn't bump the track this time, we just return the same track.
    previousResult.track = trackIdx;
    return previousResult;
  }
  var children = root._children;

  // First find the start time of the first component to know if it was running
  // in parallel with the previous.
  var debugInfo = null;
  {
    debugInfo = root._debugInfo;
    if (debugInfo.length === 0 && root.status === 'fulfilled') {
      var resolvedValue = resolveLazy(root.value);
      if (typeof resolvedValue === 'object' && resolvedValue !== null && (isArray(resolvedValue) || typeof resolvedValue[ASYNC_ITERATOR] === 'function' || resolvedValue.$$typeof === REACT_ELEMENT_TYPE || resolvedValue.$$typeof === REACT_LAZY_TYPE) && isArray(resolvedValue._debugInfo)) {
        // It's possible that the value has been given the debug info.
        // In that case we need to look for it on the resolved value.
        debugInfo = resolvedValue._debugInfo;
      }
    }
  }
  if (debugInfo) {
    var startTime = 0;
    for (var i = 0; i < debugInfo.length; i++) {
      var info = debugInfo[i];
      if (typeof info.time === 'number') {
        startTime = info.time;
      }
      if (typeof info.name === 'string') {
        if (startTime < trackTime) {
          // The start time of this component is before the end time of the previous
          // component on this track so we need to bump the next one to a parallel track.
          trackIdx++;
        }
        trackTime = startTime;
        break;
      }
    }
    for (var _i4 = debugInfo.length - 1; _i4 >= 0; _i4--) {
      var _info = debugInfo[_i4];
      if (typeof _info.time === 'number') {
        if (_info.time > parentEndTime) {
          parentEndTime = _info.time;
          break; // We assume the highest number is at the end.
        }
      }
    }
  }
  var result = {
    track: trackIdx,
    endTime: -Infinity,
    component: null
  };
  root._children = result;
  var childrenEndTime = -Infinity;
  var childTrackIdx = trackIdx;
  var childTrackTime = trackTime;
  for (var _i5 = 0; _i5 < children.length; _i5++) {
    var childResult = flushComponentPerformance(response, children[_i5], childTrackIdx, childTrackTime, parentEndTime);
    if (childResult.component !== null) {
      result.component = childResult.component;
    }
    childTrackIdx = childResult.track;
    var childEndTime = childResult.endTime;
    if (childEndTime > childTrackTime) {
      childTrackTime = childEndTime;
    }
    if (childEndTime > childrenEndTime) {
      childrenEndTime = childEndTime;
    }
  }
  if (debugInfo) {
    // Write debug info in reverse order (just like stack traces).
    var componentEndTime = 0;
    var isLastComponent = true;
    var endTime = -1;
    var endTimeIdx = -1;
    for (var _i6 = debugInfo.length - 1; _i6 >= 0; _i6--) {
      var _info2 = debugInfo[_i6];
      if (typeof _info2.time !== 'number') {
        continue;
      }
      if (componentEndTime === 0) {
        // Last timestamp is the end of the last component.
        componentEndTime = _info2.time;
      }
      var time = _info2.time;
      if (endTimeIdx > -1) {
        // Now that we know the start and end time, we can emit the entries between.
        for (var j = endTimeIdx - 1; j > _i6; j--) {
          var candidateInfo = debugInfo[j];
          if (typeof candidateInfo.name === 'string') {
            if (componentEndTime > childrenEndTime) {
              childrenEndTime = componentEndTime;
            }
            // $FlowFixMe: Refined.
            var componentInfo = candidateInfo;
            logComponentInfo(response, root, componentInfo, trackIdx, time, componentEndTime, childrenEndTime, isLastComponent);
            componentEndTime = time; // The end time of previous component is the start time of the next.
            // Track the root most component of the result for deduping logging.
            result.component = componentInfo;
            isLastComponent = false;
          } else if (candidateInfo.awaited &&
          // Skip awaits on client resources since they didn't block the server component.
          candidateInfo.awaited.env != null) {
            if (endTime > childrenEndTime) {
              childrenEndTime = endTime;
            }
            // $FlowFixMe: Refined.
            var asyncInfo = candidateInfo;
            var env = response._rootEnvironmentName;
            var promise = asyncInfo.awaited.value;
            if (promise) {
              var thenable = promise;
              switch (thenable.status) {
                case INITIALIZED:
                  logComponentAwait(asyncInfo, trackIdx, time, endTime, env, thenable.value);
                  break;
                case ERRORED:
                  logComponentAwaitErrored(asyncInfo, trackIdx, time, endTime, env, thenable.reason);
                  break;
                default:
                  // We assume that we should have received the data by now since this is logged at the
                  // end of the response stream. This is more sensitive to ordering so we don't wait
                  // to log it.
                  logComponentAwait(asyncInfo, trackIdx, time, endTime, env, undefined);
                  break;
              }
            } else {
              logComponentAwait(asyncInfo, trackIdx, time, endTime, env, undefined);
            }
          }
        }
      } else {
        // Anything between the end and now was aborted if it has no end time.
        // Either because the client stream was aborted reading it or the server stream aborted.
        endTime = time; // If we don't find anything else the endTime is the start time.
        for (var _j = debugInfo.length - 1; _j > _i6; _j--) {
          var _candidateInfo = debugInfo[_j];
          if (typeof _candidateInfo.name === 'string') {
            if (componentEndTime > childrenEndTime) {
              childrenEndTime = componentEndTime;
            }
            // $FlowFixMe: Refined.
            var _componentInfo = _candidateInfo;
            var _env = response._rootEnvironmentName;
            logComponentAborted(_componentInfo, trackIdx, time, componentEndTime, childrenEndTime, _env);
            componentEndTime = time; // The end time of previous component is the start time of the next.
            // Track the root most component of the result for deduping logging.
            result.component = _componentInfo;
            isLastComponent = false;
          } else if (_candidateInfo.awaited &&
          // Skip awaits on client resources since they didn't block the server component.
          _candidateInfo.awaited.env != null) {
            // If we don't have an end time for an await, that means we aborted.
            var _asyncInfo = _candidateInfo;
            var _env2 = response._rootEnvironmentName;
            if (_asyncInfo.awaited.end > endTime) {
              endTime = _asyncInfo.awaited.end; // Take the end time of the I/O as the await end.
            }
            if (endTime > childrenEndTime) {
              childrenEndTime = endTime;
            }
            logComponentAwaitAborted(_asyncInfo, trackIdx, time, endTime, _env2);
          }
        }
      }
      endTime = time; // The end time of the next entry is this time.
      endTimeIdx = _i6;
    }
  }
  result.endTime = childrenEndTime;
  return result;
}
function flushInitialRenderPerformance(response) {
  if (response._replayConsole) {
    var rootChunk = getChunk(response, 0);
    if (isArray(rootChunk._children)) {
      markAllTracksInOrder();
      flushComponentPerformance(response, rootChunk, 0, -Infinity, -Infinity);
    }
  }
}
function processFullBinaryRow(response, streamState, id, tag, buffer, chunk) {
  switch (tag) {
    case 65 /* "A" */:
      // We must always clone to extract it into a separate buffer instead of just a view.
      resolveBuffer(response, id, mergeBuffer(buffer, chunk).buffer, streamState);
      return;
    case 79 /* "O" */:
      resolveTypedArray(response, id, buffer, chunk, Int8Array, 1, streamState);
      return;
    case 111 /* "o" */:
      resolveBuffer(response, id, buffer.length === 0 ? chunk : mergeBuffer(buffer, chunk), streamState);
      return;
    case 85 /* "U" */:
      resolveTypedArray(response, id, buffer, chunk, Uint8ClampedArray, 1, streamState);
      return;
    case 83 /* "S" */:
      resolveTypedArray(response, id, buffer, chunk, Int16Array, 2, streamState);
      return;
    case 115 /* "s" */:
      resolveTypedArray(response, id, buffer, chunk, Uint16Array, 2, streamState);
      return;
    case 76 /* "L" */:
      resolveTypedArray(response, id, buffer, chunk, Int32Array, 4, streamState);
      return;
    case 108 /* "l" */:
      resolveTypedArray(response, id, buffer, chunk, Uint32Array, 4, streamState);
      return;
    case 71 /* "G" */:
      resolveTypedArray(response, id, buffer, chunk, Float32Array, 4, streamState);
      return;
    case 103 /* "g" */:
      resolveTypedArray(response, id, buffer, chunk, Float64Array, 8, streamState);
      return;
    case 77 /* "M" */:
      resolveTypedArray(response, id, buffer, chunk, BigInt64Array, 8, streamState);
      return;
    case 109 /* "m" */:
      resolveTypedArray(response, id, buffer, chunk, BigUint64Array, 8, streamState);
      return;
    case 86 /* "V" */:
      resolveTypedArray(response, id, buffer, chunk, DataView, 1, streamState);
      return;
  }
  var stringDecoder = response._stringDecoder;
  var row = '';
  for (var i = 0; i < buffer.length; i++) {
    row += readPartialStringChunk(stringDecoder, buffer[i]);
  }
  row += readFinalStringChunk(stringDecoder, chunk);
  processFullStringRow(response, streamState, id, tag, row);
}
function processFullStringRow(response, streamState, id, tag, row) {
  switch (tag) {
    case 73 /* "I" */:
      {
        resolveModule(response, id, row, streamState);
        return;
      }
    case 72 /* "H" */:
      {
        var code = row[0];
        resolveHint(response, code, row.slice(1));
        return;
      }
    case 69 /* "E" */:
      {
        resolveErrorModel(response, id, row, streamState);
        return;
      }
    case 84 /* "T" */:
      {
        resolveText(response, id, row, streamState);
        return;
      }
    case 78 /* "N" */:
      {
        {
          // Track the time origin for future debug info. We track it relative
          // to the current environment's time space.
          var timeOrigin = +row;
          response._timeOrigin = timeOrigin -
          // $FlowFixMe[prop-missing]
          performance.timeOrigin;
          return;
        }
        // Fallthrough to share the error with Debug and Console entries.
      }
    case 68 /* "D" */:
      {
        {
          resolveDebugModel(response, id, row);
          return;
        }
        // Fallthrough to share the error with Console entries.
      }
    case 74 /* "J" */:
      {
        {
          resolveIOInfo(response, id, row);
          return;
        }
        // Fallthrough to share the error with Console entries.
      }
    case 87 /* "W" */:
      {
        {
          resolveConsoleEntry(response, row);
          return;
        }
      }
    case 82 /* "R" */:
      {
        startReadableStream(response, id, undefined, streamState);
        return;
      }
    // Fallthrough
    case 114 /* "r" */:
      {
        startReadableStream(response, id, 'bytes', streamState);
        return;
      }
    // Fallthrough
    case 88 /* "X" */:
      {
        startAsyncIterable(response, id, false, streamState);
        return;
      }
    // Fallthrough
    case 120 /* "x" */:
      {
        startAsyncIterable(response, id, true, streamState);
        return;
      }
    // Fallthrough
    case 67 /* "C" */:
      {
        stopStream(response, id, row);
        return;
      }
    // Fallthrough
    default:
      /* """ "{" "[" "t" "f" "n" "0" - "9" */{
        if (row === '') {
          resolveDebugHalt(response, id);
          return;
        }
        // We assume anything else is JSON.
        resolveModel(response, id, row, streamState);
        return;
      }
  }
}
function processBinaryChunk(weakResponse, streamState, chunk) {
  if (hasGCedResponse(weakResponse)) {
    // Ignore more chunks if we've already GC:ed all listeners.
    return;
  }
  var response = unwrapWeakResponse(weakResponse);
  var i = 0;
  var rowState = streamState._rowState;
  var rowID = streamState._rowID;
  var rowTag = streamState._rowTag;
  var rowLength = streamState._rowLength;
  var buffer = streamState._buffer;
  var chunkLength = chunk.length;
  incrementChunkDebugInfo(streamState, chunkLength);
  while (i < chunkLength) {
    var lastIdx = -1;
    switch (rowState) {
      case ROW_ID:
        {
          var byte = chunk[i++];
          if (byte === 58 /* ":" */) {
            // Finished the rowID, next we'll parse the tag.
            rowState = ROW_TAG;
          } else {
            rowID = rowID << 4 | (byte > 96 ? byte - 87 : byte - 48);
          }
          continue;
        }
      case ROW_TAG:
        {
          var resolvedRowTag = chunk[i];
          if (resolvedRowTag === 84 /* "T" */ || resolvedRowTag === 65 /* "A" */ || resolvedRowTag === 79 /* "O" */ || resolvedRowTag === 111 /* "o" */ || resolvedRowTag === 98 /* "b" */ || resolvedRowTag === 85 /* "U" */ || resolvedRowTag === 83 /* "S" */ || resolvedRowTag === 115 /* "s" */ || resolvedRowTag === 76 /* "L" */ || resolvedRowTag === 108 /* "l" */ || resolvedRowTag === 71 /* "G" */ || resolvedRowTag === 103 /* "g" */ || resolvedRowTag === 77 /* "M" */ || resolvedRowTag === 109 /* "m" */ || resolvedRowTag === 86 /* "V" */) {
            rowTag = resolvedRowTag;
            rowState = ROW_LENGTH;
            i++;
          } else if (resolvedRowTag > 64 && resolvedRowTag < 91 /* "A"-"Z" */ || resolvedRowTag === 35 /* "#" */ || resolvedRowTag === 114 /* "r" */ || resolvedRowTag === 120 /* "x" */) {
            rowTag = resolvedRowTag;
            rowState = ROW_CHUNK_BY_NEWLINE;
            i++;
          } else {
            rowTag = 0;
            rowState = ROW_CHUNK_BY_NEWLINE;
            // This was an unknown tag so it was probably part of the data.
          }
          continue;
        }
      case ROW_LENGTH:
        {
          var _byte = chunk[i++];
          if (_byte === 44 /* "," */) {
            // Finished the rowLength, next we'll buffer up to that length.
            rowState = ROW_CHUNK_BY_LENGTH;
          } else {
            rowLength = rowLength << 4 | (_byte > 96 ? _byte - 87 : _byte - 48);
          }
          continue;
        }
      case ROW_CHUNK_BY_NEWLINE:
        {
          // We're looking for a newline
          lastIdx = chunk.indexOf(10 /* "\n" */, i);
          break;
        }
      case ROW_CHUNK_BY_LENGTH:
        {
          // We're looking for the remaining byte length
          lastIdx = i + rowLength;
          if (lastIdx > chunk.length) {
            lastIdx = -1;
          }
          break;
        }
    }
    var offset = chunk.byteOffset + i;
    if (lastIdx > -1) {
      // We found the last chunk of the row
      var length = lastIdx - i;
      var lastChunk = new Uint8Array(chunk.buffer, offset, length);

      // Check if this is a Uint8Array for a byte stream. We enqueue it
      // immediately but need to determine if we can use zero-copy or must copy.
      if (rowTag === 98 /* "b" */) {
        resolveBuffer(response, rowID,
        // If we're at the end of the RSC chunk, no more parsing will access
        // this buffer and we don't need to copy the chunk to allow detaching
        // the buffer, otherwise we need to copy.
        lastIdx === chunkLength ? lastChunk : lastChunk.slice(), streamState);
      } else {
        // Process all other row types.
        processFullBinaryRow(response, streamState, rowID, rowTag, buffer, lastChunk);
      }

      // Reset state machine for a new row
      i = lastIdx;
      if (rowState === ROW_CHUNK_BY_NEWLINE) {
        // If we're trailing by a newline we need to skip it.
        i++;
      }
      rowState = ROW_ID;
      rowTag = 0;
      rowID = 0;
      rowLength = 0;
      buffer.length = 0;
    } else {
      // The rest of this row is in a future chunk.
      var _length = chunk.byteLength - i;
      var remainingSlice = new Uint8Array(chunk.buffer, offset, _length);

      // For byte streams, we can enqueue the partial row immediately without
      // copying since we're at the end of the RSC chunk and no more parsing
      // will access this buffer.
      if (rowTag === 98 /* "b" */) {
        // Update how many bytes we're still waiting for. We need to do this
        // before enqueueing, as enqueue will detach the buffer and byteLength
        // will become 0.
        rowLength -= remainingSlice.byteLength;
        resolveBuffer(response, rowID, remainingSlice, streamState);
      } else {
        // For other row types, stash the rest of the current chunk until we can
        // process the full row.
        buffer.push(remainingSlice);
        // Update how many bytes we're still waiting for. If we're looking for
        // a newline, this doesn't hurt since we'll just ignore it.
        rowLength -= remainingSlice.byteLength;
      }
      break;
    }
  }
  streamState._rowState = rowState;
  streamState._rowID = rowID;
  streamState._rowTag = rowTag;
  streamState._rowLength = rowLength;
}
function processStringChunk(weakResponse, streamState, chunk) {
  if (hasGCedResponse(weakResponse)) {
    // Ignore more chunks if we've already GC:ed all listeners.
    return;
  }
  var response = unwrapWeakResponse(weakResponse);
  // This is a fork of processBinaryChunk that takes a string as input.
  // This can't be just any binary chunk coverted to a string. It needs to be
  // in the same offsets given from the Flight Server. E.g. if it's shifted by
  // one byte then it won't line up to the UCS-2 encoding. It also needs to
  // be valid Unicode. Also binary chunks cannot use this even if they're
  // value Unicode. Large strings are encoded as binary and cannot be passed
  // here. Basically, only if Flight Server gave you this string as a chunk,
  // you can use it here.
  var i = 0;
  var rowState = streamState._rowState;
  var rowID = streamState._rowID;
  var rowTag = streamState._rowTag;
  var rowLength = streamState._rowLength;
  var buffer = streamState._buffer;
  var chunkLength = chunk.length;
  incrementChunkDebugInfo(streamState, chunkLength);
  while (i < chunkLength) {
    var lastIdx = -1;
    switch (rowState) {
      case ROW_ID:
        {
          var byte = chunk.charCodeAt(i++);
          if (byte === 58 /* ":" */) {
            // Finished the rowID, next we'll parse the tag.
            rowState = ROW_TAG;
          } else {
            rowID = rowID << 4 | (byte > 96 ? byte - 87 : byte - 48);
          }
          continue;
        }
      case ROW_TAG:
        {
          var resolvedRowTag = chunk.charCodeAt(i);
          if (resolvedRowTag === 84 /* "T" */ || resolvedRowTag === 65 /* "A" */ || resolvedRowTag === 79 /* "O" */ || resolvedRowTag === 111 /* "o" */ || resolvedRowTag === 85 /* "U" */ || resolvedRowTag === 83 /* "S" */ || resolvedRowTag === 115 /* "s" */ || resolvedRowTag === 76 /* "L" */ || resolvedRowTag === 108 /* "l" */ || resolvedRowTag === 71 /* "G" */ || resolvedRowTag === 103 /* "g" */ || resolvedRowTag === 77 /* "M" */ || resolvedRowTag === 109 /* "m" */ || resolvedRowTag === 86 /* "V" */) {
            rowTag = resolvedRowTag;
            rowState = ROW_LENGTH;
            i++;
          } else if (resolvedRowTag > 64 && resolvedRowTag < 91 /* "A"-"Z" */ || resolvedRowTag === 114 /* "r" */ || resolvedRowTag === 120 /* "x" */) {
            rowTag = resolvedRowTag;
            rowState = ROW_CHUNK_BY_NEWLINE;
            i++;
          } else {
            rowTag = 0;
            rowState = ROW_CHUNK_BY_NEWLINE;
            // This was an unknown tag so it was probably part of the data.
          }
          continue;
        }
      case ROW_LENGTH:
        {
          var _byte2 = chunk.charCodeAt(i++);
          if (_byte2 === 44 /* "," */) {
            // Finished the rowLength, next we'll buffer up to that length.
            rowState = ROW_CHUNK_BY_LENGTH;
          } else {
            rowLength = rowLength << 4 | (_byte2 > 96 ? _byte2 - 87 : _byte2 - 48);
          }
          continue;
        }
      case ROW_CHUNK_BY_NEWLINE:
        {
          // We're looking for a newline
          lastIdx = chunk.indexOf('\n', i);
          break;
        }
      case ROW_CHUNK_BY_LENGTH:
        {
          if (rowTag !== 84) {
            throw new Error('Binary RSC chunks cannot be encoded as strings. ' + 'This is a bug in the wiring of the React streams.');
          }
          // For a large string by length, we don't know how many unicode characters
          // we are looking for but we can assume that the raw string will be its own
          // chunk. We add extra validation that the length is at least within the
          // possible byte range it could possibly be to catch mistakes.
          if (rowLength < chunk.length || chunk.length > rowLength * 3) {
            throw new Error('String chunks need to be passed in their original shape. ' + 'Not split into smaller string chunks. ' + 'This is a bug in the wiring of the React streams.');
          }
          lastIdx = chunk.length;
          break;
        }
    }
    if (lastIdx > -1) {
      // We found the last chunk of the row
      if (buffer.length > 0) {
        // If we had a buffer already, it means that this chunk was split up into
        // binary chunks preceeding it.
        throw new Error('String chunks need to be passed in their original shape. ' + 'Not split into smaller string chunks. ' + 'This is a bug in the wiring of the React streams.');
      }
      var lastChunk = chunk.slice(i, lastIdx);
      processFullStringRow(response, streamState, rowID, rowTag, lastChunk);
      // Reset state machine for a new row
      i = lastIdx;
      if (rowState === ROW_CHUNK_BY_NEWLINE) {
        // If we're trailing by a newline we need to skip it.
        i++;
      }
      rowState = ROW_ID;
      rowTag = 0;
      rowID = 0;
      rowLength = 0;
      buffer.length = 0;
    } else if (chunk.length !== i) {
      // The rest of this row is in a future chunk. We only support passing the
      // string from chunks in their entirety. Not split up into smaller string chunks.
      // We could support this by buffering them but we shouldn't need to for
      // this use case.
      throw new Error('String chunks need to be passed in their original shape. ' + 'Not split into smaller string chunks. ' + 'This is a bug in the wiring of the React streams.');
    }
  }
  streamState._rowState = rowState;
  streamState._rowID = rowID;
  streamState._rowTag = rowTag;
  streamState._rowLength = rowLength;
}
function parseModel(response, json) {
  var rawModel = JSON.parse(json);
  // Pass a wrapper object as parentObject to match the original JSON.parse
  // reviver behavior, where the root value's reviver receives {"": rootValue}
  // as `this`. This ensures parentObject is never null when accessed downstream.
  return reviveModel(response, rawModel, {
    '': rawModel
  }, '');
}
function reviveModel(response, value, parentObject, key) {
  if (typeof value === 'string') {
    if (value[0] === '$') {
      return parseModelString(response, parentObject, key, value);
    }
    return value;
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  if (isArray(value)) {
    for (var i = 0; i < value.length; i++) {
      value[i] = reviveModel(response, value[i], value, '' + i);
    }
    if (value[0] === REACT_ELEMENT_TYPE) {
      // React element tuple
      return parseModelTuple(response, value);
    }
    return value;
  }
  // Plain object
  for (var k in value) {
    if (k === __PROTO__) {
      delete value[k];
    } else {
      var walked = reviveModel(response, value[k], value, k);
      if (walked !== undefined) {
        value[k] = walked;
      } else {
        delete value[k];
      }
    }
  }
  return value;
}
function close(weakResponse) {
  // In case there are any remaining unresolved chunks, they won't be resolved
  // now. So we either error or halt them depending on whether partial streams
  // are allowed.
  // TODO: Ideally we should be able to bail out early if we kept a ref count of
  // pending chunks.
  if (hasGCedResponse(weakResponse)) {
    return;
  }
  var response = unwrapWeakResponse(weakResponse);
  if (response._allowPartialStream) {
    // For partial streams, we halt pending chunks instead of erroring them.
    response._closed = true;
    response._chunks.forEach(function (chunk) {
      if (chunk.status === PENDING) {
        // Clear listeners to release closures and transition to HALTED.
        // Future .then() calls on HALTED chunks are no-ops.
        releasePendingChunk(response, chunk);
        var haltedChunk = chunk;
        haltedChunk.status = HALTED;
        haltedChunk.value = null;
        haltedChunk.reason = null;
      } else if (chunk.status === INITIALIZED && chunk.reason !== null) {
        // Stream chunk - close gracefully instead of erroring.
        chunk.reason.close('"$undefined"');
      }
    });
    {
      var debugChannel = response._debugChannel;
      if (debugChannel !== undefined) {
        closeDebugChannel(debugChannel);
        response._debugChannel = undefined;
        if (debugChannelRegistry !== null) {
          debugChannelRegistry.unregister(response);
        }
      }
    }
  } else {
    reportGlobalError(weakResponse, new Error('Connection closed.'));
  }
}
function getCurrentOwnerInDEV() {
  return currentOwnerInDEV;
}
function injectIntoDevTools() {
  var internals = {
    bundleType: 1 ,
    // Might add PROFILE later.
    version: ReactVersion,
    rendererPackageName: rendererPackageName,
    currentDispatcherRef: ReactSharedInternals,
    // Enables DevTools to detect reconciler version rather than renderer version
    // which may not match for third party renderers.
    reconcilerVersion: ReactVersion,
    getCurrentComponentInfo: getCurrentOwnerInDEV
  };
  return injectInternals(internals);
}

function createDebugCallbackFromWritableStream(debugWritable) {
  var textEncoder = new TextEncoder();
  var writer = debugWritable.getWriter();
  return function (message) {
    if (message === '') {
      writer.close();
    } else {
      // Note: It's important that this function doesn't close over the Response object or it can't be GC:ed.
      // Therefore, we can't report errors from this write back to the Response object.
      {
        writer.write(textEncoder.encode(message + '\n')).catch(console.error);
      }
    }
  };
}
function createResponseFromOptions(options) {
  var debugChannel = options && options.debugChannel !== undefined ? {
    hasReadable: options.debugChannel.readable !== undefined,
    callback: options.debugChannel.writable !== undefined ? createDebugCallbackFromWritableStream(options.debugChannel.writable) : null
  } : undefined;
  return createResponse(options && options.moduleBaseURL ? options.moduleBaseURL : '', null, null, options && options.callServer ? options.callServer : undefined, undefined,
  // encodeFormAction
  undefined,
  // nonce
  options && options.temporaryReferences ? options.temporaryReferences : undefined, options && options.unstable_allowPartialStream ? options.unstable_allowPartialStream : false, options && options.findSourceMapURL ? options.findSourceMapURL : undefined, options ? options.replayConsoleLogs !== false : true ,
  // defaults to true
  options && options.environmentName ? options.environmentName : undefined, options && options.startTime != null ? options.startTime : undefined, options && options.endTime != null ? options.endTime : undefined, debugChannel);
}
function startReadingFromUniversalStream(response, stream, onDone) {
  // This is the same as startReadingFromStream except this allows WebSocketStreams which
  // return ArrayBuffer and string chunks instead of Uint8Array chunks. We could potentially
  // always allow streams with variable chunk types.
  var streamState = createStreamState(response, stream);
  var reader = stream.getReader();
  function progress(_ref) {
    var done = _ref.done,
      value = _ref.value;
    if (done) {
      return onDone();
    }
    if (value instanceof ArrayBuffer) {
      // WebSockets can produce ArrayBuffer values in ReadableStreams.
      processBinaryChunk(response, streamState, new Uint8Array(value));
    } else if (typeof value === 'string') {
      // WebSockets can produce string values in ReadableStreams.
      processStringChunk(response, streamState, value);
    } else {
      processBinaryChunk(response, streamState, value);
    }
    return reader.read().then(progress).catch(error);
  }
  function error(e) {
    reportGlobalError(response, e);
  }
  reader.read().then(progress).catch(error);
}
function startReadingFromStream(response, stream, onDone, debugValue) {
  var streamState = createStreamState(response, debugValue);
  var reader = stream.getReader();
  function progress(_ref2) {
    var done = _ref2.done,
      value = _ref2.value;
    if (done) {
      return onDone();
    }
    var buffer = value;
    processBinaryChunk(response, streamState, buffer);
    return reader.read().then(progress).catch(error);
  }
  function error(e) {
    reportGlobalError(response, e);
  }
  reader.read().then(progress).catch(error);
}
function createFromReadableStream(stream, options) {
  var response = createResponseFromOptions(options);
  if (options && options.debugChannel && options.debugChannel.readable) {
    var streamDoneCount = 0;
    var handleDone = function () {
      if (++streamDoneCount === 2) {
        close(response);
      }
    };
    startReadingFromUniversalStream(response, options.debugChannel.readable, handleDone);
    startReadingFromStream(response, stream, handleDone, stream);
  } else {
    startReadingFromStream(response, stream, close.bind(null, response), stream);
  }
  return getRoot(response);
}
function createFromFetch(promiseForResponse, options) {
  var response = createResponseFromOptions(options);
  promiseForResponse.then(function (r) {
    if (options && options.debugChannel && options.debugChannel.readable) {
      var streamDoneCount = 0;
      var handleDone = function () {
        if (++streamDoneCount === 2) {
          close(response);
        }
      };
      startReadingFromUniversalStream(response, options.debugChannel.readable, handleDone);
      startReadingFromStream(response, r.body, handleDone, r);
    } else {
      startReadingFromStream(response, r.body, close.bind(null, response), r);
    }
  }, function (e) {
    reportGlobalError(response, e);
  });
  return getRoot(response);
}
function encodeReply(value, options) /* We don't use URLSearchParams yet but maybe */{
  return new Promise(function (resolve, reject) {
    var abort = processReply(value, '', options && options.temporaryReferences ? options.temporaryReferences : undefined, resolve, reject);
    if (options && options.signal) {
      var signal = options.signal;
      if (signal.aborted) {
        abort(signal.reason);
      } else {
        var listener = function () {
          abort(signal.reason);
          signal.removeEventListener('abort', listener);
        };
        signal.addEventListener('abort', listener);
      }
    }
  });
}
{
  injectIntoDevTools();
}

export { createFromFetch, createFromReadableStream, createServerReference, createTemporaryReferenceSet, encodeReply, registerServerReference };
