/**
 * @copyright (c) 2020 Xvezda <https://xvezda.com/>
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

const TOTAL_STRATEGIES = 3;
const MAX_RETRIES = 3;

let errorImages = {};
let retryCounter = {};


function checkExceeded(value) {
  if (value >= MAX_RETRIES || value >= TOTAL_STRATEGIES) {
    return true;
  }
  return false;
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
  delete errorImages[id];
  delete retryCounter[id];
}

chrome.webRequest.onBeforeSendHeaders.addListener(details => {
  if (details.type !== 'image') return;
  console.log('onBeforeSendHeaders - before processing:', details);
  if (typeof errorImages[details.requestId] !== 'undefined') {
    const url = new URL(details.url);
    switch (retryCounter[details.requestId]) {
      case 0: {  // First strategy: Same origin
        // Get origin from url
        const origin = url.origin;

        for (let i = 0; i < details.requestHeaders.length; ++i) {
          if (details.requestHeaders[i].name.toLowerCase() === 'referer') {
            details.requestHeaders[i].value = origin;

            return { requestHeaders: details.requestHeaders };
          }
        }
        // If referer not exists
        // Make one
        details.requestHeaders.push({ name: 'Referer', value: origin });
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
  if (details.type !== 'image' || details.statusCode === 200) return;
  console.log('onHeadersReceived:', details);
  // Temporarily store reponse details
  errorImages[details.requestId] = details;

  increaseCounter(details.requestId);
  if (checkExceeded(retryCounter[details.requestId])) {
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
