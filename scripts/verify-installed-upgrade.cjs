const { _electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const [phase, executablePath, profile] = process.argv.slice(2);
const text = 'アップデート後も保存した文章が残ります。';
(async () => {
  const application = await _electron.launch({ executablePath, args: [`--user-data-dir=${profile}`], timeout: 60000 });
  try {
    const page = await application.firstWindow();
    await page.waitForFunction(async () => (await import('./js/state.js')).projects.length > 0);
    const dataPath = await application.evaluate(({ app }) => app.getPath('userData'));
    assert.equal(path.resolve(dataPath), path.resolve(profile));
    if (phase === 'seed') {
      await page.evaluate(async text => {
        const editor = document.getElementById('editor');
        editor.value = text; editor.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('exportSamplingRate').value = '48000';
        await (await import('./js/settings.js')).persistAppSettings();
        await (await import('./js/persist.js')).persistProjects();
        await window.maita.saveDictionary({ dictionaryWords: [{ word: '移行確認', yomi: 'イコウカクニン', accent: 1 }] });
      }, text);
      console.log('Old version saved project, dictionary and 48kHz setting.');
    } else {
      assert.equal(await page.locator('#editor').inputValue(), text);
      assert.equal(await page.locator('#exportSamplingRate').inputValue(), '48000');
      const dictionary = await page.evaluate(() => window.maita.loadDictionary());
      assert.equal(dictionary.dictionaryWords[0].word, '移行確認');
      assert.equal(dictionary.dictionaryWords.length, 1);
      const resources = await application.evaluate(() => process.resourcesPath);
      const ffmpeg = path.join(resources, 'app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe');
      await fs.access(ffmpeg);
      await fs.access(path.join(resources, 'ffmpeg-notices/ffmpeg.LICENSE'));
      const wav = path.join(profile, 'upgrade-video.wav');
      execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=2', '-y', wav]);
      const bytes = (await fs.readFile(wav)).toString('base64');
      const video = await page.evaluate(async ({ wav, bytes }) => {
        const buffer = Uint8Array.from(atob(bytes), c => c.charCodeAt(0)).buffer;
        return (await import('./js/character-video-host.js')).exportNarrationVideo(buffer, wav);
      }, { wav, bytes });
      const result = execFileSync(ffmpeg, ['-v', 'error', '-i', video, '-f', 'null', '-'], { encoding: 'utf8' });
      assert.equal(result, '');
      assert.ok((await fs.stat(video)).size > 1000);
      const mask = execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${application.process().pid}).ProcessorAffinity.ToInt64()`], { encoding: 'utf8' }).trim();
      assert.ok(BigInt(mask).toString(2).replace(/0/g, '').length <= 4);
      console.log('Upgrade passed: project/dictionary/settings preserved; bundled model + FFmpeg generated a decodable MP4; CPU affinity <= 4.');
    }
  } finally { await application.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
