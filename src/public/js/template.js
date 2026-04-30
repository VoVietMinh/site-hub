'use strict';

/**
 * Site-template settings page — handles add/remove for the plugin, option,
 * and page repeaters. Only depends on browser-native APIs.
 *
 * Page rows use indexed names (`pages[N][slug]`) so we re-index every page
 * block before submit; that keeps the parsed array tidy on the server side
 * even when the operator deletes rows from the middle.
 */

(function () {
  var form = document.getElementById('tpl-form');
  if (!form) return;

  // -----------------------------------------------------------------------
  // Add/remove dispatcher (event delegation)
  // -----------------------------------------------------------------------
  form.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;

    var action = btn.getAttribute('data-action');

    if (action === 'remove-row') {
      var row = btn.closest('[data-row]');
      if (row) row.remove();
      reindexPages();
      return;
    }

    if (action === 'add-plugin') {
      var t = document.getElementById('tpl-plugin-row');
      document.getElementById('plugins-list').appendChild(t.content.cloneNode(true));
      return;
    }

    if (action === 'add-option') {
      var to = document.getElementById('tpl-option-row');
      document.getElementById('options-list').appendChild(to.content.cloneNode(true));
      return;
    }

    if (action === 'add-page') {
      var tp = document.getElementById('tpl-page-block');
      document.getElementById('pages-list').appendChild(tp.content.cloneNode(true));
      reindexPages();
      return;
    }
  });

  // -----------------------------------------------------------------------
  // Re-index page blocks: rewrite name="pages[N][field]" so submission stays
  // contiguous regardless of insert/remove order.
  // -----------------------------------------------------------------------
  function reindexPages() {
    var blocks = document.querySelectorAll('#pages-list > .page-block');
    blocks.forEach(function (block, idx) {
      block.setAttribute('data-page-index', idx);
      var num = block.querySelector('[data-page-num]');
      if (num) num.textContent = idx + 1;

      // For freshly cloned blocks, inputs carry data-name and no name yet.
      // For server-rendered blocks they already have name="pages[i][...]".
      ['slug', 'title', 'menuTitle', 'content'].forEach(function (field) {
        var el =
          block.querySelector('[data-name="' + field + '"]') ||
          block.querySelector('[name^="pages["][name$="][' + field + ']"]');
        if (el) {
          el.setAttribute('name', 'pages[' + idx + '][' + field + ']');
          el.removeAttribute('data-name');
        }
      });
    });
  }

  // Initial pass to normalise any server-rendered indices.
  reindexPages();

  // Final safety: re-index right before submit.
  form.addEventListener('submit', reindexPages);
})();
