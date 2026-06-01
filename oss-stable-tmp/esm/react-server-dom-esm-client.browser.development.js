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

function _defineProperty(e, r, t) {
  return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: !0,
    configurable: !0,
    writable: !0
  }) : e[r] = t, e;
}
function _toPrimitive(t, r) {
  if ("object" != typeof t || !t) return t;
  var e = t[Symbol.toPrimitive];
  if (void 0 !== e) {
    var i = e.call(t, r || "default");
    if ("object" != typeof i) return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return ("string" === r ? String : Number)(t);
}
function _toPropertyKey(t) {
  var i = _toPrimitive(t, "string");
  return "symbol" == typeof i ? i : i + "";
}

var ReactVersion = '19.2.0-experimental-0ca8420f-20250504';

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

var badgeFormat = '%c%s%c ';
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
    newArgs.splice(offset, 1, badgeFormat + newArgs[offset], badgeStyle, pad + badgeName + pad, resetStyle);
  } else {
    newArgs.splice(offset, 0, badgeFormat, badgeStyle, pad + badgeName + pad, resetStyle);
  }

  // The "this" binding in the "bind";
  newArgs.unshift(console);

  // $FlowFixMe
  return bind.apply(console[methodName], newArgs); // eslint-disable-line react-internal/no-production-logging
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
    var modulePromise = import(/* @vite-ignore */ metadata.specifier);
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
        dispatcher.D(/* prefetchDNS */href);
        return;
      }
    case 'C':
      {
        var _refined = refineModel(code, model);
        if (typeof _refined === 'string') {
          var _href = _refined;
          dispatcher.C(/* preconnect */_href);
        } else {
          var _href2 = _refined[0];
          var crossOrigin = _refined[1];
          dispatcher.C(/* preconnect */_href2, crossOrigin);
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
          dispatcher.L(/* preload */_href3, as, options);
        } else {
          dispatcher.L(/* preload */_href3, as);
        }
        return;
      }
    case 'm':
      {
        var _refined3 = refineModel(code, model);
        if (typeof _refined3 === 'string') {
          var _href4 = _refined3;
          dispatcher.m(/* preloadModule */_href4);
        } else {
          var _href5 = _refined3[0];
          var _options = _refined3[1];
          dispatcher.m(/* preloadModule */_href5, _options);
        }
        return;
      }
    case 'X':
      {
        var _refined4 = refineModel(code, model);
        if (typeof _refined4 === 'string') {
          var _href6 = _refined4;
          dispatcher.X(/* preinitScript */_href6);
        } else {
          var _href7 = _refined4[0];
          var _options2 = _refined4[1];
          dispatcher.X(/* preinitScript */_href7, _options2);
        }
        return;
      }
    case 'S':
      {
        var _refined5 = refineModel(code, model);
        if (typeof _refined5 === 'string') {
          var _href8 = _refined5;
          dispatcher.S(/* preinitStyle */_href8);
        } else {
          var _href9 = _refined5[0];
          var precedence = _refined5[1] === 0 ? undefined : _refined5[1];
          var _options3 = _refined5.length === 3 ? _refined5[2] : undefined;
          dispatcher.S(/* preinitStyle */_href9, precedence, _options3);
        }
        return;
      }
    case 'M':
      {
        var _refined6 = refineModel(code, model);
        if (typeof _refined6 === 'string') {
          var _href0 = _refined6;
          dispatcher.M(/* preinitModuleScript */_href0);
        } else {
          var _href1 = _refined6[0];
          var _options4 = _refined6[1];
          dispatcher.M(/* preinitModuleScript */_href1, _options4);
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

var REACT_ELEMENT_TYPE = Symbol.for('react.transitional.element') ;
var REACT_PORTAL_TYPE = Symbol.for('react.portal');
var REACT_FRAGMENT_TYPE = Symbol.for('react.fragment');
var REACT_STRICT_MODE_TYPE = Symbol.for('react.strict_mode');
var REACT_PROFILER_TYPE = Symbol.for('react.profiler');
var REACT_PROVIDER_TYPE = Symbol.for('react.provider'); // TODO: Delete with enableRenderableContext
var REACT_CONSUMER_TYPE = Symbol.for('react.consumer');
var REACT_CONTEXT_TYPE = Symbol.for('react.context');
var REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
var REACT_SUSPENSE_TYPE = Symbol.for('react.suspense');
var REACT_SUSPENSE_LIST_TYPE = Symbol.for('react.suspense_list');
var REACT_MEMO_TYPE = Symbol.for('react.memo');
var REACT_LAZY_TYPE = Symbol.for('react.lazy');
var REACT_ACTIVITY_TYPE = Symbol.for('react.activity');
var REACT_POSTPONE_TYPE = Symbol.for('react.postpone');
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
  return name.replace(/^\[object (.*)\]$/, function (m, p0) {
    return p0;
  });
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

function serializeByValueID(id) {
  return '$' + id.toString(16);
}
function serializePromiseID(id) {
  return '$@' + id.toString(16);
}
function serializeServerReferenceID(id) {
  return '$F' + id.toString(16);
}
function serializeTemporaryReferenceMarker() {
  return '$T';
}
function serializeFormDataReference(id) {
  // Why K? F is "Function". D is "Date". What else?
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

      // $FlowFixMe[method-unbinding]
      if (typeof value.then === 'function') {
        // We assume that any object with a .then property is a "Thenable" type,
        // or a Promise type. Either of which can be represented by a Promise.
        if (formData === null) {
          // Upgrade to use FormData to allow us to stream this value.
          formData = new FormData();
        }
        pendingParts++;
        var promiseId = nextPartId++;
        var _thenable = value;
        _thenable.then(function (partValue) {
          try {
            var _partJSON3 = serializeModel(partValue, promiseId);
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
        return serializePromiseID(promiseId);
      }
      var existingReference = writtenObjects.get(value);
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
        if (value.$$typeof === (REACT_CONTEXT_TYPE )) {
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
        return serializeServerReferenceID(_refId);
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
    // We use the prefix rsc://React/ to separate these from other files listed in
    // the Chrome DevTools. We need a "host name" and not just a protocol because
    // otherwise the group name becomes the root folder. Ideally we don't want to
    // show these at all but there's two reasons to assign a fake URL.
    // 1) A printed stack trace string needs a unique URL to be able to source map it.
    // 2) If source maps are disabled or fails, you should at least be able to tell
    //    which file it was.
    code += '\n//# sourceURL=rsc://React/' + encodeURIComponent(environmentName) + '/' + filename + '?s' +
    // We add an extra s here to distinguish from the fake stack frames
    fakeServerFunctionIdx++;
    code += '\n//# sourceMappingURL=' + sourceMap;
  } else if (filename) {
    code += '\n//# sourceURL=' + filename;
  }
  try {
    // Eval a factory and then call it to create a closure over the inner function.
     
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
        col = location[3];
      // While the environment that the Server Reference points to can be
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

/* eslint-disable react-internal/no-production-logging */

var supportsUserTiming = typeof console !== 'undefined' && typeof console.timeStamp === 'function';
var COMPONENTS_TRACK = 'Server Components ⚛';
function markAllTracksInOrder() {
  if (supportsUserTiming) {
    // Ensure we create the Server Component track groups earlier than the Client Scheduler
    // and Client Components. We can always add the 0 time slot even if it's in the past.
    // That's still considered for ordering.
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
    if (debugTask) {
      debugTask.run(
      // $FlowFixMe[method-unbinding]
      console.timeStamp.bind(console, entryName, startTime < 0 ? 0 : startTime, childrenEndTime, trackNames[trackIdx], COMPONENTS_TRACK, color));
    } else {
      console.timeStamp(entryName, startTime < 0 ? 0 : startTime, childrenEndTime, trackNames[trackIdx], COMPONENTS_TRACK, color);
    }
  }
}
function logComponentErrored(componentInfo, trackIdx, startTime, endTime, childrenEndTime, rootEnv, error) {
  if (supportsUserTiming) {
    var env = componentInfo.env;
    var name = componentInfo.name;
    var isPrimaryEnv = env === rootEnv;
    var entryName = isPrimaryEnv || env === undefined ? name : name + ' [' + env + ']';
    if (typeof performance !== 'undefined' &&
    // $FlowFixMe[method-unbinding]
    typeof performance.measure === 'function') {
      var message = typeof error === 'object' && error !== null && typeof error.message === 'string' ?
      // eslint-disable-next-line react-internal/safe-string-coercion
      String(error.message) :
      // eslint-disable-next-line react-internal/safe-string-coercion
      String(error);
      var properties = [['Error', message]];
      performance.measure(entryName, {
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
    } else {
      console.timeStamp(entryName, startTime < 0 ? 0 : startTime, childrenEndTime, trackNames[trackIdx], COMPONENTS_TRACK, 'error');
    }
  }
}
function logDedupedComponentRender(componentInfo, trackIdx, startTime, endTime) {
  if (supportsUserTiming && endTime >= 0 && trackIdx < 10) {
    var name = componentInfo.name;
    var entryName = name + ' [deduped]';
    var debugTask = componentInfo.debugTask;
    if (debugTask) {
      debugTask.run(
      // $FlowFixMe[method-unbinding]
      console.timeStamp.bind(console, entryName, startTime < 0 ? 0 : startTime, endTime, trackNames[trackIdx], COMPONENTS_TRACK, 'tertiary-light'));
    } else {
      console.timeStamp(entryName, startTime < 0 ? 0 : startTime, endTime, trackNames[trackIdx], COMPONENTS_TRACK, 'tertiary-light');
    }
  }
}

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
      case REACT_PROVIDER_TYPE:
        {
          return null;
        }
      case REACT_CONTEXT_TYPE:
        var context = type;
        {
          return getContextName(context) + '.Provider';
        }
      case REACT_CONSUMER_TYPE:
        {
          var consumer = type;
          return getContextName(consumer._context) + '.Consumer';
        }
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

// This is forked in server builds where the default stack frame may be source mapped.

var DefaultPrepareStackTrace = undefined;

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
  idx = stack.indexOf('react-stack-bottom-frame');
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
      console.error('React instrumentation encountered an error: %s.', err);
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

// $FlowFixMe[missing-this-annot]
function ReactPromise(status, value, reason, response) {
  this.status = status;
  this.value = value;
  this.reason = reason;
  this._response = response;
  {
    this._children = [];
  }
  {
    this._debugInfo = null;
  }
}
// We subclass Promise.prototype so that we get other methods like .catch
ReactPromise.prototype = Object.create(Promise.prototype);
// TODO: This doesn't return a new Promise chain unlike the real .then
ReactPromise.prototype.then = function (resolve, reject) {
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
  // The status might have changed after initialization.
  switch (chunk.status) {
    case INITIALIZED:
      resolve(chunk.value);
      break;
    case PENDING:
    case BLOCKED:
      if (resolve) {
        if (chunk.value === null) {
          chunk.value = [];
        }
        chunk.value.push(resolve);
      }
      if (reject) {
        if (chunk.reason === null) {
          chunk.reason = [];
        }
        chunk.reason.push(reject);
      }
      break;
    default:
      if (reject) {
        reject(chunk.reason);
      }
      break;
  }
};
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
       
      throw chunk;
    default:
      throw chunk.reason;
  }
}
function getRoot(response) {
  var chunk = getChunk(response, 0);
  return chunk;
}
function createPendingChunk(response) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(PENDING, null, null, response);
}
function createBlockedChunk(response) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(BLOCKED, null, null, response);
}
function createErrorChunk(response, error) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(ERRORED, null, error, response);
}
function wakeChunk(listeners, value) {
  for (var i = 0; i < listeners.length; i++) {
    var listener = listeners[i];
    listener(value);
  }
}
function wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners) {
  switch (chunk.status) {
    case INITIALIZED:
      wakeChunk(resolveListeners, chunk.value);
      break;
    case PENDING:
    case BLOCKED:
      if (chunk.value) {
        for (var i = 0; i < resolveListeners.length; i++) {
          chunk.value.push(resolveListeners[i]);
        }
      } else {
        chunk.value = resolveListeners;
      }
      if (chunk.reason) {
        if (rejectListeners) {
          for (var _i = 0; _i < rejectListeners.length; _i++) {
            chunk.reason.push(rejectListeners[_i]);
          }
        }
      } else {
        chunk.reason = rejectListeners;
      }
      break;
    case ERRORED:
      if (rejectListeners) {
        wakeChunk(rejectListeners, chunk.reason);
      }
      break;
  }
}
function triggerErrorOnChunk(chunk, error) {
  if (chunk.status !== PENDING && chunk.status !== BLOCKED) {
    // If we get more data to an already resolved ID, we assume that it's
    // a stream chunk since any other row shouldn't have more than one entry.
    var streamChunk = chunk;
    var controller = streamChunk.reason;
    // $FlowFixMe[incompatible-call]: The error method should accept mixed.
    controller.error(error);
    return;
  }
  var listeners = chunk.reason;
  var erroredChunk = chunk;
  erroredChunk.status = ERRORED;
  erroredChunk.reason = error;
  if (listeners !== null) {
    wakeChunk(listeners, error);
  }
}
function createResolvedModelChunk(response, value) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(RESOLVED_MODEL, value, null, response);
}
function createResolvedModuleChunk(response, value) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(RESOLVED_MODULE, value, null, response);
}
function createInitializedTextChunk(response, value) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(INITIALIZED, value, null, response);
}
function createInitializedBufferChunk(response, value) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(INITIALIZED, value, null, response);
}
function createInitializedIteratorResultChunk(response, value, done) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(INITIALIZED, {
    done: done,
    value: value
  }, null, response);
}
function createInitializedStreamChunk(response, value, controller) {
  // We use the reason field to stash the controller since we already have that
  // field. It's a bit of a hack but efficient.
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(INITIALIZED, value, controller, response);
}
function createResolvedIteratorResultChunk(response, value, done) {
  // To reuse code as much code as possible we add the wrapper element as part of the JSON.
  var iteratorResultJSON = (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + '}';
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(RESOLVED_MODEL, iteratorResultJSON, null, response);
}
function resolveIteratorResultChunk(chunk, value, done) {
  // To reuse code as much code as possible we add the wrapper element as part of the JSON.
  var iteratorResultJSON = (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + '}';
  resolveModelChunk(chunk, iteratorResultJSON);
}
function resolveModelChunk(chunk, value) {
  if (chunk.status !== PENDING) {
    // If we get more data to an already resolved ID, we assume that it's
    // a stream chunk since any other row shouldn't have more than one entry.
    var streamChunk = chunk;
    var controller = streamChunk.reason;
    controller.enqueueModel(value);
    return;
  }
  var resolveListeners = chunk.value;
  var rejectListeners = chunk.reason;
  var resolvedChunk = chunk;
  resolvedChunk.status = RESOLVED_MODEL;
  resolvedChunk.value = value;
  if (resolveListeners !== null) {
    // This is unfortunate that we're reading this eagerly if
    // we already have listeners attached since they might no
    // longer be rendered or might not be the highest pri.
    initializeModelChunk(resolvedChunk);
    // The status might have changed after initialization.
    wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners);
  }
}
function resolveModuleChunk(chunk, value) {
  if (chunk.status !== PENDING && chunk.status !== BLOCKED) {
    // We already resolved. We didn't expect to see this.
    return;
  }
  var resolveListeners = chunk.value;
  var rejectListeners = chunk.reason;
  var resolvedChunk = chunk;
  resolvedChunk.status = RESOLVED_MODULE;
  resolvedChunk.value = value;
  if (resolveListeners !== null) {
    initializeModuleChunk(resolvedChunk);
    wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners);
  }
}
var initializingHandler = null;
var initializingChunk = null;
function initializeModelChunk(chunk) {
  var prevHandler = initializingHandler;
  var prevChunk = initializingChunk;
  initializingHandler = null;
  var resolvedModel = chunk.value;

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
  try {
    var value = parseModel(chunk._response, resolvedModel);
    // Invoke any listeners added while resolving this model. I.e. cyclic
    // references. This may or may not fully resolve the model depending on
    // if they were blocked.
    var resolveListeners = cyclicChunk.value;
    if (resolveListeners !== null) {
      cyclicChunk.value = null;
      cyclicChunk.reason = null;
      wakeChunk(resolveListeners, value);
    }
    if (initializingHandler !== null) {
      if (initializingHandler.errored) {
        throw initializingHandler.value;
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
function reportGlobalError(response, error) {
  response._closed = true;
  response._closedReason = error;
  response._chunks.forEach(function (chunk) {
    // If this chunk was already resolved or errored, it won't
    // trigger an error but if it wasn't then we need to
    // because we won't be getting any new data to resolve it.
    if (chunk.status === PENDING) {
      triggerErrorOnChunk(chunk, error);
    }
  });
  {
    markAllTracksInOrder();
    flushComponentPerformance(response, getChunk(response, 0), 0, -Infinity, -Infinity);
  }
}
function nullRefGetter() {
  {
    return null;
  }
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
      _owner: owner === null ? response._debugRootOwner : owner
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
    Object.defineProperty(element, '_debugStack', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: normalizedStackTrace
    });
    var task = null;
    if (supportsCreateTask && stack !== null) {
      var createTaskFn = console.createTask.bind(console, getTaskName(type));
      var callStack = buildFakeCallStack(response, stack, env, createTaskFn);
      // This owner should ideally have already been initialized to avoid getting
      // user stack frames on the stack.
      var ownerTask = owner === null ? null : initializeFakeTask(response, owner, env);
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
    Object.defineProperty(element, '_debugTask', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: task
    });

    // This owner should ideally have already been initialized to avoid getting
    // user stack frames on the stack.
    if (owner !== null) {
      initializeFakeStack(response, owner);
    }
  }
  if (initializingHandler !== null) {
    var handler = initializingHandler;
    // We pop the stack to the previous outer handler before leaving the Element.
    // This is effectively the complete phase.
    initializingHandler = handler.parent;
    if (handler.errored) {
      // Something errored inside this Element's props. We can turn this Element
      // into a Lazy so that we can still render up until that Lazy is rendered.
      var erroredChunk = createErrorChunk(response, handler.value);
      {
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
      return createLazyChunkWrapper(erroredChunk);
    }
    if (handler.deps > 0) {
      // We have blocked references inside this Element but we can turn this into
      // a Lazy node referencing this Element to let everything around it proceed.
      var blockedChunk = createBlockedChunk(response);
      handler.value = element;
      handler.chunk = blockedChunk;
      {
        var freeze = Object.freeze.bind(Object, element.props);
        blockedChunk.then(freeze, freeze);
      }
      return createLazyChunkWrapper(blockedChunk);
    }
  } else {
    // TODO: We should be freezing the element but currently, we might write into
    // _debugInfo later. We could move it into _store which remains mutable.
    Object.freeze(element.props);
  }
  return element;
}
function createLazyChunkWrapper(chunk) {
  var lazyType = {
    $$typeof: REACT_LAZY_TYPE,
    _payload: chunk,
    _init: readChunk
  };
  {
    // Ensure we have a live array to track future debug info.
    var chunkDebugInfo = chunk._debugInfo || (chunk._debugInfo = []);
    lazyType._debugInfo = chunkDebugInfo;
  }
  return lazyType;
}
function getChunk(response, id) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);
  if (!chunk) {
    if (response._closed) {
      // We have already errored the response and we're not going to get
      // anything more streaming in so this will immediately error.
      chunk = createErrorChunk(response, response._closedReason);
    } else {
      chunk = createPendingChunk(response);
    }
    chunks.set(id, chunk);
  }
  return chunk;
}
function waitForReference(referencedChunk, parentObject, key, response, map, path) {
  var handler;
  if (initializingHandler) {
    handler = initializingHandler;
    handler.deps++;
  } else {
    handler = initializingHandler = {
      parent: null,
      chunk: null,
      value: null,
      deps: 1,
      errored: false
    };
  }
  function fulfill(value) {
    for (var i = 1; i < path.length; i++) {
      while (value.$$typeof === REACT_LAZY_TYPE) {
        // We never expect to see a Lazy node on this path because we encode those as
        // separate models. This must mean that we have inserted an extra lazy node
        // e.g. to replace a blocked element. We must instead look for it inside.
        var chunk = value._payload;
        if (chunk === handler.chunk) {
          // This is a reference to the thing we're currently blocking. We can peak
          // inside of it to get the value.
          value = handler.value;
          continue;
        } else if (chunk.status === INITIALIZED) {
          value = chunk.value;
          continue;
        } else {
          // If we're not yet initialized we need to skip what we've already drilled
          // through and then wait for the next value to become available.
          path.splice(0, i - 1);
          chunk.then(fulfill, reject);
          return;
        }
      }
      value = value[path[i]];
    }
    var mappedValue = map(response, value, parentObject, key);
    parentObject[key] = mappedValue;

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
          element.props = mappedValue;
          break;
        case '4':
          {
            element._owner = mappedValue;
          }
          break;
      }
    }
    handler.deps--;
    if (handler.deps === 0) {
      var _chunk = handler.chunk;
      if (_chunk === null || _chunk.status !== BLOCKED) {
        return;
      }
      var resolveListeners = _chunk.value;
      var initializedChunk = _chunk;
      initializedChunk.status = INITIALIZED;
      initializedChunk.value = handler.value;
      if (resolveListeners !== null) {
        wakeChunk(resolveListeners, handler.value);
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
    handler.value = error;
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
        var chunkDebugInfo = chunk._debugInfo || (chunk._debugInfo = []);
        chunkDebugInfo.push(erroredComponent);
      }
    }
    triggerErrorOnChunk(chunk, error);
  }
  referencedChunk.then(fulfill, reject);

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
    parentObject[key] = resolvedValue;

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
      if (resolveListeners !== null) {
        wakeChunk(resolveListeners, handler.value);
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
    handler.value = error;
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
        var chunkDebugInfo = chunk._debugInfo || (chunk._debugInfo = []);
        chunkDebugInfo.push(erroredComponent);
      }
    }
    triggerErrorOnChunk(chunk, error);
  }
  promise.then(fulfill, reject);

  // Return a place holder value for now.
  return null;
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
        while (value.$$typeof === REACT_LAZY_TYPE) {
          var referencedChunk = value._payload;
          if (referencedChunk.status === INITIALIZED) {
            value = referencedChunk.value;
          } else {
            return waitForReference(referencedChunk, parentObject, key, response, map, path.slice(i - 1));
          }
        }
        value = value[path[i]];
      }
      var chunkValue = map(response, value, parentObject, key);
      if (chunk._debugInfo) {
        // If we have a direct reference to an object that was rendered by a synchronous
        // server component, it might have some debug info about how it was rendered.
        // We forward this to the underlying object. This might be a React Element or
        // an Array fragment.
        // If this was a string / number return value we lose the debug info. We choose
        // that tradeoff to allow sync server components to return plain values and not
        // use them as React Nodes necessarily. We could otherwise wrap them in a Lazy.
        if (typeof chunkValue === 'object' && chunkValue !== null && (isArray(chunkValue) || typeof chunkValue[ASYNC_ITERATOR] === 'function' || chunkValue.$$typeof === REACT_ELEMENT_TYPE) && !chunkValue._debugInfo) {
          // We should maybe use a unique symbol for arrays but this is a React owned array.
          // $FlowFixMe[prop-missing]: This should be added to elements.
          Object.defineProperty(chunkValue, '_debugInfo', {
            configurable: false,
            enumerable: false,
            writable: true,
            value: chunk._debugInfo
          });
        }
      }
      return chunkValue;
    case PENDING:
    case BLOCKED:
      return waitForReference(chunk, parentObject, key, response, map, path);
    default:
      // This is an error. Instead of erroring directly, we're going to encode this on
      // an initialization handler so that we can catch it at the nearest Element.
      if (initializingHandler) {
        initializingHandler.errored = true;
        initializingHandler.value = chunk.reason;
      } else {
        initializingHandler = {
          parent: null,
          chunk: null,
          value: chunk.reason,
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
function extractIterator(response, model) {
  // $FlowFixMe[incompatible-use]: This uses raw Symbols because we're extracting from a native array.
  return model[Symbol.iterator]();
}
function createModel(response, model) {
  return model;
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
          return createLazyChunkWrapper(chunk);
        }
      case '@':
        {
          // Promise
          if (value.length === 2) {
            // Infinite promise that never resolves.
            return new Promise(function () {});
          }
          var _id = parseInt(value.slice(2), 16);
          var _chunk2 = getChunk(response, _id);
          {
            if (initializingChunk !== null && isArray(initializingChunk._children)) {
              initializingChunk._children.push(_chunk2);
            }
          }
          return _chunk2;
        }
      case 'S':
        {
          // Symbol
          return Symbol.for(value.slice(2));
        }
      case 'F':
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
      case 'E':
        {
          {
            // In DEV mode we allow indirect eval to produce functions for logging.
            // This should not compile to eval() because then it has local scope access.
            try {
               
              return (0, eval)(value.slice(2));
            } catch (x) {
              // We currently use this to express functions so we fail parsing it,
              // let's just return a blank function as a place holder.
              return function () {};
            }
          }
          // Fallthrough
        }
      case 'Y':
        {
          {
            // In DEV mode we encode omitted objects in logs as a getter that throws
            // so that when you try to access it on the client, you know why that
            // happened.
            Object.defineProperty(parentObject, key, {
              get: function () {
                // TODO: We should ideally throw here to indicate a difference.
                return 'This object has been omitted by React in the console log ' + 'to avoid sending too much data from the server. Try logging smaller ' + 'or more specific objects.';
              },
              enumerable: true,
              configurable: false
            });
            return null;
          }
          // Fallthrough
        }
      default:
        {
          // We assume that anything else is a reference ID.
          var _ref7 = value.slice(1);
          return getOutlinedModel(response, _ref7, parentObject, key, createModel);
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
function ResponseInstance(bundlerConfig, serverReferenceConfig, moduleLoading, callServer, encodeFormAction, nonce, temporaryReferences, findSourceMapURL, replayConsole, environmentName) {
  var chunks = new Map();
  this._bundlerConfig = bundlerConfig;
  this._serverReferenceConfig = serverReferenceConfig;
  this._moduleLoading = moduleLoading;
  this._callServer = callServer !== undefined ? callServer : missingCall;
  this._encodeFormAction = encodeFormAction;
  this._nonce = nonce;
  this._chunks = chunks;
  this._stringDecoder = createStringDecoder();
  this._fromJSON = null;
  this._rowState = 0;
  this._rowID = 0;
  this._rowTag = 0;
  this._rowLength = 0;
  this._buffer = [];
  this._closed = false;
  this._closedReason = null;
  this._tempRefs = temporaryReferences;
  {
    this._timeOrigin = 0;
  }
  {
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
    this._debugFindSourceMapURL = findSourceMapURL;
    this._replayConsole = replayConsole;
    this._rootEnvironmentName = rootEnv;
  }
  // Don't inline this call because it causes closure to outline the call above.
  this._fromJSON = createFromJSONCallback(this);
}
function createResponse(bundlerConfig, serverReferenceConfig, moduleLoading, callServer, encodeFormAction, nonce, temporaryReferences, findSourceMapURL, replayConsole, environmentName) {
  // $FlowFixMe[invalid-constructor]: the shapes are exact here but Flow doesn't like constructors
  return new ResponseInstance(bundlerConfig, serverReferenceConfig, moduleLoading, callServer, encodeFormAction, nonce, temporaryReferences, findSourceMapURL, replayConsole, environmentName);
}
function resolveModel(response, id, model) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);
  if (!chunk) {
    chunks.set(id, createResolvedModelChunk(response, model));
  } else {
    resolveModelChunk(chunk, model);
  }
}
function resolveText(response, id, text) {
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
  chunks.set(id, createInitializedTextChunk(response, text));
}
function resolveBuffer(response, id, buffer) {
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
  chunks.set(id, createInitializedBufferChunk(response, buffer));
}
function resolveModule(response, id, model) {
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
      blockedChunk = createBlockedChunk(response);
      chunks.set(id, blockedChunk);
    } else {
      // This can't actually happen because we don't have any forward
      // references to modules.
      blockedChunk = chunk;
      blockedChunk.status = BLOCKED;
    }
    promise.then(function () {
      return resolveModuleChunk(blockedChunk, clientReference);
    }, function (error) {
      return triggerErrorOnChunk(blockedChunk, error);
    });
  } else {
    if (!chunk) {
      chunks.set(id, createResolvedModuleChunk(response, clientReference));
    } else {
      // This can't actually happen because we don't have any forward
      // references to modules.
      resolveModuleChunk(chunk, clientReference);
    }
  }
}
function resolveStream(response, id, stream, controller) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);
  if (!chunk) {
    chunks.set(id, createInitializedStreamChunk(response, stream, controller));
    return;
  }
  if (chunk.status !== PENDING) {
    // We already resolved. We didn't expect to see this.
    return;
  }
  var resolveListeners = chunk.value;
  var resolvedChunk = chunk;
  resolvedChunk.status = INITIALIZED;
  resolvedChunk.value = stream;
  resolvedChunk.reason = controller;
  if (resolveListeners !== null) {
    wakeChunk(resolveListeners, chunk.value);
  }
}
function startReadableStream(response, id, type) {
  var controller = null;
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
          resolveModelChunk(_chunk3, json);
        });
      }
    },
    close: function (json) {
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
  resolveStream(response, id, stream, flightController);
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
function startAsyncIterable(response, id, iterator) {
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
        if (resolveListeners !== null) {
          wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners);
        }
      }
      nextWriteIndex++;
    },
    enqueueModel: function (value) {
      if (nextWriteIndex === buffer.length) {
        buffer[nextWriteIndex] = createResolvedIteratorResultChunk(response, value, false);
      } else {
        resolveIteratorResultChunk(buffer[nextWriteIndex], value, false);
      }
      nextWriteIndex++;
    },
    close: function (value) {
      closed = true;
      if (nextWriteIndex === buffer.length) {
        buffer[nextWriteIndex] = createResolvedIteratorResultChunk(response, value, true);
      } else {
        resolveIteratorResultChunk(buffer[nextWriteIndex], value, true);
      }
      nextWriteIndex++;
      while (nextWriteIndex < buffer.length) {
        // In generators, any extra reads from the iterator have the value undefined.
        resolveIteratorResultChunk(buffer[nextWriteIndex++], '"$undefined"', true);
      }
    },
    error: function (error) {
      closed = true;
      if (nextWriteIndex === buffer.length) {
        buffer[nextWriteIndex] = createPendingChunk(response);
      }
      while (nextWriteIndex < buffer.length) {
        triggerErrorOnChunk(buffer[nextWriteIndex++], error);
      }
    }
  };
  var iterable = _defineProperty({}, ASYNC_ITERATOR, function () {
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
          }, null, response);
        }
        buffer[nextReadIndex] = createPendingChunk(response);
      }
      return buffer[nextReadIndex++];
    });
  });
  // TODO: If it's a single shot iterator we can optimize memory by cleaning up the buffer after
  // reading through the end, but currently we favor code size over this optimization.
  resolveStream(response, id, iterator ? iterable[ASYNC_ITERATOR]() : iterable, flightController);
}
function stopStream(response, id, row) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);
  if (!chunk || chunk.status !== INITIALIZED) {
    // We didn't expect not to have an existing stream;
    return;
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
  var callStack = buildFakeCallStack(response, stack, env,
  // $FlowFixMe[incompatible-use]
  Error.bind(null, message || 'An error occurred in the Server Components render but no message was provided'));
  var rootTask = getRootTask(response, env);
  if (rootTask != null) {
    error = rootTask.run(callStack);
  } else {
    error = callStack();
  }
  error.name = name;
  error.environmentName = env;
  return error;
}
function resolvePostponeDev(response, id, reason, stack, env) {
  var postponeInstance;
  var callStack = buildFakeCallStack(response, stack, env,
  // $FlowFixMe[incompatible-use]
  Error.bind(null, reason || ''));
  var rootTask = response._debugRootTask;
  if (rootTask != null) {
    postponeInstance = rootTask.run(callStack);
  } else {
    postponeInstance = callStack();
  }
  postponeInstance.$$typeof = REACT_POSTPONE_TYPE;
  var chunks = response._chunks;
  var chunk = chunks.get(id);
  if (!chunk) {
    chunks.set(id, createErrorChunk(response, postponeInstance));
  } else {
    triggerErrorOnChunk(chunk, postponeInstance);
  }
}
function resolveHint(response, code, model) {
  var hintModel = parseModel(response, model);
  dispatchHint(code, hintModel);
}
var supportsCreateTask = !!console.createTask;
var fakeFunctionCache = new Map() ;
var fakeFunctionIdx = 0;
function createFakeFunction(name, filename, sourceMap, line, col, environmentName) {
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
  if (line <= 1) {
    var minSize = encodedName.length + 7;
    code = '({' + encodedName + ':_=>' + ' '.repeat(col < minSize ? 0 : col - minSize) + '_()})\n' + comment;
  } else {
    code = comment + '\n'.repeat(line - 2) + '({' + encodedName + ':_=>\n' + ' '.repeat(col < 1 ? 0 : col - 1) + '_()})';
  }
  if (filename.startsWith('/')) {
    // If the filename starts with `/` we assume that it is a file system file
    // rather than relative to the current host. Since on the server fully qualified
    // stack traces use the file path.
    // TODO: What does this look like on Windows?
    filename = 'file://' + filename;
  }
  if (sourceMap) {
    // We use the prefix rsc://React/ to separate these from other files listed in
    // the Chrome DevTools. We need a "host name" and not just a protocol because
    // otherwise the group name becomes the root folder. Ideally we don't want to
    // show these at all but there's two reasons to assign a fake URL.
    // 1) A printed stack trace string needs a unique URL to be able to source map it.
    // 2) If source maps are disabled or fails, you should at least be able to tell
    //    which file it was.
    code += '\n//# sourceURL=rsc://React/' + encodeURIComponent(environmentName) + '/' + encodeURI(filename) + '?' + fakeFunctionIdx++;
    code += '\n//# sourceMappingURL=' + sourceMap;
  } else if (filename) {
    code += '\n//# sourceURL=' + encodeURI(filename);
  } else {
    code += '\n//# sourceURL=<anonymous>';
  }
  var fn;
  try {
     
    fn = (0, eval)(code)[name];
  } catch (x) {
    // If eval fails, such as if in an environment that doesn't support it,
    // we fallback to creating a function here. It'll still have the right
    // name but it'll lose line/column number and file name.
    fn = function (_) {
      return _();
    };
  }
  return fn;
}
function buildFakeCallStack(response, stack, environmentName, innerCall) {
  var callStack = innerCall;
  for (var i = 0; i < stack.length; i++) {
    var frame = stack[i];
    var frameKey = frame.join('-') + '-' + environmentName;
    var fn = fakeFunctionCache.get(frameKey);
    if (fn === undefined) {
      var name = frame[0],
        filename = frame[1],
        line = frame[2],
        col = frame[3];
      var findSourceMapURL = response._debugFindSourceMapURL;
      var sourceMap = findSourceMapURL ? findSourceMapURL(filename, environmentName) : null;
      fn = createFakeFunction(name, filename, sourceMap, line, col, environmentName);
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
function initializeFakeTask(response, debugInfo, childEnvironmentName) {
  if (!supportsCreateTask) {
    return null;
  }
  var componentInfo = debugInfo; // Refined
  if (debugInfo.stack == null) {
    // If this is an error, we should've really already initialized the task.
    // If it's null, we can't initialize a task.
    return null;
  }
  var stack = debugInfo.stack;
  var env = componentInfo.env == null ? response._rootEnvironmentName : componentInfo.env;
  if (env !== childEnvironmentName) {
    // This is the boundary between two environments so we'll annotate the task name.
    // That is unusual so we don't cache it.
    var ownerTask = componentInfo.owner == null ? null : initializeFakeTask(response, componentInfo.owner, env);
    return buildFakeTask(response, ownerTask, stack, '"use ' + childEnvironmentName.toLowerCase() + '"', env);
  } else {
    var cachedEntry = componentInfo.debugTask;
    if (cachedEntry !== undefined) {
      return cachedEntry;
    }
    var _ownerTask = componentInfo.owner == null ? null : initializeFakeTask(response, componentInfo.owner, env);
    // $FlowFixMe[cannot-write]: We consider this part of initialization.
    return componentInfo.debugTask = buildFakeTask(response, _ownerTask, stack, getServerComponentTaskName(componentInfo), env);
  }
}
function buildFakeTask(response, ownerTask, stack, taskName, env) {
  var createTaskFn = console.createTask.bind(console, taskName);
  var callStack = buildFakeCallStack(response, stack, env, createTaskFn);
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
  'react-stack-bottom-frame': function (response, stack, environmentName) {
    var callStackForError = buildFakeCallStack(response, stack, environmentName, fakeJSXCallSite);
    return callStackForError();
  }
};
var createFakeJSXCallStackInDEV = // We use this technique to trick minifiers to preserve the function name.
createFakeJSXCallStack['react-stack-bottom-frame'].bind(createFakeJSXCallStack) ;

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
  if (debugInfo.owner != null) {
    // Initialize any owners not yet initialized.
    initializeFakeStack(response, debugInfo.owner);
  }
}
function resolveDebugInfo(response, id, debugInfo) {
  // We eagerly initialize the fake task because this resolving happens outside any
  // render phase so we're not inside a user space stack at this point. If we waited
  // to initialize it when we need it, we might be inside user code.
  var env = debugInfo.env === undefined ? response._rootEnvironmentName : debugInfo.env;
  if (debugInfo.stack !== undefined) {
    var componentInfoOrAsyncInfo =
    // $FlowFixMe[incompatible-type]
    debugInfo;
    initializeFakeTask(response, componentInfoOrAsyncInfo, env);
  }
  if (debugInfo.owner === null && response._debugRootOwner != null) {
    // $FlowFixMe[prop-missing] By narrowing `owner` to `null`, we narrowed `debugInfo` to `ReactComponentInfo`
    var componentInfo = debugInfo;
    // $FlowFixMe[cannot-write]
    componentInfo.owner = response._debugRootOwner;
    // We override the stack if we override the owner since the stack where the root JSX
    // was created on the server isn't very useful but where the request was made is.
    // $FlowFixMe[cannot-write]
    componentInfo.debugStack = response._debugRootStack;
  } else if (debugInfo.stack !== undefined) {
    var _componentInfoOrAsyncInfo =
    // $FlowFixMe[incompatible-type]
    debugInfo;
    initializeFakeStack(response, _componentInfoOrAsyncInfo);
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
  var chunk = getChunk(response, id);
  var chunkDebugInfo = chunk._debugInfo || (chunk._debugInfo = []);
  chunkDebugInfo.push(debugInfo);
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
  'react-stack-bottom-frame': function (response, methodName, stackTrace, owner, env, args) {
    // There really shouldn't be anything else on the stack atm.
    var prevStack = ReactSharedInternals.getCurrentStack;
    ReactSharedInternals.getCurrentStack = getCurrentStackInDEV;
    currentOwnerInDEV = owner === null ? response._debugRootOwner : owner;
    try {
      var callStack = buildFakeCallStack(response, stackTrace, env, bindToConsole(methodName, args, env));
      if (owner != null) {
        var task = initializeFakeTask(response, owner, env);
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
replayConsoleWithCallStack['react-stack-bottom-frame'].bind(replayConsoleWithCallStack) ;
function resolveConsoleEntry(response, value) {
  if (!response._replayConsole) {
    return;
  }
  var payload = parseModel(response, value);
  var methodName = payload[0];
  var stackTrace = payload[1];
  var owner = payload[2];
  var env = payload[3];
  var args = payload.slice(4);
  replayConsoleWithCallStackInDEV(response, methodName, stackTrace, owner, env, args);
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
  for (var _i2 = 0; _i2 < l; _i2++) {
    var chunk = buffer[_i2];
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  result.set(lastChunk, offset);
  return result;
}
function resolveTypedArray(response, id, buffer, lastChunk, constructor, bytesPerElement) {
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
  resolveBuffer(response, id, view);
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
      logDedupedComponentRender(previousResult.component, trackIdx, parentEndTime, previousEndTime);
    }
    // Since we didn't bump the track this time, we just return the same track.
    previousResult.track = trackIdx;
    return previousResult;
  }
  var children = root._children;
  if (root.status === RESOLVED_MODEL) {
    // If the model is not initialized by now, do that now so we can find its
    // children. This part is a little sketchy since it significantly changes
    // the performance characteristics of the app by profiling.
    initializeModelChunk(root);
  }

  // First find the start time of the first component to know if it was running
  // in parallel with the previous.
  var debugInfo = root._debugInfo;
  if (debugInfo) {
    for (var i = 1; i < debugInfo.length; i++) {
      var info = debugInfo[i];
      if (typeof info.name === 'string') {
        // $FlowFixMe: Refined.
        var startTimeInfo = debugInfo[i - 1];
        if (typeof startTimeInfo.time === 'number') {
          var startTime = startTimeInfo.time;
          if (startTime < trackTime) {
            // The start time of this component is before the end time of the previous
            // component on this track so we need to bump the next one to a parallel track.
            trackIdx++;
          }
          trackTime = startTime;
          break;
        }
      }
    }
    for (var _i3 = debugInfo.length - 1; _i3 >= 0; _i3--) {
      var _info = debugInfo[_i3];
      if (typeof _info.time === 'number') {
        if (_info.time > parentEndTime) {
          parentEndTime = _info.time;
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
  for (var _i4 = 0; _i4 < children.length; _i4++) {
    var childResult = flushComponentPerformance(response, children[_i4], childTrackIdx, childTrackTime, parentEndTime);
    if (childResult.component !== null) {
      result.component = childResult.component;
    }
    childTrackIdx = childResult.track;
    var childEndTime = childResult.endTime;
    childTrackTime = childEndTime;
    if (childEndTime > childrenEndTime) {
      childrenEndTime = childEndTime;
    }
  }
  if (debugInfo) {
    var endTime = 0;
    var isLastComponent = true;
    for (var _i5 = debugInfo.length - 1; _i5 >= 0; _i5--) {
      var _info2 = debugInfo[_i5];
      if (typeof _info2.time === 'number') {
        endTime = _info2.time;
        if (endTime > childrenEndTime) {
          childrenEndTime = endTime;
        }
      }
      if (typeof _info2.name === 'string' && _i5 > 0) {
        // $FlowFixMe: Refined.
        var componentInfo = _info2;
        var _startTimeInfo = debugInfo[_i5 - 1];
        if (typeof _startTimeInfo.time === 'number') {
          var _startTime = _startTimeInfo.time;
          if (isLastComponent && root.status === ERRORED && root.reason !== response._closedReason) {
            // If this is the last component to render before this chunk rejected, then conceptually
            // this component errored. If this was a cancellation then it wasn't this component that
            // errored.
            logComponentErrored(componentInfo, trackIdx, _startTime, endTime, childrenEndTime, response._rootEnvironmentName, root.reason);
          } else {
            logComponentRender(componentInfo, trackIdx, _startTime, endTime, childrenEndTime, response._rootEnvironmentName);
          }
          // Track the root most component of the result for deduping logging.
          result.component = componentInfo;
        }
        isLastComponent = false;
      }
    }
  }
  result.endTime = childrenEndTime;
  return result;
}
function processFullBinaryRow(response, id, tag, buffer, chunk) {
  switch (tag) {
    case 65 /* "A" */:
      // We must always clone to extract it into a separate buffer instead of just a view.
      resolveBuffer(response, id, mergeBuffer(buffer, chunk).buffer);
      return;
    case 79 /* "O" */:
      resolveTypedArray(response, id, buffer, chunk, Int8Array, 1);
      return;
    case 111 /* "o" */:
      resolveBuffer(response, id, buffer.length === 0 ? chunk : mergeBuffer(buffer, chunk));
      return;
    case 85 /* "U" */:
      resolveTypedArray(response, id, buffer, chunk, Uint8ClampedArray, 1);
      return;
    case 83 /* "S" */:
      resolveTypedArray(response, id, buffer, chunk, Int16Array, 2);
      return;
    case 115 /* "s" */:
      resolveTypedArray(response, id, buffer, chunk, Uint16Array, 2);
      return;
    case 76 /* "L" */:
      resolveTypedArray(response, id, buffer, chunk, Int32Array, 4);
      return;
    case 108 /* "l" */:
      resolveTypedArray(response, id, buffer, chunk, Uint32Array, 4);
      return;
    case 71 /* "G" */:
      resolveTypedArray(response, id, buffer, chunk, Float32Array, 4);
      return;
    case 103 /* "g" */:
      resolveTypedArray(response, id, buffer, chunk, Float64Array, 8);
      return;
    case 77 /* "M" */:
      resolveTypedArray(response, id, buffer, chunk, BigInt64Array, 8);
      return;
    case 109 /* "m" */:
      resolveTypedArray(response, id, buffer, chunk, BigUint64Array, 8);
      return;
    case 86 /* "V" */:
      resolveTypedArray(response, id, buffer, chunk, DataView, 1);
      return;
  }
  var stringDecoder = response._stringDecoder;
  var row = '';
  for (var i = 0; i < buffer.length; i++) {
    row += readPartialStringChunk(stringDecoder, buffer[i]);
  }
  row += readFinalStringChunk(stringDecoder, chunk);
  processFullStringRow(response, id, tag, row);
}
function processFullStringRow(response, id, tag, row) {
  switch (tag) {
    case 73 /* "I" */:
      {
        resolveModule(response, id, row);
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
        var errorInfo = JSON.parse(row);
        var error;
        {
          error = resolveErrorDev(response, errorInfo);
        }
        error.digest = errorInfo.digest;
        var errorWithDigest = error;
        var chunks = response._chunks;
        var chunk = chunks.get(id);
        if (!chunk) {
          chunks.set(id, createErrorChunk(response, errorWithDigest));
        } else {
          triggerErrorOnChunk(chunk, errorWithDigest);
        }
        return;
      }
    case 84 /* "T" */:
      {
        resolveText(response, id, row);
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
          var _chunk4 = createResolvedModelChunk(response, row);
          initializeModelChunk(_chunk4);
          var initializedChunk = _chunk4;
          if (initializedChunk.status === INITIALIZED) {
            resolveDebugInfo(response, id, initializedChunk.value);
          } else {
            // TODO: This is not going to resolve in the right order if there's more than one.
            _chunk4.then(function (v) {
              return resolveDebugInfo(response, id, v);
            }, function (e) {
              // Ignore debug info errors for now. Unnecessary noise.
            });
          }
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
        startReadableStream(response, id, undefined);
        return;
      }
    // Fallthrough
    case 114 /* "r" */:
      {
        startReadableStream(response, id, 'bytes');
        return;
      }
    // Fallthrough
    case 88 /* "X" */:
      {
        startAsyncIterable(response, id, false);
        return;
      }
    // Fallthrough
    case 120 /* "x" */:
      {
        startAsyncIterable(response, id, true);
        return;
      }
    // Fallthrough
    case 67 /* "C" */:
      {
        stopStream(response, id, row);
        return;
      }
    // Fallthrough
    case 80 /* "P" */:
      {
        {
          {
            var postponeInfo = JSON.parse(row);
            resolvePostponeDev(response, id, postponeInfo.reason, postponeInfo.stack, postponeInfo.env);
          }
          return;
        }
      }
    // Fallthrough
    default:
      /* """ "{" "[" "t" "f" "n" "0" - "9" */{
        // We assume anything else is JSON.
        resolveModel(response, id, row);
        return;
      }
  }
}
function processBinaryChunk(response, chunk) {
  var i = 0;
  var rowState = response._rowState;
  var rowID = response._rowID;
  var rowTag = response._rowTag;
  var rowLength = response._rowLength;
  var buffer = response._buffer;
  var chunkLength = chunk.length;
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
          if (resolvedRowTag === 84 /* "T" */ || resolvedRowTag === 65 /* "A" */ || resolvedRowTag === 79 /* "O" */ || resolvedRowTag === 111 /* "o" */ || resolvedRowTag === 85 /* "U" */ || resolvedRowTag === 83 /* "S" */ || resolvedRowTag === 115 /* "s" */ || resolvedRowTag === 76 /* "L" */ || resolvedRowTag === 108 /* "l" */ || resolvedRowTag === 71 /* "G" */ || resolvedRowTag === 103 /* "g" */ || resolvedRowTag === 77 /* "M" */ || resolvedRowTag === 109 /* "m" */ || resolvedRowTag === 86 /* "V" */) {
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
      processFullBinaryRow(response, rowID, rowTag, buffer, lastChunk);
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
      // The rest of this row is in a future chunk. We stash the rest of the
      // current chunk until we can process the full row.
      var _length = chunk.byteLength - i;
      var remainingSlice = new Uint8Array(chunk.buffer, offset, _length);
      buffer.push(remainingSlice);
      // Update how many bytes we're still waiting for. If we're looking for
      // a newline, this doesn't hurt since we'll just ignore it.
      rowLength -= remainingSlice.byteLength;
      break;
    }
  }
  response._rowState = rowState;
  response._rowID = rowID;
  response._rowTag = rowTag;
  response._rowLength = rowLength;
}
function parseModel(response, json) {
  return JSON.parse(json, response._fromJSON);
}
function createFromJSONCallback(response) {
  // $FlowFixMe[missing-this-annot]
  return function (key, value) {
    if (typeof value === 'string') {
      // We can't use .bind here because we need the "this" value.
      return parseModelString(response, this, key, value);
    }
    if (typeof value === 'object' && value !== null) {
      return parseModelTuple(response, value);
    }
    return value;
  };
}
function close(response) {
  // In case there are any remaining unresolved chunks, they won't
  // be resolved now. So we need to issue an error to those.
  // Ideally we should be able to early bail out if we kept a
  // ref count of pending chunks.
  reportGlobalError(response, new Error('Connection closed.'));
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

function createResponseFromOptions(options) {
  return createResponse(options && options.moduleBaseURL ? options.moduleBaseURL : '', null, null, options && options.callServer ? options.callServer : undefined, undefined,
  // encodeFormAction
  undefined,
  // nonce
  options && options.temporaryReferences ? options.temporaryReferences : undefined, options && options.findSourceMapURL ? options.findSourceMapURL : undefined, options ? options.replayConsoleLogs !== false : true ,
  // defaults to true
  options && options.environmentName ? options.environmentName : undefined);
}
function startReadingFromStream(response, stream) {
  var reader = stream.getReader();
  function progress(_ref) {
    var done = _ref.done,
      value = _ref.value;
    if (done) {
      close(response);
      return;
    }
    var buffer = value;
    processBinaryChunk(response, buffer);
    return reader.read().then(progress).catch(error);
  }
  function error(e) {
    reportGlobalError(response, e);
  }
  reader.read().then(progress).catch(error);
}
function createFromReadableStream(stream, options) {
  var response = createResponseFromOptions(options);
  startReadingFromStream(response, stream);
  return getRoot(response);
}
function createFromFetch(promiseForResponse, options) {
  var response = createResponseFromOptions(options);
  promiseForResponse.then(function (r) {
    startReadingFromStream(response, r.body);
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
