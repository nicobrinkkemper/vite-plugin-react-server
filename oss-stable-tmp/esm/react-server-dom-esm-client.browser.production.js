/**
* @license React
 * react-server-dom-esm-client.browser.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as ReactDOM from 'react-dom';

function createStringDecoder() {
  return new TextDecoder();
}
const decoderOptions = {
  stream: true
};
function readPartialStringChunk(decoder, buffer) {
  return decoder.decode(buffer, decoderOptions);
}
function readFinalStringChunk(decoder, buffer) {
  return decoder.decode(buffer);
}

// Module root path

function resolveClientReference(bundlerConfig, metadata) {
  const baseURL = bundlerConfig;
  return {
    specifier: baseURL + metadata[0],
    name: metadata[1]
  };
}
function resolveServerReference(config, id) {
  const baseURL = config;
  const idx = id.lastIndexOf('#');
  const exportName = id.slice(idx + 1);
  const fullURL = id.slice(0, idx);
  if (!fullURL.startsWith(baseURL)) {
    throw new Error('Attempted to load a Server Reference outside the hosted root.');
  }
  return {
    specifier: fullURL,
    name: exportName
  };
}
const asyncModuleCache = new Map();
function preloadModule(metadata) {
  const existingPromise = asyncModuleCache.get(metadata.specifier);
  if (existingPromise) {
    if (existingPromise.status === 'fulfilled') {
      return null;
    }
    return existingPromise;
  } else {
    // $FlowFixMe[unsupported-syntax]
    const modulePromise = import(/* @vite-ignore */ metadata.specifier);
    modulePromise.then(value => {
      const fulfilledThenable = modulePromise;
      fulfilledThenable.status = 'fulfilled';
      fulfilledThenable.value = value;
    }, reason => {
      const rejectedThenable = modulePromise;
      rejectedThenable.status = 'rejected';
      rejectedThenable.reason = reason;
    });
    asyncModuleCache.set(metadata.specifier, modulePromise);
    return modulePromise;
  }
}
function requireModule(metadata) {
  let moduleExports;
  // We assume that preloadModule has been called before, which
  // should have added something to the module cache.
  const promise = asyncModuleCache.get(metadata.specifier);
  if (promise.status === 'fulfilled') {
    moduleExports = promise.value;
  } else {
    throw promise.reason;
  }
  return moduleExports[metadata.name];
}

const ReactDOMSharedInternals = ReactDOM.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

// This client file is in the shared folder because it applies to both SSR and browser contexts.
// It is the configuration of the FlightClient behavior which can run in either environment.

