// upload(name, bytes, url) sends a file to the upload server. Files over 5 MB are refused before sending.
const MAX_BYTES = 5 * 1024 * 1024;

function checkSize(bytes) {
  if (bytes.length > MAX_BYTES) throw new Error(`file too large: ${bytes.length} bytes`);
}

async function upload(name, bytes, url = 'http://127.0.0.1:4599/upload') {
  checkSize(bytes);
  const res = await fetch(`${url}?name=${encodeURIComponent(name)}`, { method: 'POST', body: bytes });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return (await res.json()).id;
}

module.exports = { upload, checkSize, MAX_BYTES };
