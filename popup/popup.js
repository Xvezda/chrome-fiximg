/**
 * Copyright (c) 2020 Xvezda <https://xvezda.com/>
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

function listener(event) {
  switch (event.target.tagName.toLowerCase()) {
    case 'input': {
      let value;
      switch (event.target.type) {
        case 'checkbox':
          value = event.target.checked;
          break;
        default:
          value = event.target.value;
          break;
      }
      chrome.runtime.sendMessage(undefined, {
        type: 'option_updated',
        name: event.target.name,
        data: value,
      });
      break;
    }
    default:
      break;
  }
}


// Options
document.querySelectorAll('#options input').forEach(input => {
  input.addEventListener('change', listener);
  chrome.storage.local.get([input.name], result => {
    if (typeof result[input.name] !== 'undefined') {
      switch (input.type) {
        case 'checkbox':
          input.checked = result[input.name];
          break;
        default:
          input.value = result[input.name];
          break;
      }
    }
  });
});


document.querySelectorAll('[data-i18n]').forEach(item => {
  item.innerText = chrome.i18n.getMessage(item.dataset.i18n);
});


// Load data from manifest
fetch('/manifest.json').then(response => {
  return response.json();
}).then(manifest => {
  document.querySelectorAll('[data-man]').forEach(item => {
    item.innerText = manifest[item.dataset.man] || item.dataset.man;
  });

  // Map each key, value to attributes
  document.querySelectorAll('[data-bind]').forEach(item => {
    let json = JSON.parse(item.dataset.bind);
    Object.keys(json).forEach(key => {

      let value = json[key].split('.');
      let root = value[0];

      switch (root) {
        case 'manifest':
          item.setAttribute(key, manifest[value.pop()]);
          break;
        default:
          item.setAttribute(key, chrome.i18n.getMessage(value.pop()));
          break;
      }
    });
  });
});


function handleToggle({ tokens = [], context = {source: undefined} }) {
  /**
   * toggle command syntax:
   *     toggle <target> value
   * args:
   *     target - selector or predefined constant (starts with `@`) (default: this)
   */
  const target_ = tokens.shift();
  let target;

  switch (target_.slice(0, 1)) {
    case '@':
      switch (target_.slice(1)) {
        case 'this':
          target = this;
        case 'source':
          // fall through
        default:
          target = context.source;
          break;
      }
      break;
    case '.':
    case '#':
      // fall through
    default:
      target = document.querySelector(target_);
      break;
  }

  // Fallback to this
  target = target || this;

  while (tokens.length) {
    target.classList.toggle(tokens.shift());
  }
}


function processFeedback({ feedback, context = {source: undefined} }) {
  // Tokenize
  let tokens = (feedback.match(/(['"])(.*?)[^\\]\1|([^\s]+)/g) || [''])
    .map(token => token.replace(/^['"]|['"]$/g, ''));
  switch (tokens.shift()) {
    case 'toggle':
      handleToggle.bind(this)({
        tokens: tokens,
        context: context
      });
      break;
    default:
      break;
  }
}


document.querySelectorAll('[data-toggle]').forEach(item => {
  item.onclick = event => {
    let target = document.querySelector(item.dataset.toggle);
    let feedback = target.dataset.feedback;

    target.classList.toggle('hide');
    if (typeof feedback !== 'undefined') {
      processFeedback.bind(target)({
        feedback: feedback,
        context: {source: item}
      });
    }
  };
});



