(() => {
  'use strict';

  const { identityFor, readDetails, writeDetails, hasDetails, sameDetails } = window.PhotoStoryStore;
  const format = 'university-memories-stories';
  const maxFileSize = 5 * 1024 * 1024;

  function parseBackup(text) {
    let data;
    try {
      data = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch {
      throw new Error('无法读取这份文件，请选择相册导出的 JSON 备份。');
    }
    if (data?.format !== format || data.version !== 1 || !Array.isArray(data.stories)) {
      throw new Error('这份文件的格式或版本与本相册不兼容。');
    }

    const stories = new Map();
    for (const entry of data.stories) {
      const { photo, title, place, story } = entry ?? {};
      if (typeof photo !== 'string' || !photo || photo.length > 255 || stories.has(photo)
        || typeof title !== 'string' || title.length > 80
        || typeof place !== 'string' || place.length > 100
        || typeof story !== 'string' || story.length > 3000) {
        throw new Error('备份中有无效或重复的照片记录，无法恢复。');
      }
      const details = { title, place, story };
      if (!hasDetails(details)) throw new Error('备份中包含空故事记录，无法恢复。');
      stories.set(photo, details);
    }
    return stories;
  }

  class StoryBackup {
    constructor(photos, onRestore) {
      this.photos = photos;
      this.onRestore = onRestore;
      this.dialog = document.querySelector('#story-backup');
      const button = id => document.querySelector(id);
      this.exportButton = button('#export-stories');
      this.fileInput = button('#story-backup-file');
      this.preview = button('#story-restore-preview');
      this.summary = button('#story-restore-summary');
      this.conflicts = button('#story-restore-conflicts');
      this.keep = this.conflicts.querySelector('[value="keep"]');
      this.replace = this.conflicts.querySelector('[value="replace"]');
      this.confirm = button('#confirm-story-restore');
      this.status = button('#story-backup-status');
      this.readRequest = 0;

      button('#open-story-backup').addEventListener('click', () => this.open());
      button('#close-story-backup').addEventListener('click', () => this.dialog.close());
      button('#pick-story-backup').addEventListener('click', () => this.fileInput.click());
      this.dialog.addEventListener('close', () => { this.readRequest++; });
      this.exportButton.addEventListener('click', () => this.export());
      this.fileInput.addEventListener('change', () => {
        const file = this.fileInput.files[0];
        this.fileInput.value = '';
        if (file) this.readFile(file);
      });
      this.conflicts.addEventListener('change', () => this.renderPreview());
      this.confirm.addEventListener('click', () => this.restore());
    }

    get isOpen() {
      return this.dialog.open;
    }

    open() {
      this.clearPreview();
      this.refreshExportState();
      this.dialog.showModal();
    }

    clearPreview() {
      this.incoming = null;
      this.plan = null;
      this.keep.checked = true;
      this.preview.hidden = true;
      this.status.textContent = '';
    }

    savedStories() {
      const stories = [];
      for (const photo of new Set(this.photos.map(identityFor))) {
        const details = readDetails(photo);
        if (hasDetails(details)) stories.push({ photo, ...details });
      }
      return stories;
    }

    refreshExportState() {
      try {
        const count = this.savedStories().length;
        this.exportButton.disabled = count === 0;
        this.status.textContent = count ? `当前有 ${count} 张照片保存了内容。` : '当前还没有已保存的故事。';
      } catch {
        this.exportButton.disabled = true;
        this.status.textContent = '读取当前浏览器中的故事失败。';
      }
    }

    export() {
      try {
        const stories = this.savedStories();
        if (!stories.length) {
          this.refreshExportState();
          return;
        }
        const now = new Date();
        const backup = { format, version: 1, exportedAt: now.toISOString(), stories };
        const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(part => String(part).padStart(2, '0')).join('-');
        link.download = `这一段路-故事备份-${date}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
        this.status.textContent = `已准备下载 ${stories.length} 张照片的故事。`;
      } catch {
        this.status.textContent = '导出失败，请重试。';
      }
    }

    async readFile(file) {
      const request = ++this.readRequest;
      this.clearPreview();
      if (file.size > maxFileSize) {
        this.status.textContent = '文件超过 5 MB，请选择本相册导出的故事备份。';
        return;
      }
      this.status.textContent = '正在检查备份文件…';
      try {
        const contents = await file.text();
        if (request !== this.readRequest || !this.isOpen) return;
        const incoming = parseBackup(contents);
        const plan = this.makePlan(incoming);
        this.incoming = incoming;
        this.plan = plan;
        this.status.textContent = '';
        this.renderPreview();
      } catch (error) {
        if (request === this.readRequest && this.isOpen) {
          this.status.textContent = error.message;
        }
      }
    }

    makePlan(incoming) {
      const plan = { add: [], conflict: [], identical: 0, missing: 0, current: new Map() };
      const photosByIdentity = new Set(this.photos.map(identityFor));
      for (const [photo, details] of incoming) {
        if (!photosByIdentity.has(photo)) {
          plan.missing++;
          continue;
        }
        let saved;
        try {
          saved = readDetails(photo);
        } catch {
          throw new Error('无法读取当前故事，恢复尚未开始。');
        }
        plan.current.set(photo, saved);
        if (sameDetails(saved, details)) plan.identical++;
        else if (hasDetails(saved)) plan.conflict.push(photo);
        else plan.add.push(photo);
      }
      return plan;
    }

    renderPreview() {
      const { add, conflict, identical, missing } = this.plan;
      const lines = [];
      if (add.length) lines.push(`${add.length} 张可新增`);
      if (conflict.length) lines.push(`${conflict.length} 张与当前故事不同`);
      if (identical) lines.push(`${identical} 张内容相同`);
      if (missing) lines.push(`${missing} 张找不到对应照片，将跳过`);
      this.summary.textContent = lines.length ? lines.join('，') + '。' : '文件里没有可恢复的故事。';
      this.conflicts.hidden = !conflict.length;
      const overwriting = this.replace.checked && conflict.length;
      this.confirm.disabled = !add.length && !overwriting;
      this.confirm.textContent = overwriting ? '覆盖并恢复' : '确认恢复';
      this.preview.hidden = false;
    }

    restore() {
      if (!this.plan || this.confirm.disabled) return;
      let latest;
      try {
        latest = this.makePlan(this.incoming);
      } catch (error) {
        this.status.textContent = error.message;
        return;
      }
      if ([...latest.current].some(([photo, details]) => !sameDetails(details, this.plan.current.get(photo)))) {
        this.plan = latest;
        this.keep.checked = true;
        this.renderPreview();
        this.status.textContent = '当前故事有变化，请重新确认恢复范围。';
        return;
      }
      const replacing = this.replace.checked;
      const targets = replacing ? [...latest.add, ...latest.conflict] : latest.add;
      const restored = new Set();
      let stopped = false;
      for (const photo of targets) {
        try {
          writeDetails(photo, this.incoming.get(photo));
          restored.add(photo);
        } catch {
          stopped = true;
          break;
        }
      }
      this.onRestore(restored);
      this.clearPreview();
      this.refreshExportState();
      const kept = !replacing && latest.conflict.length ? `，保留了 ${latest.conflict.length} 条当前故事` : '';
      const result = `已恢复 ${restored.size} 条${kept}。`;
      this.status.textContent = stopped ? result + ' 浏览器存储写入失败，余下内容未恢复，可重新选择文件重试。' : result;
    }
  }

  window.StoryBackup = StoryBackup;
})();
