import {fs} from './promisify';

const fetch = process.type === 'renderer' ?
  window.fetch :
  require('electron-fetch').default;

/**
 * Streams the contents of a URL to a file in the renderer process.
 * This method uses fetch.
 *
 * @param {String} sourceUrl                    The URL to download from
 * @param {String} targetFile                   The destination file path
 * @param {ProgressCallback} [progressCallback] A callback invoked when a chunk is received
 * @param {Number} [length]                     Use to specify the length of the file, otherwise
 *                                              it'll be read from the Content-Length header
 * @returns {Promise}                           A Promise indicating completion
 */
export async function downloadURL(sourceUrl, targetFile, progressCallback, length) {
  const request = new Request(sourceUrl, {
    headers: new Headers({ 'Content-Type': 'application/octet-stream' })
  });

  const response = await fetch(request);
  if (!response.ok) throw new Error(`Unable to download, server returned ${response.status} ${response.statusText}`);

  const body = response.body;
  if (!body) throw new Error('No response body');

  const reader = body.getReader();
  const writer = fs.createWriteStream(targetFile);
  const finalLength = length || parseInt(response.headers.get('Content-Length') || '0', 10);

  await streamWithProgress(reader, writer, finalLength, progressCallback);

  writer.end();
}

/**
 * Reads chunks from an input stream and pipes them to an output stream.
 * Optional support for progress callbacks.
 *
 * @param {ReadableStreamReader} reader         The input stream to read from
 * @param {NodeJS.WritableStream} writer        The output stream to write to
 * @param {String} length                       The length of the content
 * @param {ProgressCallback} [progressCallback] A callback invoked when a chunk is received
 */
async function streamWithProgress(reader, writer, length, progressCallback) {
  let bytesDone = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const chunk = await reader.read();

    if (chunk.done) {
      if (progressCallback) progressCallback(length, 100);
      return;
    }

    writer.write(Buffer.from(chunk.value));

    if (progressCallback) {
      bytesDone += chunk.byteLength;
      const percent = length === 0 ? null : Math.floor(bytesDone / length * 100);
      progressCallback(bytesDone, percent);
    }
  }
}
