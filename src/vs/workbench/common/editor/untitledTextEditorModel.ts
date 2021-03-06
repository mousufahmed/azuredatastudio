/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEncodingSupport, ISaveOptions } from 'vs/workbench/common/editor';
import { BaseTextEditorModel } from 'vs/workbench/common/editor/textEditorModel';
import { URI } from 'vs/base/common/uri';
import { CONTENT_CHANGE_EVENT_BUFFER_DELAY } from 'vs/platform/files/common/files';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { Event, Emitter } from 'vs/base/common/event';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IBackupFileService, IResolvedBackup } from 'vs/workbench/services/backup/common/backup';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { ITextBufferFactory } from 'vs/editor/common/model';
import { createTextBufferFactory } from 'vs/editor/common/model/textModel';
import { IResolvedTextEditorModel } from 'vs/editor/common/services/resolverService';
import { IWorkingCopyService, IWorkingCopy } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

export class UntitledTextEditorModel extends BaseTextEditorModel implements IEncodingSupport, IWorkingCopy {

	static DEFAULT_CONTENT_CHANGE_BUFFER_DELAY = CONTENT_CHANGE_EVENT_BUFFER_DELAY;

	private readonly _onDidChangeContent: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;

	private readonly _onDidChangeDirty: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeDirty: Event<void> = this._onDidChangeDirty.event;

	private readonly _onDidChangeEncoding: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeEncoding: Event<void> = this._onDidChangeEncoding.event;

	readonly capabilities = 0;

	private dirty = false;
	private versionId = 0;
	private readonly contentChangeEventScheduler = this._register(new RunOnceScheduler(() => this._onDidChangeContent.fire(), UntitledTextEditorModel.DEFAULT_CONTENT_CHANGE_BUFFER_DELAY));
	private configuredEncoding?: string;

	constructor(
		private readonly preferredMode: string | undefined,
		public readonly resource: URI,
		public readonly hasAssociatedFilePath: boolean,
		private readonly initialValue: string | undefined,
		private preferredEncoding: string | undefined,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService,
		@IBackupFileService private readonly backupFileService: IBackupFileService,
		@ITextResourceConfigurationService private readonly configurationService: ITextResourceConfigurationService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@ITextFileService private readonly textFileService: ITextFileService
	) {
		super(modelService, modeService);

		// Make known to working copy service
		this._register(this.workingCopyService.registerWorkingCopy(this));

		this.registerListeners();
	}

	private registerListeners(): void {

		// Config Changes
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChange()));
	}

	private onConfigurationChange(): void {
		const configuredEncoding = this.configurationService.getValue<string>(this.resource, 'files.encoding');

		if (this.configuredEncoding !== configuredEncoding) {
			this.configuredEncoding = configuredEncoding;

			if (!this.preferredEncoding) {
				this._onDidChangeEncoding.fire(); // do not fire event if we have a preferred encoding set
			}
		}
	}

	getVersionId(): number {
		return this.versionId;
	}

	getMode(): string | undefined {
		if (this.textEditorModel) {
			return this.textEditorModel.getModeId();
		}

		return this.preferredMode;
	}

	getEncoding(): string | undefined {
		return this.preferredEncoding || this.configuredEncoding;
	}

	setEncoding(encoding: string): void {
		const oldEncoding = this.getEncoding();
		this.preferredEncoding = encoding;

		// Emit if it changed
		if (oldEncoding !== this.preferredEncoding) {
			this._onDidChangeEncoding.fire();
		}
	}

	isDirty(): boolean {
		return this.dirty;
	}

	// {{SQL CARBON EDIT}}
	// make property public
	public setDirty(dirty: boolean): void {
		if (this.dirty === dirty) {
			return;
		}

		this.dirty = dirty;
		this._onDidChangeDirty.fire();
	}

	save(options?: ISaveOptions): Promise<boolean> {
		return this.textFileService.save(this.resource, options);
	}

	async revert(): Promise<boolean> {
		this.setDirty(false);

		// Handle content change event buffered
		this.contentChangeEventScheduler.schedule();

		return true;
	}

	backup(): Promise<void> {
		if (this.isResolved()) {
			return this.backupFileService.backupResource(this.resource, this.createSnapshot(), this.versionId);
		}

		return Promise.resolve();
	}

	hasBackup(): boolean {
		return this.backupFileService.hasBackupSync(this.resource, this.versionId);
	}

	async load(): Promise<UntitledTextEditorModel & IResolvedTextEditorModel> {

		// Check for backups first
		let backup: IResolvedBackup<object> | undefined = undefined;
		const backupResource = await this.backupFileService.loadBackupResource(this.resource);
		if (backupResource) {
			backup = await this.backupFileService.resolveBackupContent(backupResource);
		}

		// untitled associated to file path are dirty right away as well as untitled with content
		this.setDirty(this.hasAssociatedFilePath || !!backup || !!this.initialValue);

		let untitledContents: ITextBufferFactory;
		if (backup) {
			untitledContents = backup.value;
		} else {
			untitledContents = createTextBufferFactory(this.initialValue || '');
		}

		// Create text editor model if not yet done
		if (!this.textEditorModel) {
			this.createTextEditorModel(untitledContents, this.resource, this.preferredMode);
		}

		// Otherwise update
		else {
			this.updateTextEditorModel(untitledContents, this.preferredMode);
		}

		// Encoding
		this.configuredEncoding = this.configurationService.getValue<string>(this.resource, 'files.encoding');

		// We know for a fact there is a text editor model here
		const textEditorModel = this.textEditorModel!;

		// Listen to content changes
		this._register(textEditorModel.onDidChangeContent(() => this.onModelContentChanged()));

		// Listen to mode changes
		this._register(textEditorModel.onDidChangeLanguage(() => this.onConfigurationChange())); // mode change can have impact on config

		return this as UntitledTextEditorModel & IResolvedTextEditorModel;
	}

	private onModelContentChanged(): void {
		if (!this.isResolved()) {
			return;
		}

		this.versionId++;

		// mark the untitled text editor as non-dirty once its content becomes empty and we do
		// not have an associated path set. we never want dirty indicator in that case.
		if (!this.hasAssociatedFilePath && this.textEditorModel.getLineCount() === 1 && this.textEditorModel.getLineContent(1) === '') {
			this.setDirty(false);
		}

		// turn dirty otherwise
		else {
			this.setDirty(true);
		}

		// Handle content change event buffered
		this.contentChangeEventScheduler.schedule();
	}

	isReadonly(): boolean {
		return false;
	}
}
