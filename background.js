/**
 * @copyright (c) 2020 Xvezda <https://xvezda.com/>
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

const TOTAL_STRATEGIES = 3;
const MAX_RETRIES = 3;

// Original image url
let originalUrl = {};

let previousDetails = {};

let errorImages = {};
let retryCounter = {};


function captureDetails(details) {
  previousDetails[details.requestId] = details;
}


function checkErrorCode(code) {
  return [400, 403, 404, 500, 502, 503, 504].some(x => code === x);
}


function checkExceeded(value) {
  if (value >= MAX_RETRIES || value >= TOTAL_STRATEGIES) {
    return true;
  }
  return false;
}


function getCount(id) {
  return retryCounter[id];
}


function increaseCounter(id) {
  if (typeof retryCounter[id] === 'undefined') {
    retryCounter[id] = 0;
  } else {
    retryCounter[id] += 1;
  }
}


function removeCache(id) {
  // Remove caches
  delete previousDetails[id];
  delete originalUrl[id];
  delete errorImages[id];
  delete retryCounter[id];
}


setTimeout(function() {
  var garbageCollector = setInterval(function() {
    console.log('collecting garbage...');

    previousDetails = {};
    originalUrl = {};
    errorImages = {};
    retryCounter = {};
  }, 300 * 1000);
}, 300 * 1000);


chrome.webRequest.onBeforeSendHeaders.addListener(details => {
  if (details.type !== 'image') return;
  console.log('onBeforeSendHeaders - before processing:', details);
  if (typeof errorImages[details.requestId] !== 'undefined') {
    const url = new URL(originalUrl[details.requestId]);
    switch (retryCounter[details.requestId]) {
      case 0: {  // First strategy: Same origin
        // Get origin from url
        const origin = url.origin;

        for (let i = 0; i < details.requestHeaders.length; ++i) {
          if (details.requestHeaders[i].name.toLowerCase() === 'referer') {
            details.requestHeaders[i].value = origin;
            captureDetails(details);

            return { requestHeaders: details.requestHeaders };
          }
        }
        // If referer not exists
        // Make one
        details.requestHeaders.push({ name: 'Referer', value: origin });
        captureDetails(details);

        return { requestHeaders: details.requestHeaders };

        break;
      }
      case 1: {  // Second strategy: Request without referer
        for (let i = 0; i < details.requestHeaders.length; ++i) {
          if (details.requestHeaders[i].name.toLowerCase() === 'referer') {
            details.requestHeaders.splice(i, 1);
          }
        }
        return { requestHeaders: details.requestHeaders };
        break;
      }
      default: {  // Last strategy: Change protocol
        break;
        const protocol = url.protocol.slice(0, -1);
        let convProto = 'https';
        if (protocol === 'https') {
          convProto = 'http';
        }
        // Remove referer when downgrade
        if (convProto === 'http') {
          for (let i = 0; i < details.requestHeaders.length; ++i) {
            if (details.requestHeaders[i].name.toLowerCase() === 'referer') {
              details.requestHeaders.splice(i, 1);
            }
          }
        }
        const redirectUrl = `${convProto}://${url.href.slice(url.protocol.length+2)}`;
        console.log('redirecting:', redirectUrl);
        increaseCounter(details.requestId);

        if (checkExceeded(retryCounter[details.requestId])) {
          removeCache(details.requestId);
          // Cancel when max-retries exceeded
          return {
            cancel: true,
          }
        }
        return {
          redirectUrl: redirectUrl,
          requestHeaders: details.requestHeaders,
        };
        break;
      }
    }
  }
}, {
  urls: ["*://*/*"]
}, ['blocking', 'requestHeaders', 'extraHeaders']);


chrome.webRequest.onHeadersReceived.addListener(details => {
  if (details.type !== 'image') return;
  if (!checkErrorCode(details.statusCode)) return;
  console.log('onHeadersReceived:', details);

  // Temporarily store reponse details
  errorImages[details.requestId] = details;

  // Store original url on first request
  if (!getCount(details.requestId)) {
    originalUrl[details.requestId] = details.url;
  }

  increaseCounter(details.requestId);
  captureDetails(details);

  if (checkExceeded(retryCounter[details.requestId])) {
    console.log(`recovering image failed :( -> id: ${details.requestId}`);
    removeCache(details.requestId);
    // Cancel when max-retries exceeded
    return {
      cancel: true,
    }
  }
  return {
    redirectUrl: details.url,  // Retry
  };
}, {
  urls: ["*://*/*"]
}, ['blocking', 'responseHeaders']);


chrome.webRequest.onCompleted.addListener(details => {
  if (!Object.keys(originalUrl).includes(details.requestId)) return;
  if (checkErrorCode(details.statusCode)) return;

  console.log(`purge cache -> id: ${details.requestId}`);
  // Clear caches
  removeCache(details.requestId);
}, {
  urls: ["*://*/*"]
}, ['responseHeaders']);


chrome.webRequest.onErrorOccurred.addListener(details => {
  // Replace blocked image with proxy
  if (details.error === 'net::ERR_CONNECTION_RESET') {
    let code = `
      (function() {
        let proxyUrl = "https://images2-focus-opensocial.googleusercontent.com/gadgets/proxy?container=focus&gadget=a&no_expand=1&resize_h=0&rewriteMime=image%2F*&url=";
        let targetSrc = "${encodeURIComponent(details.url)}";
        let images = document.querySelectorAll("img");
        for (let i = 0; i < images.length; ++i) {
          if (encodeURIComponent(images[i].src) === targetSrc) {
            images[i].src = proxyUrl + targetSrc;
            break;
          }
        }
      })();
    `;
    chrome.tabs.executeScript(details.tabId, { code: code }, result => {});
  }
}, {
  urls: ["*://*/*"]
});
