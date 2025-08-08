import { Plugin } from 'obsidian';

export default class Gloss extends Plugin {
  terms: string[] = [];

	async onload() {
    // https://publish.obsidian.md/liam/Obsidian/API+FAQ/filesystem/getMarkdownFiles+returns+an+empty+array+in+onLoad
    this.app.workspace.onLayoutReady(() => {
      const mdfiles = this.app.vault.getMarkdownFiles();
      const glossary = mdfiles.find((el) => el.basename == "Glossary");

      this.app.vault.read(glossary).then((result) => {
        const arr = [...result.matchAll(/# [A-Za-z]+/g)];

        for (let i = 0; i < arr.length; i++) {
          this.terms.push(arr[i][0].slice(2));
        }
      })

      // console.log(this.terms);
    })
	}

	onunload() {
	}
}
