import plugin from '../plugin.json';
import LanguageRunners from './languageRunners';

const CLICK_RUN_PLUGIN_ID = 'acode.plugin.clickrun';

const languageRunners = new LanguageRunners();

function logInfo(message, error) {
  const text = `[runner] ${message}${error ? `: ${error}` : ''}`;
  try {
    log('info', text);
  } catch (e) {
    console.log(text);
  }
}

class RunnerPlugin {

  async init() {
    try {
      this.destroyed = false;
      languageRunners.init();
      this.initRunner();
    } catch (error) {
      console.error('Error initializing runner plugin:', error);
    }
  }

  initRunner() {
    const runButton = acode.require('runButton');

    if (runButton) {
      this.useRunButton(runButton);
      return;
    }

    logInfo('Click Run is not loaded yet, waiting for it...');

    if (typeof acode.waitForPlugin !== 'function') {
      logInfo('acode.waitForPlugin is unavailable, using the built-in run button');
      this.setupPlayButton();
      return;
    }

    acode.waitForPlugin(CLICK_RUN_PLUGIN_ID)
      .then(() => {
        const api = acode.require('runButton');
        if (api) {
          this.useRunButton(api);
        } else {
          logInfo('Click Run is loaded but has no runButton module, using the built-in run button');
          this.setupPlayButton();
        }
      })
      .catch(() => {
        logInfo('Click Run is not installed, using the built-in run button');
        this.setupPlayButton();
      });
  }

  useRunButton(runButton) {
    if (this.destroyed) return;

    logInfo('registering language runners with Click Run');

    this.runButtonDisposers = [];

    for (const [id, runner] of languageRunners.getAllRunners()) {
      const name = runner.name || runner.description || id;

      this.runButtonDisposers.push(
        runButton.registerFileRunner({
          id: `runner.${id}`,
          name,
          runnable: (context) =>
            context.file?.type === 'editor' && languageRunners.canRunWith(id, context.filename),
          run: (context) => languageRunners.runFile(context.file),
        })
      );
    }
  }

  setupPlayButton() {
    if (this.destroyed) return;

    // Create play button element
    this.$runBtn = document.createElement("span");
    this.$runBtn.className = "icon play_arrow";
    this.$runBtn.setAttribute("action", "run");
    this.$runBtn.onclick = this.run.bind(this);
    this.$runBtn.title = "Run Code";

    // Check and show button for runnable files
    this.onFileChange = this.checkRunnable.bind(this);
    this.checkRunnable();

    // Listen for file switches and renames
    editorManager.on('switch-file', this.onFileChange);
    editorManager.on('rename-file', this.onFileChange);
  }

  checkRunnable() {
    const file = editorManager.activeFile;

    // Remove button if it exists
    if (this.$runBtn.isConnected) {
      this.$runBtn.remove();
    }

    // Check if current file is runnable
    if (file && languageRunners.canRun(file.filename)) {
      const $header = document.querySelector("#root")?.querySelector('header');
      if ($header) {
        // Insert before the last child
        $header.insertBefore(this.$runBtn, $header.lastChild);
      }
    }
  }

  async run() {
    const file = editorManager.activeFile;

    if (file && languageRunners.canRun(file.filename)) {
      await languageRunners.runFile(file);
    }
  }

  async destroy() {
    this.destroyed = true;

    if (this.runButtonDisposers) {
      for (const dispose of this.runButtonDisposers) {
        dispose();
      }
      this.runButtonDisposers = null;
    }

    // Remove play button
    if (this.$runBtn) {
      this.$runBtn.onclick = null;
      this.$runBtn.remove();
    }

    if (this.onFileChange) {
      editorManager.off('switch-file', this.onFileChange);
      editorManager.off('rename-file', this.onFileChange);
      this.onFileChange = null;
    }

    // Cleanup language runners
    languageRunners.destroy();
  }
}

if (window.acode) {
  const acodePlugin = new RunnerPlugin();
  acode.setPluginInit(plugin.id, async (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
    if (!baseUrl.endsWith('/')) {
      baseUrl += '/';
    }
    acodePlugin.baseUrl = baseUrl;
    await acodePlugin.init($page, cacheFile, cacheFileUrl);
  });
  acode.setPluginUnmount(plugin.id, () => {
    acodePlugin.destroy();
  });
}
