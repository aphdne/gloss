import { MarkdownView, Plugin, PluginSettingTab, Setting } from 'obsidian';

/*
 * TODO: concatenate glossaries feature
 * TODO: autoinsert at different events? i dont want a link to be inserted for C.md when im in the middle of typing C++
 * TODO: work with file aliases
 * BUG: error on unload (?)
 * BUG: links inserted mid-word
 * BUG: glossary links not inserted for terms with more than 1 word
 */

interface Settings {
  autoInsert: boolean;
  autoLink: boolean;
  wordBlacklist: string;
  fileBlacklist: string;
}

const DEFAULT_SETTINGS: Partial<Settings> = {
  autoInsert: true,
  autoLink: false,
  wordBlacklist: "",
  fileBlacklist: "",
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

    new Setting(containerEl)
     .setName("Word blacklist")
     .setDesc("Words here will not replaced with links; case-insensitive")
     .addText((text) => {
        text
         .setPlaceholder("alpha; bravo; charlie; delta; ...")
         .setValue(this.plugin.settings.wordBlacklist)
         .onChange(async (value) => {
           this.plugin.settings.wordBlacklist = value;
           await this.plugin.saveSettings();
         })
    });

    new Setting(containerEl)
     .setName("File blacklist")
     .setDesc("Files here are exempt from auto linking; case-insensitive")
     .addText((text) => {
        text
         .setPlaceholder("alpha; bravo; charlie; delta; ...")
         .setValue(this.plugin.settings.fileBlacklist)
         .onChange(async (value) => {
           this.plugin.settings.fileBlacklist = value;
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
  wordBlacklist: string[] = [];
  fileBlacklist: string[] = [];

	async onload() {
    await this.loadSettings();

    // use onLayoutReady(): https://publish.obsidian.md/liam/Obsidian/API+FAQ/filesystem/getMarkdownFiles+returns+an+empty+array+in+onLoad
    this.registerEvent(this.app.workspace.onLayoutReady(() => this.populateDefinitions()));

    this.registerEvent(this.app.vault.on('modify', (file: TAbstractFile) => {
      if (this.fileBlacklist.contains(file.name.toLowerCase()))
        return;

      const view = this.app.workspace.getActiveViewOfType(MarkdownView);

      if (view) {
        const line = view.editor.getCursor().line;

        if (this.settings.autoInsert) {
          view.editor.setLine(line, this.insertTermLinks(view.editor.getLine(line)));
        }

        if (this.settings.autoLink) {
          view.editor.setLine(line, this.insertNoteLinks(view.editor.getLine(line)));
        }
      }
    }));

    this.addCommand({
      id: "update-glossary-terms",
      name: "Update glossary terms",
      callback: () => {
        this.populateDefinitions();
      },
    });

    this.addCommand({
      id: "destructively-insert-glossary-terms",
      name: "Destructively insert glossary terms",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        if (this.fileBlacklist.contains(view.file.name.toLowerCase())) {
          new Notice("This file is blacklisted");
          return;
        }

        let inCodeblock = false;
        let inFrontmatter = false;
        for (let i = 0; i < editor.lineCount(); i++) {
          let line = editor.getLine(i);

          if (i == 0 && line == "---")
            inFrontmatter = true;

          if (inFrontmatter && line == "---")
            inFrontmatter = false;

          if (line.startsWith("```"))
            inCodeblock = !inCodeblock;

          if (inCodeblock || inFrontmatter)
            continue;

          editor.setLine(i, this.insertTermLinks(line));
        }
      },
    });

    this.addCommand({
      id: "destructively-insert-note-links",
      name: "Destructively insert note links",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        if (this.fileBlacklist.contains(view.file.name.toLowerCase())) {
          new Notice("This file is blacklisted");
          return;
        }

        let inCodeblock = false;
        let inFrontmatter = false;
        for (let i = 0; i < editor.lineCount(); i++) {
          let line = editor.getLine(i);

          if (i == 0 && line == "---")
            inFrontmatter = true;

          if (inFrontmatter && line == "---")
            inFrontmatter = false;

          if (line.startsWith("```"))
            inCodeblock = !inCodeblock;

          if (inCodeblock || inFrontmatter)
            continue;

          editor.setLine(i, this.insertNoteLinks(line));
        }
      },
    });

    this.addSettingTab(new SettingsTab(this.app, this));
	}
s
  onunload() {
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this.wordBlacklist = [];
    this.settings.wordBlacklist.split(";").forEach((a) => this.wordBlacklist.push(a.toLowerCase().trim()));

    this.fileBlacklist = [];
    this.settings.fileBlacklist.split(";").forEach((a) => {
      if (!a.endsWith(".md"))
        a += ".md";
      this.fileBlacklist.push(a.toLowerCase().trim());
    });
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.loadSettings();
  }

  populateDefinitions() {
    this.definitions = [];

    const glossaries = this.app.vault.getMarkdownFiles().filter((tfile) => {
      const fm = this.app.metadataCache.getFileCache(tfile).frontmatter
      if (fm) {
        if (fm.tags) {
          return fm.tags.contains("glossary");
        }
      }
      return false;
    });

    for (const g of glossaries) {
      this.app.vault.cachedRead(g).then((result: string) => {
        const arr = [...result.matchAll(/(?<=\# )[A-Za-z].*/g)];

        for (let i = 0; i < arr.length; i++) {
          this.definitions.push({
            term: arr[i][0],
            glossary: g.basename
          });
        }
      })
    }

    this.definitions.sort((a, b) => { // sort alphabetically
      a.charCodeAt(0) < b.charCodeAt(0);
    });
  }

  insertNoteLinks(text: string) {
    for (const mdf of this.app.vault.getMarkdownFiles().reverse()) {
      text = this.insertLinks(text, mdf.basename, mdf.name);
    }
    return text;
  }

  insertTermLinks(text: string) {
    for (const def of this.definitions.reverse()) {
      text = this.insertLinks(text, def.term, def.glossary + ".md#" + def.term);
    }
    return text;
  }

  insertLinks(text: string, term: string, link: string) {
    // regex: case-insensitive keyword search, with or without an 's' or 'es' at the end (for plurals)
    const replacees = [...text.matchAll(new RegExp(`${this.sanitise(term)}e?s?`, "gmi"))].reverse(); // reverse array in order to do plural before singular
    for (const replacee of replacees) {
      if (this.wordBlacklist.contains(replacee[0].toLowerCase()))
        continue;

      // https://regex101.com/r/Lz2f5T/4
      text = text.replaceAll(new RegExp(`(?<!\\# |\\[\\[|\\||\\#)\\b${this.sanitise(replacee[0])}(?=\\W)(?!\\]|\\||s)`, "gm"), "[[" + link + "|" + replacee[0] + "]]");
    }
    return text;
  }

  sanitise(input: string) {
    return input.replace("+", "\\+")
  }
}
