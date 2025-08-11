import { MarkdownView, Plugin } from 'obsidian';

/*
 * TODO: automatic glossary term insertion (without a command)
 * BUG: rendered text affecting underlying markdown file
*/

interface Definition {
  term: string;
  glossary: string;
}

export default class Gloss extends Plugin {
  definitions: Definition[] = [];

	async onload() {
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

    this.registerEvent(this.app.workspace.on('layout-change', () => {
      const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (markdownView && markdownView.getMode() == 'preview') {
        this.insertTerms();
      }
    }));


    this.addCommand({
      id: "gloss-insert-terms",
      name: "Insert Glossary Terms",
      checkCallback: (checking: boolean) => {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView && markdownView.getMode() == 'preview') {
          if (!checking) {
            this.insertTerms();
          }
          return true
        }
      }
    });
	}

  insertTerms() {
    const renderer = this.app.workspace.getActiveViewOfType(MarkdownView).previewMode.renderer;

    let text = renderer.text;
    for (const def of this.definitions) {
      // regex: case-insensitive keyword search, with or without an 's' or 'es' at the end (for plurals)
      const to_be_replaced = [...text.matchAll(new RegExp(`${def.term}e?s?`, "gmi"))].reverse();
      for (const replacee of to_be_replaced) {
        // regex: check if the term is within a markdown link or not, as to not replace terms within links recursively
        text = text.replaceAll(new RegExp(`(?<!\\# )${replacee[0]}(?!\\]|\\||s)`, "gm"), "[[" + def.glossary + ".md#" + def.term + "|" + replacee[0] + "]]");
      }
    }
    // https://forum.obsidian.md/t/is-there-a-pre-render-pre-processor-callback/72530/5
    renderer.set(text);
  }
}
