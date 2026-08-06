'use strict';

const { DOMParser } = require('@xmldom/xmldom');
const { jsonrepair } = require('jsonrepair');
const unzipper = require('unzipper');
const core = require('./pdfPersonalisationCore');

const MAX_DOCUMENT_XML_BYTES = 12 * 1024 * 1024;
const MAX_PARAGRAPHS = 20_000;

function nodeText(node) {
  let output = '';
  for (let child = node && node.firstChild; child; child = child.nextSibling) {
    const name = String(child.localName || child.nodeName || '').replace(/^.*:/, '');
    if (name === 't') output += child.textContent || '';
    else if (name === 'tab') output += '\t';
    else if (name === 'br' || name === 'cr') output += '\n';
    else output += nodeText(child);
  }
  return output;
}

function docxParagraphs(xmlBuffer) {
  const document = new DOMParser({ onError() {} })
    .parseFromString(xmlBuffer.toString('utf8'), 'application/xml');
  const paragraphs = document.getElementsByTagName('w:p');
  if (paragraphs.length > MAX_PARAGRAPHS) {
    throw new core.PdfPersonalisationError(
      'The Word data document contains too many paragraphs.',
      413,
      'PDF_DATA_DOCX_TOO_COMPLEX',
    );
  }
  const lines = [];
  for (let index = 0; index < paragraphs.length; index += 1) {
    const text = nodeText(paragraphs.item(index)).trim();
    if (text) lines.push(text);
  }
  return lines;
}

function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonObject(candidate) {
  try {
    const parsed = JSON.parse(candidate);
    return plainObject(parsed) ? parsed : null;
  } catch (_error) {
    try {
      const repaired = JSON.parse(jsonrepair(candidate));
      return plainObject(repaired) ? repaired : null;
    } catch (_repairError) {
      return null;
    }
  }
}

function scalarValue(raw) {
  const value = String(raw || '').trim().replace(/,$/, '').trim();
  if (!value) return '';
  try { return JSON.parse(value); } catch (_error) {}
  return value.replace(/^(["'])|(["'])$/g, '');
}

function assignPath(target, rawKey, value) {
  const parts = String(rawKey || '')
    .trim()
    .replace(/^(["'])|(["'])$/g, '')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length || parts.some((part) => part === '__proto__' || part === 'prototype' || part === 'constructor')) {
    return false;
  }
  let cursor = target;
  parts.slice(0, -1).forEach((part) => {
    if (!plainObject(cursor[part])) cursor[part] = {};
    cursor = cursor[part];
  });
  cursor[parts[parts.length - 1]] = value;
  return true;
}

function parseKeyValueLines(lines) {
  const data = {};
  let count = 0;
  lines.forEach((line) => {
    const match = String(line).replace(/^\s*[-*•]\s*/, '').match(/^\s*([^:=]{1,160})\s*[:=]\s*(.*?)\s*$/);
    if (!match) return;
    if (assignPath(data, match[1], scalarValue(match[2]))) count += 1;
  });
  return count ? data : null;
}

function parseDocumentText(lines) {
  const raw = lines.join('\n')
    .replace(/^\uFEFF/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  const candidates = [raw];
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(raw.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    const parsed = parseJsonObject(candidate);
    if (parsed) return { data: parsed, format: 'json-text' };
  }
  const keyValues = parseKeyValueLines(lines);
  if (keyValues) return { data: keyValues, format: 'key-value' };
  throw new core.PdfPersonalisationError(
    'No JSON object or key: value data could be found in the Word document.',
    400,
    'PDF_DATA_DOCX_CONTENT_INVALID',
  );
}

async function convertDocxToJson(source) {
  const document = core.normaliseSourceDocument(source);
  if (!/\.docx$/i.test(document.fileName)) {
    throw new core.PdfPersonalisationError(
      'Choose a .docx Word data document.',
      400,
      'PDF_DATA_DOCX_TYPE_INVALID',
    );
  }
  let directory;
  try {
    directory = await unzipper.Open.buffer(document.buffer);
  } catch (_error) {
    throw new core.PdfPersonalisationError(
      'The Word data document could not be opened.',
      400,
      'PDF_DATA_DOCX_INVALID',
    );
  }
  const entry = directory.files.find((file) => file.path === 'word/document.xml');
  if (!entry || Number(entry.uncompressedSize || 0) > MAX_DOCUMENT_XML_BYTES) {
    throw new core.PdfPersonalisationError(
      'The Word data document is invalid or too large to extract.',
      413,
      'PDF_DATA_DOCX_XML_INVALID',
    );
  }
  const xml = await entry.buffer();
  if (xml.length > MAX_DOCUMENT_XML_BYTES) {
    throw new core.PdfPersonalisationError(
      'The Word data document is too large to extract.',
      413,
      'PDF_DATA_DOCX_XML_TOO_LARGE',
    );
  }
  const lines = docxParagraphs(xml);
  if (!lines.length) {
    throw new core.PdfPersonalisationError(
      'The Word data document does not contain readable text.',
      400,
      'PDF_DATA_DOCX_EMPTY',
    );
  }
  const parsed = parseDocumentText(lines);
  return {
    ...parsed,
    sourceName: document.fileName,
    paragraphCount: lines.length,
    fieldCount: Object.keys(parsed.data).length,
  };
}

module.exports = {
  MAX_DOCUMENT_XML_BYTES,
  docxParagraphs,
  parseDocumentText,
  convertDocxToJson,
};
