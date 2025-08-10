import { MarkdownView, Plugin } from 'obsidian';

/*
 * TODO: automatic glossary term insertion (without a command)
*/

interface Definition {
  term: string;
  glossary: string;
}

export default class Gloss extends Plugin {
  definitions: Definition[] = [];

	async onload() {
    // use onLayoutReady(): https://publish.obsidian.md/liam/Obsidian/API+FAQ/filesystem/getMarkdownFiles+returns+an+empty+array+in+onLoad
    // grab all glossary terms
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
      // https://forum.obsidian.md/t/is-there-a-pre-render-pre-processor-callback/72530/5
      text = this.replaceTerm(text, def, def.term + "s");
      text = this.replaceTerm(text, def, def.term.toLowerCase() + "s");
      text = this.replaceTerm(text, def, def.term.toLowerCase());
      text = this.replaceTerm(text, def, def.term);
    }
    renderer.set(text);
  }

  replaceTerm(input: string, def: Definition, keyword: string) {
    return input.replaceAll(new RegExp(`${keyword}(?!\\]|\\||s)`, "g"), "[[" + def.glossary + ".md#" + def.term + "|" + keyword + "]]");
  }
}
