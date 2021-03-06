/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as marked from 'vs/base/common/marked/marked';
import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { MarkdownString } from 'vs/base/common/htmlContent';

suite('MarkdownRenderer', () => {
	suite('Images', () => {

		test('image rendering conforms to default', () => {
			const markdown = { value: `![image](someimageurl 'caption')` };
			const result: HTMLElement = renderMarkdown(markdown);
			const renderer = new marked.Renderer();
			const imageFromMarked = marked(markdown.value, {
				sanitize: true,
				renderer
			}).trim();
			assert.strictEqual(result.innerHTML, imageFromMarked);
		});

		test('image rendering conforms to default without title', () => {
			const markdown = { value: `![image](someimageurl)` };
			const result: HTMLElement = renderMarkdown(markdown);
			const renderer = new marked.Renderer();
			const imageFromMarked = marked(markdown.value, {
				sanitize: true,
				renderer
			}).trim();
			assert.strictEqual(result.innerHTML, imageFromMarked);
		});

		test('image width from title params', () => {
			let result: HTMLElement = renderMarkdown({ value: `![image](someimageurl|width=100 'caption')` });
			assert.strictEqual(result.innerHTML, `<p><img src="someimageurl" alt="image" title="caption" width="100"></p>`);
		});

		test('image height from title params', () => {
			let result: HTMLElement = renderMarkdown({ value: `![image](someimageurl|height=100 'caption')` });
			assert.strictEqual(result.innerHTML, `<p><img src="someimageurl" alt="image" title="caption" height="100"></p>`);
		});

		test('image width and height from title params', () => {
			let result: HTMLElement = renderMarkdown({ value: `![image](someimageurl|height=200,width=100 'caption')` });
			assert.strictEqual(result.innerHTML, `<p><img src="someimageurl" alt="image" title="caption" width="100" height="200"></p>`);
		});

	});

	suite('ThemeIcons Support On', () => {

		test('render appendText', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true });
			mds.appendText('$(zap) $(dont match me)');

			let result: HTMLElement = renderMarkdown(mds);
			assert.strictEqual(result.innerHTML, `<p><span class="codicon codicon-zap"></span> $(dont match me)</p>`);
		});

		test('render appendText escaped', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true });
			mds.appendText(MarkdownString.escapeThemeIcons('$(zap) $(dont match me)'));

			let result: HTMLElement = renderMarkdown(mds);
			assert.strictEqual(result.innerHTML, `<p>$(zap) $(dont match me)</p>`);
		});

		test('render appendMarkdown', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true });
			mds.appendMarkdown('$(zap) $(dont match me)');

			let result: HTMLElement = renderMarkdown(mds);
			assert.strictEqual(result.innerHTML, `<p><span class="codicon codicon-zap"></span> $(dont match me)</p>`);
		});

		test('render appendMarkdown escaped', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true });
			mds.appendMarkdown(MarkdownString.escapeThemeIcons('$(zap) $(dont match me)'));

			let result: HTMLElement = renderMarkdown(mds);
			assert.strictEqual(result.innerHTML, `<p>$(zap) $(dont match me)</p>`);
		});

	});

	suite('ThemeIcons Support Off', () => {

		test('render appendText', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: false });
			mds.appendText('$(zap) $(dont match me)');

			let result: HTMLElement = renderMarkdown(mds);
			assert.strictEqual(result.innerHTML, `<p>$(zap) $(dont match me)</p>`);
		});

		test('render appendMarkdown', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: false });
			mds.appendMarkdown('$(zap) $(dont match me)');

			let result: HTMLElement = renderMarkdown(mds);
			assert.strictEqual(result.innerHTML, `<p>$(zap) $(dont match me)</p>`);
		});

	});

});
