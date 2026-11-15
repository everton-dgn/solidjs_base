import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'

import { fileKey, iconsOfFile } from '../index.ts'

// The folder as path.resolve writes it on Windows, and the file as the
// watcher of Vite reports it there.
const WINDOWS_FOLDER = path.win32.resolve(String.raw`C:\app`, 'icons')
const WINDOWS_FILE = 'C:/app/icons/star.svg'

describe('iconsOfFile', () => {
  it('finds the icon of a file in a folder written with backslashes', () => {
    const folders = new Map([['own', WINDOWS_FOLDER]])

    assert.deepEqual(iconsOfFile({ folders, file: WINDOWS_FILE }), [
      { collection: 'own', name: 'star' }
    ])
    assert.deepEqual(
      iconsOfFile({
        folders,
        file: path.win32.join(WINDOWS_FOLDER, 'logo.v2.svg')
      }),
      [{ collection: 'own', name: 'logo.v2' }]
    )
  })

  it('finds the icon of a POSIX file', () => {
    const folders = new Map([['own', '/app/my icons']])

    assert.deepEqual(iconsOfFile({ folders, file: '/app/my icons/sun.svg' }), [
      { collection: 'own', name: 'sun' }
    ])
  })

  it('finds the icon in every collection of a shared folder', () => {
    const folders = new Map([
      ['own', '/app/icons'],
      ['other', '/app/other'],
      ['brand', '/app/./icons']
    ])

    assert.deepEqual(iconsOfFile({ folders, file: '/app/icons/sun.svg' }), [
      { collection: 'own', name: 'sun' },
      { collection: 'brand', name: 'sun' }
    ])
  })

  it('ignores the files of other folders and other extensions', () => {
    const folders = new Map([['own', WINDOWS_FOLDER]])

    for (const file of [
      'C:/app/icons/nested/star.svg',
      'C:/app/icons/star.svgz',
      'C:/app/other/star.svg',
      'C:/app/src/App.tsx'
    ]) {
      assert.deepEqual(iconsOfFile({ folders, file }), [], file)
    }
  })
})

describe('fileKey', () => {
  it('writes one key for both separators', () => {
    assert.equal(
      fileKey(path.win32.join(WINDOWS_FOLDER, 'star.svg')),
      fileKey(WINDOWS_FILE)
    )
    assert.equal(fileKey('/app/icons/../icons/star.svg'), '/app/icons/star.svg')
  })
})
