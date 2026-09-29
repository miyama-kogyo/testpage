(function(root) {
  'use strict';

  function toKeyboardValue(rawQr) {
    let value = String(rawQr || '').replace(/[\r\n]/g,'');
    value = value.replace(/^\[\)>/,'@>');
    return value.replace(/[\x04\x1d\x1e]/g,'');
  }

  const api = { toKeyboardValue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EdiFormat = api;
})(typeof window === 'undefined' ? globalThis : window);