function dispatchHint(code, model) {
  const dispatcher = ReactDOMSharedInternals.d; /* ReactDOMCurrentDispatcher */
  switch (code) {
    case 'D':
      {
        const refined = refineModel(code, model);
        const href = refined;
        dispatcher.D(/* prefetchDNS */href);
        return;
      }
    case 'C':
      {
        const refined = refineModel(code, model);
        if (typeof refined === 'string') {
          const href = refined;
          dispatcher.C(/* preconnect */href);
        } else {
          const href = refined[0];
          const crossOrigin = refined[1];
          dispatcher.C(/* preconnect */href, crossOrigin);
        }
        return;
      }
    case 'L':
      {
        const refined = refineModel(code, model);
        const href = refined[0];
        const as = refined[1];
        if (refined.length === 3) {
          const options = refined[2];
          dispatcher.L(/* preload */href, as, options);
        } else {
          dispatcher.L(/* preload */href, as);
        }
        return;
      }
    case 'm':
      {
        const refined = refineModel(code, model);
        if (typeof refined === 'string') {
          const href = refined;
          dispatcher.m(/* preloadModule */href);
        } else {
          const href = refined[0];
          const options = refined[1];
          dispatcher.m(/* preloadModule */href, options);
        }
        return;
      }
    case 'X':
      {
        const refined = refineModel(code, model);
        if (typeof refined === 'string') {
          const href = refined;
          dispatcher.X(/* preinitScript */href);
        } else {
          const href = refined[0];
          const options = refined[1];
          dispatcher.X(/* preinitScript */href, options);
        }
        return;
      }
    case 'S':
      {
        const refined = refineModel(code, model);
        if (typeof refined === 'string') {
          const href = refined;
          dispatcher.S(/* preinitStyle */href);
        } else {
          const href = refined[0];
          const precedence = refined[1] === 0 ? undefined : refined[1];
          const options = refined.length === 3 ? refined[2] : undefined;
          dispatcher.S(/* preinitStyle */href, precedence, options);
        }
        return;
      }
    case 'M':
      {
        const refined = refineModel(code, model);
        if (typeof refined === 'string') {
          const href = refined;
          dispatcher.M(/* preinitModuleScript */href);
        } else {
          const href = refined[0];
          const options = refined[1];
          dispatcher.M(/* preinitModuleScript */href, options);
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

const REACT_ELEMENT_TYPE = Symbol.for('react.transitional.element') ;
const REACT_LAZY_TYPE = Symbol.for('react.lazy');
const REACT_POSTPONE_TYPE = Symbol.for('react.postpone');
const MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
const FAUX_ITERATOR_SYMBOL = '@@iterator';
function getIteratorFn(maybeIterable) {
  if (maybeIterable === null || typeof maybeIterable !== 'object') {
    return null;
  }
  const maybeIterator = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable[FAUX_ITERATOR_SYMBOL];
  if (typeof maybeIterator === 'function') {
    return maybeIterator;
  }
  return null;
}
const ASYNC_ITERATOR = Symbol.asyncIterator;

const isArrayImpl = Array.isArray;
function isArray(a) {
  return isArrayImpl(a);
}

const getPrototypeOf = Object.getPrototypeOf;

function createTemporaryReferenceSet() {
  return new Map();
}
function writeTemporaryReference(set, reference, object) {
  set.set(reference, object);
}
function readTemporaryReference(set, reference) {
  return set.get(reference);
}

const ObjectPrototype = Object.prototype;
const knownServerReferences = new WeakMap();

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
  let nextPartId = 1;
  let pendingParts = 0;
  let formData = null;
  const writtenObjects = new WeakMap();
  let modelRoot = root;
  function serializeTypedArray(tag, typedArray) {
    const blob = new Blob([
    // We should be able to pass the buffer straight through but Node < 18 treat
    // multi-byte array blobs differently so we first convert it to single-byte.
    new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength)]);
    const blobId = nextPartId++;
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
    const data = formData;
    pendingParts++;
    const streamId = nextPartId++;
    const buffer = [];
    function progress(entry) {
      if (entry.done) {
        const blobId = nextPartId++;
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
    const data = formData;
    pendingParts++;
    const streamId = nextPartId++;
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
          const partJSON = JSON.stringify(entry.value, resolveToJSON);
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
    let binaryReader;
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
    const data = formData;
    pendingParts++;
    const streamId = nextPartId++;

    // Generators/Iterators are Iterables but they're also their own iterator
    // functions. If that's the case, we treat them as single-shot. Otherwise,
    // we assume that this iterable might be a multi-shot and allow it to be
    // iterated more than once on the receiving server.
    const isIterator = iterable === iterator;

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
            const partJSON = JSON.stringify(entry.value, resolveToJSON);
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
          const partJSON = JSON.stringify(entry.value, resolveToJSON);
          data.append(formFieldPrefix + streamId, partJSON);
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
    const parent = this;
    if (value === null) {
      return null;
    }
    if (typeof value === 'object') {
      switch (value.$$typeof) {
        case REACT_ELEMENT_TYPE:
          {
            if (temporaryReferences !== undefined && key.indexOf(':') === -1) {
              // TODO: If the property name contains a colon, we don't dedupe. Escape instead.
              const parentReference = writtenObjects.get(parent);
              if (parentReference !== undefined) {
                // If the parent has a reference, we can refer to this object indirectly
                // through the property name inside that parent.
                const reference = parentReference + ':' + key;
                // Store this object so that the server can refer to it later in responses.
                writeTemporaryReference(temporaryReferences, reference, value);
                return serializeTemporaryReferenceMarker();
              }
            }
            throw new Error('React Element cannot be passed to Server Functions from the Client without a ' + 'temporary reference set. Pass a TemporaryReferenceSet to the options.' + (''));
          }
        case REACT_LAZY_TYPE:
          {
            // Resolve lazy as if it wasn't here. In the future this will be encoded as a Promise.
            const lazy = value;
            const payload = lazy._payload;
            const init = lazy._init;
            if (formData === null) {
              // Upgrade to use FormData to allow us to stream this value.
              formData = new FormData();
            }
            pendingParts++;
            try {
              const resolvedModel = init(payload);
              // We always outline this as a separate part even though we could inline it
              // because it ensures a more deterministic encoding.
              const lazyId = nextPartId++;
              const partJSON = serializeModel(resolvedModel, lazyId);
              // $FlowFixMe[incompatible-type] We know it's not null because we assigned it above.
              const data = formData;
              data.append(formFieldPrefix + lazyId, partJSON);
              return serializeByValueID(lazyId);
            } catch (x) {
              if (typeof x === 'object' && x !== null && typeof x.then === 'function') {
                // Suspended
                pendingParts++;
                const lazyId = nextPartId++;
                const thenable = x;
                const retry = function () {
                  // While the first promise resolved, its value isn't necessarily what we'll
                  // resolve into because we might suspend again.
                  try {
                    const partJSON = serializeModel(value, lazyId);
                    // $FlowFixMe[incompatible-type] We know it's not null because we assigned it above.
                    const data = formData;
                    data.append(formFieldPrefix + lazyId, partJSON);
                    pendingParts--;
                    if (pendingParts === 0) {
                      resolve(data);
                    }
                  } catch (reason) {
                    reject(reason);
                  }
                };
                thenable.then(retry, retry);
                return serializeByValueID(lazyId);
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
        const promiseId = nextPartId++;
        const thenable = value;
        thenable.then(partValue => {
          try {
            const partJSON = serializeModel(partValue, promiseId);
            // $FlowFixMe[incompatible-type] We know it's not null because we assigned it above.
            const data = formData;
            data.append(formFieldPrefix + promiseId, partJSON);
            pendingParts--;
            if (pendingParts === 0) {
              resolve(data);
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
      const existingReference = writtenObjects.get(value);
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
        const parentReference = writtenObjects.get(parent);
        if (parentReference !== undefined) {
          // If the parent has a reference, we can refer to this object indirectly
          // through the property name inside that parent.
          const reference = parentReference + ':' + key;
          writtenObjects.set(value, reference);
          if (temporaryReferences !== undefined) {
            // Store this object so that the server can refer to it later in responses.
            writeTemporaryReference(temporaryReferences, reference, value);
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
        const data = formData;
        const refId = nextPartId++;
        // Copy all the form fields with a prefix for this reference.
        // These must come first in the form order because we assume that all the
        // fields are available before this is referenced.
        const prefix = formFieldPrefix + refId + '_';
        // $FlowFixMe[prop-missing]: FormData has forEach.
        value.forEach((originalValue, originalKey) => {
          // $FlowFixMe[incompatible-call]
          data.append(prefix + originalKey, originalValue);
        });
        return serializeFormDataReference(refId);
      }
      if (value instanceof Map) {
        const mapId = nextPartId++;
        const partJSON = serializeModel(Array.from(value), mapId);
        if (formData === null) {
          formData = new FormData();
        }
        formData.append(formFieldPrefix + mapId, partJSON);
        return serializeMapID(mapId);
      }
      if (value instanceof Set) {
        const setId = nextPartId++;
        const partJSON = serializeModel(Array.from(value), setId);
        if (formData === null) {
          formData = new FormData();
        }
        formData.append(formFieldPrefix + setId, partJSON);
        return serializeSetID(setId);
      }
      if (value instanceof ArrayBuffer) {
        const blob = new Blob([value]);
        const blobId = nextPartId++;
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
        const blobId = nextPartId++;
        formData.append(formFieldPrefix + blobId, value);
        return serializeBlobID(blobId);
      }
      const iteratorFn = getIteratorFn(value);
      if (iteratorFn) {
        const iterator = iteratorFn.call(value);
        if (iterator === value) {
          // Iterator, not Iterable
          const iteratorId = nextPartId++;
          const partJSON = serializeModel(Array.from(iterator), iteratorId);
          if (formData === null) {
            formData = new FormData();
          }
          formData.append(formFieldPrefix + iteratorId, partJSON);
          return serializeIteratorID(iteratorId);
        }
        return Array.from(iterator);
      }

      // TODO: ReadableStream is not available in old Node. Remove the typeof check later.
      if (typeof ReadableStream === 'function' && value instanceof ReadableStream) {
        return serializeReadableStream(value);
      }
      const getAsyncIterator = value[ASYNC_ITERATOR];
      if (typeof getAsyncIterator === 'function') {
        // We treat AsyncIterables as a Fragment and as such we might need to key them.
        return serializeAsyncIterable(value, getAsyncIterator.call(value));
      }

      // Verify that this is a simple plain object.
      const proto = getPrototypeOf(value);
      if (proto !== ObjectPrototype && (proto === null || getPrototypeOf(proto) !== null)) {
        if (temporaryReferences === undefined) {
          throw new Error('Only plain objects, and a few built-ins, can be passed to Server Functions. ' + 'Classes or null prototypes are not supported.' + (''));
        }
        // We will have written this object to the temporary reference set above
        // so we can replace it with a marker to refer to this slot later.
        return serializeTemporaryReferenceMarker();
      }

      // $FlowFixMe[incompatible-return]
      return value;
    }
    if (typeof value === 'string') {
      // TODO: Maybe too clever. If we support URL there's no similar trick.
      if (value[value.length - 1] === 'Z') {
        // Possibly a Date, whose toJSON automatically calls toISOString
        // $FlowFixMe[incompatible-use]
        const originalValue = parent[key];
        if (originalValue instanceof Date) {
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
      const referenceClosure = knownServerReferences.get(value);
      if (referenceClosure !== undefined) {
        const id = referenceClosure.id,
          bound = referenceClosure.bound;
        const referenceClosureJSON = JSON.stringify({
          id,
          bound
        }, resolveToJSON);
        if (formData === null) {
          // Upgrade to use FormData to allow us to stream this value.
          formData = new FormData();
        }
        // The reference to this function came from the same client so we can pass it back.
        const refId = nextPartId++;
        formData.set(formFieldPrefix + refId, referenceClosureJSON);
        return serializeServerReferenceID(refId);
      }
      if (temporaryReferences !== undefined && key.indexOf(':') === -1) {
        // TODO: If the property name contains a colon, we don't dedupe. Escape instead.
        const parentReference = writtenObjects.get(parent);
        if (parentReference !== undefined) {
          // If the parent has a reference, we can refer to this object indirectly
          // through the property name inside that parent.
          const reference = parentReference + ':' + key;
          // Store this object so that the server can refer to it later in responses.
          writeTemporaryReference(temporaryReferences, reference, value);
          return serializeTemporaryReferenceMarker();
        }
      }
      throw new Error('Client Functions cannot be passed directly to Server Functions. ' + 'Only Functions passed from the Server can be passed back again.');
    }
    if (typeof value === 'symbol') {
      if (temporaryReferences !== undefined && key.indexOf(':') === -1) {
        // TODO: If the property name contains a colon, we don't dedupe. Escape instead.
        const parentReference = writtenObjects.get(parent);
        if (parentReference !== undefined) {
          // If the parent has a reference, we can refer to this object indirectly
          // through the property name inside that parent.
          const reference = parentReference + ':' + key;
          // Store this object so that the server can refer to it later in responses.
          writeTemporaryReference(temporaryReferences, reference, value);
          return serializeTemporaryReferenceMarker();
        }
      }
      throw new Error('Symbols cannot be passed to a Server Function without a ' + 'temporary reference set. Pass a TemporaryReferenceSet to the options.' + (''));
    }
    if (typeof value === 'bigint') {
      return serializeBigInt(value);
    }
    throw new Error("Type " + typeof value + " is not supported as an argument to a Server Function.");
  }
  function serializeModel(model, id) {
    if (typeof model === 'object' && model !== null) {
      const reference = serializeByValueID(id);
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
  const json = serializeModel(root, 0);
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
function registerBoundServerReference(reference, id, bound, encodeFormAction) {
  if (knownServerReferences.has(reference)) {
    return;
  }
  knownServerReferences.set(reference, {
    id,
    originalBind: reference.bind,
    bound
  });
}
function registerServerReference(reference, id, encodeFormAction) {
  registerBoundServerReference(reference, id, null);
  return reference;
}
function createBoundServerReference(metaData, callServer, encodeFormAction, findSourceMapURL // DEV-only
) {
  const id = metaData.id;
  const bound = metaData.bound;
  const action = function () {
    // $FlowFixMe[method-unbinding]
    const args = Array.prototype.slice.call(arguments);
    const p = bound;
    if (!p) {
      return callServer(id, args);
    }
    if (p.status === 'fulfilled') {
      const boundArgs = p.value;
      return callServer(id, boundArgs.concat(args));
    }
    // Since this is a fake Promise whose .then doesn't chain, we have to wrap it.
    // TODO: Remove the wrapper once that's fixed.
    return Promise.resolve(p).then(function (boundArgs) {
      return callServer(id, boundArgs.concat(args));
    });
  };
  registerBoundServerReference(action, id, bound);
  return action;
}
function createServerReference(id, callServer, encodeFormAction, findSourceMapURL,
// DEV-only
functionName) {
  const action = function () {
    // $FlowFixMe[method-unbinding]
    const args = Array.prototype.slice.call(arguments);
    return callServer(id, args);
  };
  registerBoundServerReference(action, id, null);
  return action;
}

const ROW_ID = 0;
const ROW_TAG = 1;
const ROW_LENGTH = 2;
const ROW_CHUNK_BY_NEWLINE = 3;
const ROW_CHUNK_BY_LENGTH = 4;
const PENDING = 'pending';
const BLOCKED = 'blocked';
const RESOLVED_MODEL = 'resolved_model';
const RESOLVED_MODULE = 'resolved_module';
const INITIALIZED = 'fulfilled';
const ERRORED = 'rejected';

// $FlowFixMe[missing-this-annot]
function ReactPromise(status, value, reason, response) {
  this.status = status;
  this.value = value;
  this.reason = reason;
  this._response = response;
}
// We subclass Promise.prototype so that we get other methods like .catch
ReactPromise.prototype = Object.create(Promise.prototype);
// TODO: This doesn't return a new Promise chain unlike the real .then
ReactPromise.prototype.then = function (resolve, reject) {
  const chunk = this;
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
  const chunk = getChunk(response, 0);
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
  for (let i = 0; i < listeners.length; i++) {
    const listener = listeners[i];
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
        for (let i = 0; i < resolveListeners.length; i++) {
          chunk.value.push(resolveListeners[i]);
        }
      } else {
        chunk.value = resolveListeners;
      }
      if (chunk.reason) {
        if (rejectListeners) {
          for (let i = 0; i < rejectListeners.length; i++) {
            chunk.reason.push(rejectListeners[i]);
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
    const streamChunk = chunk;
    const controller = streamChunk.reason;
    // $FlowFixMe[incompatible-call]: The error method should accept mixed.
    controller.error(error);
    return;
  }
  const listeners = chunk.reason;
  const erroredChunk = chunk;
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
  const iteratorResultJSON = (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + '}';
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new ReactPromise(RESOLVED_MODEL, iteratorResultJSON, null, response);
}
function resolveIteratorResultChunk(chunk, value, done) {
  // To reuse code as much code as possible we add the wrapper element as part of the JSON.
  const iteratorResultJSON = (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + '}';
  resolveModelChunk(chunk, iteratorResultJSON);
}
function resolveModelChunk(chunk, value) {
  if (chunk.status !== PENDING) {
    // If we get more data to an already resolved ID, we assume that it's
    // a stream chunk since any other row shouldn't have more than one entry.
    const streamChunk = chunk;
    const controller = streamChunk.reason;
    controller.enqueueModel(value);
    return;
  }
  const resolveListeners = chunk.value;
  const rejectListeners = chunk.reason;
  const resolvedChunk = chunk;
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
  const resolveListeners = chunk.value;
  const rejectListeners = chunk.reason;
  const resolvedChunk = chunk;
  resolvedChunk.status = RESOLVED_MODULE;
  resolvedChunk.value = value;
  if (resolveListeners !== null) {
    initializeModuleChunk(resolvedChunk);
    wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners);
  }
}
let initializingHandler = null;
function initializeModelChunk(chunk) {
  const prevHandler = initializingHandler;
  initializingHandler = null;
  const resolvedModel = chunk.value;

  // We go to the BLOCKED state until we've fully resolved this.
  // We do this before parsing in case we try to initialize the same chunk
  // while parsing the model. Such as in a cyclic reference.
  const cyclicChunk = chunk;
  cyclicChunk.status = BLOCKED;
  cyclicChunk.value = null;
  cyclicChunk.reason = null;
  try {
    const value = parseModel(chunk._response, resolvedModel);
    // Invoke any listeners added while resolving this model. I.e. cyclic
    // references. This may or may not fully resolve the model depending on
    // if they were blocked.
    const resolveListeners = cyclicChunk.value;
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
    const initializedChunk = chunk;
    initializedChunk.status = INITIALIZED;
    initializedChunk.value = value;
  } catch (error) {
    const erroredChunk = chunk;
    erroredChunk.status = ERRORED;
    erroredChunk.reason = error;
  } finally {
    initializingHandler = prevHandler;
  }
}
function initializeModuleChunk(chunk) {
  try {
    const value = requireModule(chunk.value);
    const initializedChunk = chunk;
    initializedChunk.status = INITIALIZED;
    initializedChunk.value = value;
  } catch (error) {
    const erroredChunk = chunk;
    erroredChunk.status = ERRORED;
    erroredChunk.reason = error;
  }
}

// Report that any missing chunks in the model is now going to throw this
// error upon read. Also notify any pending promises.
function reportGlobalError(response, error) {
  response._closed = true;
  response._closedReason = error;
  response._chunks.forEach(chunk => {
    // If this chunk was already resolved or errored, it won't
    // trigger an error but if it wasn't then we need to
    // because we won't be getting any new data to resolve it.
    if (chunk.status === PENDING) {
      triggerErrorOnChunk(chunk, error);
    }
  });
}
function createElement(response, type, key, props, owner,
// DEV-only
stack,
// DEV-only
validated // DEV-only
) {
  let element;
  {
    element = {
      // This tag allows us to uniquely identify this as a React Element
      $$typeof: REACT_ELEMENT_TYPE,
      type,
      key,
      ref: null,
      props
    };
  }
  if (initializingHandler !== null) {
    const handler = initializingHandler;
    // We pop the stack to the previous outer handler before leaving the Element.
    // This is effectively the complete phase.
    initializingHandler = handler.parent;
    if (handler.errored) {
      // Something errored inside this Element's props. We can turn this Element
      // into a Lazy so that we can still render up until that Lazy is rendered.
      const erroredChunk = createErrorChunk(response, handler.value);
      return createLazyChunkWrapper(erroredChunk);
    }
    if (handler.deps > 0) {
      // We have blocked references inside this Element but we can turn this into
      // a Lazy node referencing this Element to let everything around it proceed.
      const blockedChunk = createBlockedChunk(response);
      handler.value = element;
      handler.chunk = blockedChunk;
      return createLazyChunkWrapper(blockedChunk);
    }
  }
  return element;
}
function createLazyChunkWrapper(chunk) {
  const lazyType = {
    $$typeof: REACT_LAZY_TYPE,
    _payload: chunk,
    _init: readChunk
  };
  return lazyType;
}
function getChunk(response, id) {
  const chunks = response._chunks;
  let chunk = chunks.get(id);
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
  let handler;
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
    for (let i = 1; i < path.length; i++) {
      while (value.$$typeof === REACT_LAZY_TYPE) {
        // We never expect to see a Lazy node on this path because we encode those as
        // separate models. This must mean that we have inserted an extra lazy node
        // e.g. to replace a blocked element. We must instead look for it inside.
        const chunk = value._payload;
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
    const mappedValue = map(response, value, parentObject, key);
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
      const element = handler.value;
      switch (key) {
        case '3':
          element.props = mappedValue;
          break;
      }
    }
    handler.deps--;
    if (handler.deps === 0) {
      const chunk = handler.chunk;
      if (chunk === null || chunk.status !== BLOCKED) {
        return;
      }
      const resolveListeners = chunk.value;
      const initializedChunk = chunk;
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
    handler.errored = true;
    handler.value = error;
    const chunk = handler.chunk;
    if (chunk === null || chunk.status !== BLOCKED) {
      return;
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
    return createBoundServerReference(metaData, response._callServer);
  }
  // If we have a module mapping we can load the real version of this Server Reference.
  const serverReference = resolveServerReference(response._serverReferenceConfig, metaData.id);
  let promise = preloadModule(serverReference);
  if (!promise) {
    if (!metaData.bound) {
      const resolvedValue = requireModule(serverReference);
      registerBoundServerReference(resolvedValue, metaData.id, metaData.bound);
      return resolvedValue;
    } else {
      promise = Promise.resolve(metaData.bound);
    }
  } else if (metaData.bound) {
    promise = Promise.all([promise, metaData.bound]);
  }
  let handler;
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
    let resolvedValue = requireModule(serverReference);
    if (metaData.bound) {
      // This promise is coming from us and should have initilialized by now.
      const boundArgs = metaData.bound.value.slice(0);
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
      const element = handler.value;
      switch (key) {
        case '3':
          element.props = resolvedValue;
          break;
      }
    }
    handler.deps--;
    if (handler.deps === 0) {
      const chunk = handler.chunk;
      if (chunk === null || chunk.status !== BLOCKED) {
        return;
      }
      const resolveListeners = chunk.value;
      const initializedChunk = chunk;
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
    handler.errored = true;
    handler.value = error;
    const chunk = handler.chunk;
    if (chunk === null || chunk.status !== BLOCKED) {
      return;
    }
    triggerErrorOnChunk(chunk, error);
  }
  promise.then(fulfill, reject);

  // Return a place holder value for now.
  return null;
}
function getOutlinedModel(response, reference, parentObject, key, map) {
  const path = reference.split(':');
  const id = parseInt(path[0], 16);
  const chunk = getChunk(response, id);
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
      let value = chunk.value;
      for (let i = 1; i < path.length; i++) {
        while (value.$$typeof === REACT_LAZY_TYPE) {
          const referencedChunk = value._payload;
          if (referencedChunk.status === INITIALIZED) {
            value = referencedChunk.value;
          } else {
            return waitForReference(referencedChunk, parentObject, key, response, map, path.slice(i - 1));
          }
        }
        value = value[path[i]];
      }
      const chunkValue = map(response, value, parentObject, key);
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
  const formData = new FormData();
  for (let i = 0; i < model.length; i++) {
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
          const id = parseInt(value.slice(2), 16);
          const chunk = getChunk(response, id);
          // We create a React.lazy wrapper around any lazy values.
          // When passed into React, we'll know how to suspend on this.
          return createLazyChunkWrapper(chunk);
        }
      case '@':
        {
          // Promise
          if (value.length === 2) {
            // Infinite promise that never resolves.
            return new Promise(() => {});
          }
          const id = parseInt(value.slice(2), 16);
          const chunk = getChunk(response, id);
          return chunk;
        }
      case 'S':
        {
          // Symbol
          return Symbol.for(value.slice(2));
        }
      case 'F':
        {
          // Server Reference
          const ref = value.slice(2);
          return getOutlinedModel(response, ref, parentObject, key, loadServerReference);
        }
      case 'T':
        {
          // Temporary Reference
          const reference = '$' + value.slice(2);
          const temporaryReferences = response._tempRefs;
          if (temporaryReferences == null) {
            throw new Error('Missing a temporary reference set but the RSC response returned a temporary reference. ' + 'Pass a temporaryReference option with the set that was used with the reply.');
          }
          return readTemporaryReference(temporaryReferences, reference);
        }
      case 'Q':
        {
          // Map
          const ref = value.slice(2);
          return getOutlinedModel(response, ref, parentObject, key, createMap);
        }
      case 'W':
        {
          // Set
          const ref = value.slice(2);
          return getOutlinedModel(response, ref, parentObject, key, createSet);
        }
      case 'B':
        {
          // Blob
          const ref = value.slice(2);
          return getOutlinedModel(response, ref, parentObject, key, createBlob);
        }
      case 'K':
        {
          // FormData
          const ref = value.slice(2);
          return getOutlinedModel(response, ref, parentObject, key, createFormData);
        }
      case 'Z':
        {
          // Error
          {
            return resolveErrorProd();
          }
        }
      case 'i':
        {
          // Iterator
          const ref = value.slice(2);
          return getOutlinedModel(response, ref, parentObject, key, extractIterator);
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
      case 'Y':
      default:
        {
          // We assume that anything else is a reference ID.
          const ref = value.slice(1);
          return getOutlinedModel(response, ref, parentObject, key, createModel);
        }
    }
  }
  return value;
}
function parseModelTuple(response, value) {
  const tuple = value;
  if (tuple[0] === REACT_ELEMENT_TYPE) {
    // TODO: Consider having React just directly accept these arrays as elements.
    // Or even change the ReactElement type to be an array.
    return createElement(response, tuple[1], tuple[2], tuple[3]);
  }
  return value;
}
function missingCall() {
  throw new Error('Trying to call a function from "use server" but the callServer option ' + 'was not implemented in your router runtime.');
}
function ResponseInstance(bundlerConfig, serverReferenceConfig, moduleLoading, callServer, encodeFormAction, nonce, temporaryReferences, findSourceMapURL, replayConsole, environmentName) {
  const chunks = new Map();
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
  // Don't inline this call because it causes closure to outline the call above.
  this._fromJSON = createFromJSONCallback(this);
}
function createResponse(bundlerConfig, serverReferenceConfig, moduleLoading, callServer, encodeFormAction, nonce, temporaryReferences, findSourceMapURL, replayConsole, environmentName) {
  // $FlowFixMe[invalid-constructor]: the shapes are exact here but Flow doesn't like constructors
  return new ResponseInstance(bundlerConfig, serverReferenceConfig, moduleLoading, callServer, encodeFormAction, nonce, temporaryReferences);
}
function resolveModel(response, id, model) {
  const chunks = response._chunks;
  const chunk = chunks.get(id);
  if (!chunk) {
    chunks.set(id, createResolvedModelChunk(response, model));
  } else {
    resolveModelChunk(chunk, model);
  }
}
function resolveText(response, id, text) {
  const chunks = response._chunks;
  const chunk = chunks.get(id);
  if (chunk && chunk.status !== PENDING) {
    // If we get more data to an already resolved ID, we assume that it's
    // a stream chunk since any other row shouldn't have more than one entry.
    const streamChunk = chunk;
    const controller = streamChunk.reason;
    controller.enqueueValue(text);
    return;
  }
  chunks.set(id, createInitializedTextChunk(response, text));
}
function resolveBuffer(response, id, buffer) {
  const chunks = response._chunks;
  const chunk = chunks.get(id);
  if (chunk && chunk.status !== PENDING) {
    // If we get more data to an already resolved ID, we assume that it's
    // a stream chunk since any other row shouldn't have more than one entry.
    const streamChunk = chunk;
    const controller = streamChunk.reason;
    controller.enqueueValue(buffer);
    return;
  }
  chunks.set(id, createInitializedBufferChunk(response, buffer));
}
function resolveModule(response, id, model) {
  const chunks = response._chunks;
  const chunk = chunks.get(id);
  const clientReferenceMetadata = parseModel(response, model);
  const clientReference = resolveClientReference(response._bundlerConfig, clientReferenceMetadata);

  // TODO: Add an option to encode modules that are lazy loaded.
  // For now we preload all modules as early as possible since it's likely
  // that we'll need them.
  const promise = preloadModule(clientReference);
  if (promise) {
    let blockedChunk;
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
    promise.then(() => resolveModuleChunk(blockedChunk, clientReference), error => triggerErrorOnChunk(blockedChunk, error));
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
  const chunks = response._chunks;
  const chunk = chunks.get(id);
  if (!chunk) {
    chunks.set(id, createInitializedStreamChunk(response, stream, controller));
    return;
  }
  if (chunk.status !== PENDING) {
    // We already resolved. We didn't expect to see this.
    return;
  }
  const resolveListeners = chunk.value;
  const resolvedChunk = chunk;
  resolvedChunk.status = INITIALIZED;
  resolvedChunk.value = stream;
  resolvedChunk.reason = controller;
  if (resolveListeners !== null) {
    wakeChunk(resolveListeners, chunk.value);
  }
}
function startReadableStream(response, id, type) {
  let controller = null;
  const stream = new ReadableStream({
    type: type,
    start(c) {
      controller = c;
    }
  });
  let previousBlockedChunk = null;
  const flightController = {
    enqueueValue(value) {
      if (previousBlockedChunk === null) {
        controller.enqueue(value);
      } else {
        // We're still waiting on a previous chunk so we can't enqueue quite yet.
        previousBlockedChunk.then(function () {
          controller.enqueue(value);
        });
      }
    },
    enqueueModel(json) {
      if (previousBlockedChunk === null) {
        // If we're not blocked on any other chunks, we can try to eagerly initialize
        // this as a fast-path to avoid awaiting them.
        const chunk = createResolvedModelChunk(response, json);
        initializeModelChunk(chunk);
        const initializedChunk = chunk;
        if (initializedChunk.status === INITIALIZED) {
          controller.enqueue(initializedChunk.value);
        } else {
          chunk.then(v => controller.enqueue(v), e => controller.error(e));
          previousBlockedChunk = chunk;
        }
      } else {
        // We're still waiting on a previous chunk so we can't enqueue quite yet.
        const blockedChunk = previousBlockedChunk;
        const chunk = createPendingChunk(response);
        chunk.then(v => controller.enqueue(v), e => controller.error(e));
        previousBlockedChunk = chunk;
        blockedChunk.then(function () {
          if (previousBlockedChunk === chunk) {
            // We were still the last chunk so we can now clear the queue and return
            // to synchronous emitting.
            previousBlockedChunk = null;
          }
          resolveModelChunk(chunk, json);
        });
      }
    },
    close(json) {
      if (previousBlockedChunk === null) {
        controller.close();
      } else {
        const blockedChunk = previousBlockedChunk;
        // We shouldn't get any more enqueues after this so we can set it back to null.
        previousBlockedChunk = null;
        blockedChunk.then(() => controller.close());
      }
    },
    error(error) {
      if (previousBlockedChunk === null) {
        // $FlowFixMe[incompatible-call]
        controller.error(error);
      } else {
        const blockedChunk = previousBlockedChunk;
        // We shouldn't get any more enqueues after this so we can set it back to null.
        previousBlockedChunk = null;
        blockedChunk.then(() => controller.error(error));
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
  const iterator = {
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
  const buffer = [];
  let closed = false;
  let nextWriteIndex = 0;
  const flightController = {
    enqueueValue(value) {
      if (nextWriteIndex === buffer.length) {
        buffer[nextWriteIndex] = createInitializedIteratorResultChunk(response, value, false);
      } else {
        const chunk = buffer[nextWriteIndex];
        const resolveListeners = chunk.value;
        const rejectListeners = chunk.reason;
        const initializedChunk = chunk;
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
    enqueueModel(value) {
      if (nextWriteIndex === buffer.length) {
        buffer[nextWriteIndex] = createResolvedIteratorResultChunk(response, value, false);
      } else {
        resolveIteratorResultChunk(buffer[nextWriteIndex], value, false);
      }
      nextWriteIndex++;
    },
    close(value) {
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
    error(error) {
      closed = true;
      if (nextWriteIndex === buffer.length) {
        buffer[nextWriteIndex] = createPendingChunk(response);
      }
      while (nextWriteIndex < buffer.length) {
        triggerErrorOnChunk(buffer[nextWriteIndex++], error);
      }
    }
  };
  const iterable = {
    [ASYNC_ITERATOR]() {
      let nextReadIndex = 0;
      return createIterator(arg => {
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
    }
  };
  // TODO: If it's a single shot iterator we can optimize memory by cleaning up the buffer after
  // reading through the end, but currently we favor code size over this optimization.
  resolveStream(response, id, iterator ? iterable[ASYNC_ITERATOR]() : iterable, flightController);
}
function stopStream(response, id, row) {
  const chunks = response._chunks;
  const chunk = chunks.get(id);
  if (!chunk || chunk.status !== INITIALIZED) {
    // We didn't expect not to have an existing stream;
    return;
  }
  const streamChunk = chunk;
  const controller = streamChunk.reason;
  controller.close(row === '' ? '"$undefined"' : row);
}
function resolveErrorProd(response) {
  const error = new Error('An error occurred in the Server Components render. The specific message is omitted in production' + ' builds to avoid leaking sensitive details. A digest property is included on this error instance which' + ' may provide additional details about the nature of the error.');
  error.stack = 'Error: ' + error.message;
  return error;
}
function resolvePostponeProd(response, id) {
  const error = new Error('A Server Component was postponed. The reason is omitted in production' + ' builds to avoid leaking sensitive details.');
  const postponeInstance = error;
  postponeInstance.$$typeof = REACT_POSTPONE_TYPE;
  postponeInstance.stack = 'Error: ' + error.message;
  const chunks = response._chunks;
  const chunk = chunks.get(id);
  if (!chunk) {
    chunks.set(id, createErrorChunk(response, postponeInstance));
  } else {
    triggerErrorOnChunk(chunk, postponeInstance);
  }
}
function resolveHint(response, code, model) {
  const hintModel = parseModel(response, model);
  dispatchHint(code, hintModel);
}
function mergeBuffer(buffer, lastChunk) {
  const l = buffer.length;
  // Count the bytes we'll need
  let byteLength = lastChunk.length;
  for (let i = 0; i < l; i++) {
    byteLength += buffer[i].byteLength;
  }
  // Allocate enough contiguous space
  const result = new Uint8Array(byteLength);
  let offset = 0;
  // Copy all the buffers into it.
  for (let i = 0; i < l; i++) {
    const chunk = buffer[i];
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
  const chunk = buffer.length === 0 && lastChunk.byteOffset % bytesPerElement === 0 ? lastChunk : mergeBuffer(buffer, lastChunk);
  // TODO: The transfer protocol of RSC is little-endian. If the client isn't little-endian
  // we should convert it instead. In practice big endian isn't really Web compatible so it's
  // somewhat safe to assume that browsers aren't going to run it, but maybe there's some SSR
  // server that's affected.
  const view = new constructor(chunk.buffer, chunk.byteOffset, chunk.byteLength / bytesPerElement);
  resolveBuffer(response, id, view);
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
  const stringDecoder = response._stringDecoder;
  let row = '';
  for (let i = 0; i < buffer.length; i++) {
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
        const code = row[0];
        resolveHint(response, code, row.slice(1));
        return;
      }
    case 69 /* "E" */:
      {
        const errorInfo = JSON.parse(row);
        let error;
        {
          error = resolveErrorProd();
        }
        error.digest = errorInfo.digest;
        const errorWithDigest = error;
        const chunks = response._chunks;
        const chunk = chunks.get(id);
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
    case 68 /* "D" */:
    case 87 /* "W" */:
      {
        throw new Error('Failed to read a RSC payload created by a development version of React ' + 'on the server while using a production version on the client. Always use ' + 'matching versions on the server and the client.');
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
            resolvePostponeProd(response, id);
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
  let i = 0;
  let rowState = response._rowState;
  let rowID = response._rowID;
  let rowTag = response._rowTag;
  let rowLength = response._rowLength;
  const buffer = response._buffer;
  const chunkLength = chunk.length;
  while (i < chunkLength) {
    let lastIdx = -1;
    switch (rowState) {
      case ROW_ID:
        {
          const byte = chunk[i++];
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
          const resolvedRowTag = chunk[i];
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
          const byte = chunk[i++];
          if (byte === 44 /* "," */) {
            // Finished the rowLength, next we'll buffer up to that length.
            rowState = ROW_CHUNK_BY_LENGTH;
          } else {
            rowLength = rowLength << 4 | (byte > 96 ? byte - 87 : byte - 48);
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
    const offset = chunk.byteOffset + i;
    if (lastIdx > -1) {
      // We found the last chunk of the row
      const length = lastIdx - i;
      const lastChunk = new Uint8Array(chunk.buffer, offset, length);
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
      const length = chunk.byteLength - i;
      const remainingSlice = new Uint8Array(chunk.buffer, offset, length);
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

function createResponseFromOptions(options) {
  return createResponse(options && options.moduleBaseURL ? options.moduleBaseURL : '', null, null, options && options.callServer ? options.callServer : undefined, undefined,
  // encodeFormAction
  undefined,
  // nonce
  options && options.temporaryReferences ? options.temporaryReferences : undefined);
}
function startReadingFromStream(response, stream) {
  const reader = stream.getReader();
  function progress(_ref) {
    const done = _ref.done,
      value = _ref.value;
    if (done) {
      close(response);
      return;
    }
    const buffer = value;
    processBinaryChunk(response, buffer);
    return reader.read().then(progress).catch(error);
  }
  function error(e) {
    reportGlobalError(response, e);
  }
  reader.read().then(progress).catch(error);
}
function createFromReadableStream(stream, options) {
  const response = createResponseFromOptions(options);
  startReadingFromStream(response, stream);
  return getRoot(response);
}
function createFromFetch(promiseForResponse, options) {
  const response = createResponseFromOptions(options);
  promiseForResponse.then(function (r) {
    startReadingFromStream(response, r.body);
  }, function (e) {
    reportGlobalError(response, e);
  });
  return getRoot(response);
}
function encodeReply(value, options) /* We don't use URLSearchParams yet but maybe */{
  return new Promise((resolve, reject) => {
    const abort = processReply(value, '', options && options.temporaryReferences ? options.temporaryReferences : undefined, resolve, reject);
    if (options && options.signal) {
      const signal = options.signal;
      if (signal.aborted) {
        abort(signal.reason);
      } else {
        const listener = () => {
          abort(signal.reason);
          signal.removeEventListener('abort', listener);
        };
        signal.addEventListener('abort', listener);
      }
    }
  });
}

export { createFromFetch, createFromReadableStream, createServerReference, createTemporaryReferenceSet, encodeReply, registerServerReference };
