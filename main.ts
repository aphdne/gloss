import { MarkdownView, Plugin, PluginSettingTab, Setting } from 'obsidian';

/*
 * TODO: concatenate glossaries feature
*/

interface Settings {
  autoInsert: boolean;
}

const DEFAULT_SETTINGS: Partial<Settings> = {
  autoInsert: true,
};

export class SettingsTab extends PluginSettingTab {
  plugin: Gloss;

  constructor(app: App, plugin: ExamplePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl).setName("Auto insert").addToggle((toggle) => {
      toggle
        .setValue(this.plugin.settings.autoInsert)
        .onChange(async (value) => {
          this.plugin.settings.autoInsert = value;
          await this.plugin.saveSettings();
        });
    })
  }
}

interface Definition {
  term: string;
  glossary: string;
}

export default class Gloss extends Plugin {
  settings: Settings;
  definitions: Definition[] = [];

	async onload() {
    await this.loadSettings();

    // use onLayoutReady(): https://publish.obsidian.md/liam/Obsidian/API+FAQ/filesystem/getMarkdownFiles+returns+an+empty+array+in+onLoad
    // grab all glossary definitions
    this.app.workspace.onLayoutReady(() => {
      const glossaries = this.app.vault.getMarkdownFiles().filter((tfile) => {
        const fm = this.app.metadataCache.getFileCache(tfile).frontmatter
        if (fm) {
          return fm.tags.contains("glossary");
        }
        return false;
      });

      for (const g of glossaries) {
        this.app.vault.cachedRead(g).then((result: string) => {
          const arr = [...result.matchAll(/(?<=\# )[A-Za-z]+/g)];

          for (let i = 0; i < arr.length; i++) {
            this.definitions.push({
              term: arr[i][0],
              glossary: g.basename
            });
          }
        })
      }
    });

    this.registerEvent(this.app.vault.on('modify', () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);

      if (view && this.settings.autoInsert) {
        const line = view.editor.getCursor().line;
        view.editor.setLine(line, this.insertTerms(view.editor.getLine(line)));
      }
    }));

    this.addCommand({
      id: "destructively-insert-glossary-terms",
      name: "Destructively insert glossary terms",
      editorCallback: (editor: Editor) => {
        for (let i = 0; i < editor.lineCount(); i++) {
          editor.setLine(i, this.insertTerms(editor.getLine(i)));
        }
      },
    });

    this.addSettingTab(new SettingsTab(this.app, this));
	}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  insertTerms(text: string) {
    for (const def of this.definitions) {
      // regex: case-insensitive keyword search, with or without an 's' or 'es' at the end (for plurals)
      const to_be_replaced = [...text.matchAll(new RegExp(`${def.term}e?s?`, "gmi"))].reverse(); // reverse array in order to do plural before singular
      for (const replacee of to_be_replaced) {
        // regex: check if the term is within a markdown link or header, as to not replace terms within links recursively
        text = text.replaceAll(new RegExp(`(?<!\\# )${replacee[0]}(?!\\]|\\||s)`, "gm"), "[[" + def.glossary + ".md#" + def.term + "|" + replacee[0] + "]]");
      }
    }
    return text;
  }
}
