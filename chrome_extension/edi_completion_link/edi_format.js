(function(root) {
  'use strict';

  function headerSegment(rawQr) {
    return String(rawQr || '').replace(/[\r\n]/g,'').split('\x1e')
      .find(segment => /^06\x1d6V/.test(segment)) || '';
  }

  function isEdiQr(rawQr) {
    const raw = String(rawQr || '');
    const header = headerSegment(raw);
    return raw.startsWith('[)>') && !!header && /\x1d2L/.test(header) && /\x1d16D/.test(header) && /\x1d10K/.test(header);
  }

  function parseHeaderFields(rawQr) {
    const header = headerSegment(rawQr);
    if (!header) throw Error('EDI変換に必要な見出し情報を取得できません。');
    const prefixes = ['12D','16D','20L','11V','10K','9K','9D','7V','6V','2L','1L'];
    const fields = {};
    for (const token of header.split('\x1d').slice(1)) {
      const prefix = prefixes.find(candidate => token.startsWith(candidate));
      if (prefix) fields[prefix] = token.slice(prefix.length).trim();
    }
    return fields;
  }

  function toKeyboardValue(rawQr) {
    if (!isEdiQr(rawQr)) throw Error('EDI対象外です（QRが [)> で始まっていません）。');
    const fields = parseHeaderFields(rawQr);
    const destination = String(fields['2L'] || '');
    const destinationCompany = destination.slice(0,10).trim();
    const destinationPlant = destination.slice(10,15).trim();
    const values = [
      fields['6V'], fields['11V'], destinationCompany, destinationPlant, fields['1L'],
      fields['16D'], fields['10K'], fields['9D'], fields['20L']
    ].map(value => String(value || '').replace(/:/g,''));
    if (!values[0] || !values[2] || !values[5] || !values[6]) {
      throw Error('EDI変換に必要な企業・納入先・納入指示日・納品書番号が不足しています。');
    }
    return values.join(':');
  }

  const api = { isEdiQr, parseHeaderFields, toKeyboardValue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EdiFormat = api;
})(typeof window === 'undefined' ? globalThis : window);
