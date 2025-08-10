import { MarkdownView, Plugin } from 'obsidian';

export default class Gloss extends Plugin {
  terms: string[] = [];

	async onload() {
    // https://publish.obsidian.md/liam/Obsidian/API+FAQ/filesystem/getMarkdownFiles+returns+an+empty+array+in+onLoad
    // grab all glossary terms
    this.app.workspace.onLayoutReady(() => {
      const mdfiles = this.app.vault.getMarkdownFiles();
      const glossary = mdfiles.find((el) => el.basename == "Glossary");

      this.app.vault.read(glossary).then((result: string) => {
        const arr = [...result.matchAll(/# [A-Za-z]+/g)];

        for (let i = 0; i < arr.length; i++) {
          this.terms.push(arr[i][0].slice(2).toLowerCase()); // slice to remove '# ' prefix
        }
      })
    })

    this.addCommand({
      id: "gloss-insert-terms",
      name: "Insert Glossary Terms",
      checkCallback: (checking: boolean) => {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView.getMode() == 'preview') {
          if (!checking) {
            this.insertTerms();
          }
          return true
        }
      }
    });
	}

  insertTerms() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const renderer = view.previewMode.renderer;

    for (const term of this.terms) {
      renderer.set(renderer.text.replaceAll(term, "[[glossary.md#" + term + "|" + term + "]]"))
    }
  }
}
