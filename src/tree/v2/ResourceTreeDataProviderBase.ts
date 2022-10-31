/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ResourceBase, ResourceModelBase } from '../../api/v2/v2AzureResourcesApi';
import { InternalTreeView } from './createTreeView';
import { ResourceGroupsItem } from './ResourceGroupsItem';
import { ResourceGroupsItemCache } from './ResourceGroupsItemCache';

type RevealOptions = Parameters<vscode.TreeView<ResourceGroupsItem>['reveal']>['1'];

export abstract class ResourceTreeDataProviderBase extends vscode.Disposable implements vscode.TreeDataProvider<ResourceGroupsItem> {
    private readonly branchTreeDataChangeSubscription: vscode.Disposable;
    private readonly refreshSubscription: vscode.Disposable;
    private readonly resourceProviderManagerListener: vscode.Disposable;
    protected readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void | ResourceGroupsItem | ResourceGroupsItem[] | null | undefined>();
    private readonly gatedOnDidChangeTreeDataEmitter = new vscode.EventEmitter<void | ResourceGroupsItem | ResourceGroupsItem[] | null | undefined>();

    private isRevealing: boolean = false;

    async reveal(treeView: InternalTreeView, element: ResourceGroupsItem, options?: RevealOptions): Promise<void> {
        try {
            this.isRevealing = true;
            await treeView._reveal(element, options);
        } finally {
            this.isRevealing = false;
        }
    }

    constructor(
        protected readonly itemCache: ResourceGroupsItemCache,
        onDidChangeBranchTreeData: vscode.Event<void | ResourceModelBase | ResourceModelBase[] | null | undefined>,
        onDidChangeResource: vscode.Event<ResourceBase | undefined>,
        onRefresh: vscode.Event<void>,
        callOnDispose?: () => void) {
        super(
            () => {
                callOnDispose?.();

                this.branchTreeDataChangeSubscription.dispose();
                this.refreshSubscription.dispose();
                this.resourceProviderManagerListener.dispose();
            });

        this.branchTreeDataChangeSubscription = onDidChangeBranchTreeData(
            (e: void | ResourceModelBase | ResourceModelBase[] | null | undefined) => {
                const rgItems: ResourceGroupsItem[] = [];

                // eslint-disable-next-line no-extra-boolean-cast
                if (!!e) {
                    // e was defined, either a single item or array
                    // Make an array for consistency
                    const branchItems: unknown[] = Array.isArray(e) ? e : [e];

                    for (const branchItem of branchItems) {
                        const rgItem = this.itemCache.getItemForBranchItem(branchItem);

                        if (rgItem) {
                            rgItems.push(rgItem);
                        }
                    }
                    this.onDidChangeTreeDataEmitter.fire(rgItems);
                } else {
                    // e was null/undefined/void
                    // Translate it to fire on all elements for this branch data provider
                    // TODO
                    this.onDidChangeTreeDataEmitter.fire();
                }
            });

        this.refreshSubscription = onRefresh(() => () => this.onDidChangeTreeDataEmitter.fire());

        // TODO: If only individual resources change, just update the tree related to those resources.
        this.resourceProviderManagerListener = onDidChangeResource(() => this.onDidChangeTreeDataEmitter.fire());

        this.onDidChangeTreeDataEmitter.event((e) => {
            if (!this.isRevealing) {
                this.gatedOnDidChangeTreeDataEmitter.fire(e);
                console.log(this.constructor.name, 'fired onDidChangeTreeData', e);
            } else {
                console.log(this.constructor.name, 'suppressed onDidChangeTreeData', e);
            }
        });
    }

    onDidChangeTreeData: vscode.Event<void | ResourceGroupsItem | ResourceGroupsItem[] | null | undefined> = this.gatedOnDidChangeTreeDataEmitter.event;

    async getTreeItem(element: ResourceGroupsItem): Promise<vscode.TreeItem> {
        // TODO: do we need this?
        if (this.itemCache.getItemForBranchItem(element)) {
            throw new Error('getTreeItem was passed a branch item');
        }
        const item = this.itemCache.getItemForBranchItem(element) ?? element;

        const t = await item.getTreeItem();
        t.id = this.itemCache.getId(item);
        t.tooltip = t.id;
        return t;
    }

    async getChildren(element?: ResourceGroupsItem | undefined): Promise<ResourceGroupsItem[] | null | undefined> {
        return this.cacheGetChildren(element, () => this.onGetChildren(element));
    }

    getParent(element: ResourceGroupsItem): ResourceGroupsItem | undefined {
        return this.itemCache.getParentForItem(element);
    }

    // setting to true makes reveal work
    async findItem(id: string): Promise<ResourceGroupsItem | undefined> {
        let element: ResourceGroupsItem | undefined = undefined;

        outerLoop: while (true) {

            const cachedChildren = this.itemCache.getChildrenForItem(element);
            const children: ResourceGroupsItem[] | null | undefined = cachedChildren?.length ? cachedChildren : await this.getChildren(element);

            if (!children) {
                return;
            }

            for (const child of children) {
                if (this.itemCache.getId(child) === id) {
                    return child;
                } else if (this.itemCache.isAncestorOf(child, id)) {
                    element = child;
                    continue outerLoop;
                }
            }

            return undefined;
        }
    }

    protected abstract onGetChildren(element?: ResourceGroupsItem | undefined): Promise<ResourceGroupsItem[] | null | undefined>;

    private async cacheGetChildren(element: ResourceGroupsItem | undefined, getChildren: () => Promise<ResourceGroupsItem[] | null | undefined>) {
        if (element) {
            // TODO: Do we really need to evict before generating new children, or can we just update after the fact?
            //       Since the callback is async, could change notifications show up while doing this?
            if (!this.isRevealing) {
                this.itemCache.evictItemChildren(element);
            }
        } else {
            // this is being called while VS Code is processing a reveal call, making the reveal fail
            if (!this.isRevealing) {
                this.itemCache.evictAll();
            }
        }

        const children = await getChildren();

        if (children) {
            if (element) {
                this.itemCache.updateItemChildren(element, children);
            } else {
                children.forEach(child => this.itemCache.addRootItem(child, []));
            }
        }

        return children;
    }
}
