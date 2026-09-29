(function(root) {
  'use strict';

  function isEdiQr(rawQr) {
    return String(rawQr || '').startsWith('[)>');
  }

  function toKeyboardValue(rawQr) {
    if (!isEdiQr(rawQr)) throw Error('EDI対象外です（QRが [)> で始まっていません）。');
    let value = String(rawQr || '').replace(/[\r\n]/g,'');
    value = value.replace(/^\[\)>/,'@>');
    return value.replace(/[\x04\x1d\x1e]/g,'');
  }

  const api = { isEdiQr, toKeyboardValue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EdiFormat = api;
})(typeof window === 'undefined' ? globalThis : window);
