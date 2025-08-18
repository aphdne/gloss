import { MarkdownView, Plugin, PluginSettingTab, Setting } from 'obsidian';

/*
 * TODO: concatenate glossaries feature
 * TODO: work with file aliases
 * TODO: support definition "aliases"
 * TODO: deal with definition name conflicts
 * TODO: support undo/redo better (?)
 * TODO: command to remove all glossary links
 * TODO: add feature to specify specific words to be replaced (fixed by aliases)
 *  - i.e. "class" -> "[[Class Types|class]]"
 * TODO: use wikilinks optional
 * BUG: error on unload (?)
 */

interface Settings {
  autoInsert: boolean;
  autoLink: boolean;
  wordBlacklist: string;
  fileBlacklist: string;
  glossaryTags: string;
}

const DEFAULT_SETTINGS: Partial<Settings> = {
  autoInsert: true,
  autoLink: false,
  wordBlacklist: "",
  fileBlacklist: "",
  glossaryTags: "glossary",
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

    new Setting(containerEl)
     .setName("Glossary tag")
     .setDesc("Files with this tag will be scraped for definitions")
     .addText((text) => {
        text
         .setPlaceholder("glossary; ...")
         .setValue(this.plugin.settings.glossaryTags)
         .onChange(async (value) => {
           this.plugin.settings.glossaryTags = value;
           await this.plugin.saveSettings();
         })
    });
  }
}

interface Definition {
  term: string;
  glossary: int;
}

export default class Gloss extends Plugin {
  settings: Settings;
  definitions: Definition[] = [];
  wordBlacklist: string[] = [];
  fileBlacklist: string[] = [];
  glossaryTags:  string[] = [];
  glossaries: TFile[] = [];

	async onload() {
    await this.loadSettings();

    // use onLayoutReady(): https://publish.obsidian.md/liam/Obsidian/API+FAQ/filesystem/getMarkdownFiles+returns+an+empty+array+in+onLoad
    this.registerEvent(this.app.workspace.onLayoutReady(() => this.populateDefinitions()));

    this.registerEvent(this.app.workspace.on('layout-change', () => {
      if (this.fileBlacklist.contains(this.app.workspace.activeEditor.file.name.toLowerCase()))
        return;

      // NOTE: sorting doesn't work when its in populateDefinitions()/onLayoutReady()... so it's here instead
      this.definitions.sort((a, b) => {
        if (a.term.length > b.term.length)
          return 1;
        else if (a.term.length < b.term.length)
          return -1;
        return 0;
      });

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
      editorCallback: (editor: Editor, view: MarkdownView) => this.processFile(editor, view, false),
    });

    this.addCommand({
      id: "destructively-insert-note-links",
      name: "Destructively insert note links",
      editorCallback: (editor: Editor, view: MarkdownView) => this.processFile(editor, view, true),
    });

    this.addCommand({
      id: "destructively-remove-glossary-links",
      name: "Destructively remove glossary links",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        for (let g = 0; g < this.glossaries.length; g++) {
          // https://regex101.com/r/lN5MkO/1
          const re = `\\[\\[${this.glossaries[g].basename}.[^\\[\\[]*\\]\\]`;
          for (let i = 0; i < editor.lineCount(); i++) {
            let line = editor.getLine(i);

            const replacees = [...line.matchAll(new RegExp(re, "gmi"))].reverse();
            for (let replacee of replacees) {
              const replaced = replacee[0].match(new RegExp(`(?<=\\|).*(?=\\]\\])`, "gmi"))[0];
              line = line.replaceAll(replacee[0], replaced);
            }

            editor.setLine(i, line);
          }
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

    this.glossaryTags = [];
    this.settings.glossaryTags.split(";").forEach((a) => this.glossaryTags.push(a.trim()));
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
          for (const tag of this.glossaryTags) {
            return fm.tags.contains(tag);
          }
        }
      }
      return false;
    });

    let g_i = 0;
    for (const g of glossaries) {
      this.glossaries.push(g);
      this.app.vault.cachedRead(g).then((result: string) => {
        const arr = [...result.matchAll(/(?<=\# )[A-Za-z].*/g)];

        for (let i = 0; i < arr.length; i++) {
          this.definitions.push({
            term: arr[i][0],
            glossary: g_i-1
          });
        }
      })
      g_i++;
    }

  }

  processFile(editor: Editor, view: MarkdownView, notes: boolean) {
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

      editor.setLine(i, notes ? this.insertNoteLinks(line) : this.insertTermLinks(line));
    }
  }

  insertNoteLinks(text: string) {
    for (const mdf of this.app.vault.getMarkdownFiles().reverse()) {
      text = this.insertLinks(text, mdf.basename, mdf.name);
      const fm = this.app.metadataCache.getFileCache(mdf).frontmatter;
      if (fm) {
        if (fm.aliases) {
          console.log(fm.aliases);
          for (const a of fm.aliases) {
            text = this.insertLinks(text, a, mdf.name);
          }
        }
      }
    }
    return text;
  }

  insertTermLinks(text: string) {
    for (const def of this.definitions.reverse()) {
      text = this.insertLinks(text, def.term, this.glossaries[def.glossary].basename + ".md#" + def.term);
    }
    return text;
  }

  insertLinks(text: string, term: string, link: string) {
    term = this.sanitise(term);
    // https://regex101.com/r/9eA7Sl/5
    // 1st capture group captures $term within wikilinks, to filter them out
    // 2nd capture group captures $term, except for within headers and tags, and including with an -ed, -es, or -s suffix to allow for plurals etc.
    const re  = `(?<=\\[\\[.*)${term}(?![^\\]\\]]*\\[\\[)(?=.*\\]\\])|((?<!\\#|^\\|.*|^\\#.*)\\b${term}[es]?s?[ed]?\\b)`;
    const replacees = [...text.matchAll(new RegExp(re, "gmi"))].reverse();

    for (let replacee of replacees) {
      // index with [1] to use 2nd capture group
      if (!replacee[1] || this.wordBlacklist.contains(replacee[1].toLowerCase()))
        continue;

      text = text.replaceAll(replacee[1], "[[" + link + "|" + replacee[1] + "]]");
    }
    return text;
  }

  sanitise(input: string) {
    return input.replace("+", "\\+").replace(".", "\\.");
  }
}
