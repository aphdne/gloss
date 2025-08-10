import { MarkdownView, Plugin } from 'obsidian';

/*
 * TODO: automatic glossary term insertion (without a command)
 * TODO: support multiple glossary files
*/

export default class Gloss extends Plugin {
  terms: string[] = [];

	async onload() {
    // https://publish.obsidian.md/liam/Obsidian/API+FAQ/filesystem/getMarkdownFiles+returns+an+empty+array+in+onLoad
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
            this.terms.push(arr[i][0].toLowerCase()); // slice to remove '# ' prefix
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
    for (const term of this.terms) {
      // https://forum.obsidian.md/t/is-there-a-pre-render-pre-processor-callback/72530/5
      // replace plural
      text = text.replaceAll(new RegExp(`${term + "s"}(?!\\]|\\||s)`, "g"), "[[glossary.md#" + term + "|" + term + "s]]");
      // replace singular
      text = text.replaceAll(new RegExp(`${term}(?!\\]|\\||s)`, "g"), "[[glossary.md#" + term + "|" + term + "]]");
    }
    renderer.set(text);
  }
}
