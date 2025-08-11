import { MarkdownView, Plugin, PluginSettingTab, Setting } from 'obsidian';

/*
 * TODO: concatenate glossaries feature
 * BUG: frontmatter text will be modified
 * BUG: codeblock text is modified
 */

interface Settings {
  autoInsert: boolean;
  autoLink: boolean;
}

const DEFAULT_SETTINGS: Partial<Settings> = {
  autoInsert: true,
  autoLink: false,
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

    new Setting(containerEl)
     .setName("Auto insert")
     .setDesc("Automatically link in glossary headers while editing")
     .addToggle((toggle) => {
        toggle
         .setValue(this.plugin.settings.autoInsert)
         .onChange(async (value) => {
           this.plugin.settings.autoInsert = value;
           await this.plugin.saveSettings();
         })
    });

    new Setting(containerEl)
     .setName("Auto link")
     .setDesc("Automatically link in other notes while editing")
     .addToggle((toggle) => {
        toggle
         .setValue(this.plugin.settings.autoLink)
         .onChange(async (value) => {
           this.plugin.settings.autoLink = value;
           await this.plugin.saveSettings();
         })
    });
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
    this.registerEvent(this.app.workspace.onLayoutReady(() => {
      this.populateDefinitions();
    }));

    this.registerEvent(this.app.vault.on('modify', () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);

      if (view) {
        const line = view.editor.getCursor().line;

        if (this.settings.autoInsert) {
          view.editor.setLine(line, this.insertTerms(view.editor.getLine(line)));
        }

        if (this.settings.autoLink) {
          view.editor.setLine(line, this.insertNoteLinks(view.editor.getLine(line)));
        }
      }
    }));

    this.registerMarkdownCodeBlockProcessor("gloss", (src, el, ctx) => {
      console.log(src);
    });

    this.addCommand({
      id: "update-glossary-terms",
      name: "Update glossary terms",
      callback: () => {
        this.definitions = [];
        this.populateDefinitions();
      },
    });

    this.addCommand({
      id: "destructively-insert-glossary-terms",
      name: "Destructively insert glossary terms",
      editorCallback: (editor: Editor) => {
        for (let i = 0; i < editor.lineCount(); i++) {
          editor.setLine(i, this.insertTerms(editor.getLine(i)));
        }
      },
    });

    this.addCommand({
      id: "destructively-insert-note-links",
      name: "Destructively insert note links",
      editorCallback: (editor: Editor) => {
        for (let i = 0; i < editor.lineCount(); i++) {
          editor.setLine(i, this.insertNoteLinks(editor.getLine(i)));
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

  populateDefinitions() {
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

    this.definitions.sort((a, b) => {
      a.charCodeAt(0) > b.charCodeAt(0);
    });
  }

  insertNoteLinks(text: string) {
    for (const mdf of this.app.vault.getMarkdownFiles().reverse()) {
      const to_be_replaced = [...text.matchAll(new RegExp(`${mdf.basename}e?s?`, "gmi"))].reverse(); // reverse array in order to do plural before singular
      for (const replacee of to_be_replaced) {
        text = this.insertLink(text, replacee[0], mdf.name);
      }
    }
    return text;
  }

  insertTerms(text: string) {
    for (const def of this.definitions) {
      // regex: case-insensitive keyword search, with or without an 's' or 'es' at the end (for plurals)
      const to_be_replaced = [...text.matchAll(new RegExp(`${def.term}e?s?`, "gmi"))].reverse(); // reverse array in order to do plural before singular
      for (const replacee of to_be_replaced) {
        text = this.insertLink(text, replacee[0], def.glossary + ".md#" + def.term);
      }
    }
    return text;
  }

  insertLink(text: string, replacee: string, link: string) {
    // https://regex101.com/r/Lz2f5T/1
    return text.replaceAll(new RegExp(`(?<!\\# |\\[\\[|\\||\\#)${replacee}(?!\\]|\\||s)`, "gm"), "[[" + link + "|" + replacee + "]]");
  }
}
